/**
 * The admin-panel IP allowlist (STEP 19). Pure, edge-safe, no imports: the
 * proxy runs it on every /admin and /api/admin request, and the server-side
 * guards in rbac.ts run it again behind the proxy (guard layer 2 of 4), so
 * one module owns the parsing and the decision.
 *
 * THE OPTION. `ADMIN_IP_ALLOWLIST` is a comma- or whitespace-separated list
 * of IPv4/IPv6 addresses and CIDR blocks. Unset or blank means the allowlist
 * is OFF and the panel is reachable from anywhere a session and a role let
 * it be, which is the state every environment is in today. Set, it is a
 * perimeter in front of the role gate: an address outside it gets a 403
 * before the session is even read.
 *
 * FAIL CLOSED, TWICE. A list that is set but parses to nothing (a typo in
 * the one entry) denies everyone rather than quietly switching the
 * perimeter off; the operator sees it on the next panel visit and fixes the
 * variable. A request with no client address at all is denied the same way:
 * an allowlist that lets "unknown" through is a list anyone can be on.
 *
 * ADDRESS FORMS. IPv4-mapped IPv6 (`::ffff:203.0.113.7`) is folded to the
 * IPv4 it carries, so a v4 entry matches a client that some proxy presented
 * in mapped form. Zone ids (`fe80::1%eth0`) are rejected: they are
 * link-local and never a real client. Bytes rather than BigInt so the
 * arithmetic is identical on ES2017 and on the edge runtime.
 */

export type AddressFamily = 4 | 6

export type ParsedAddress = { family: AddressFamily; bytes: Uint8Array }

export type AllowlistEntry = ParsedAddress & { prefix: number; source: string }

export type ParsedAllowlist = { entries: AllowlistEntry[]; rejected: string[] }

export type AllowlistDecision = 'open' | 'allow' | 'deny'

const V4_OCTET = /^(0|[1-9]\d{0,2})$/
const V6_GROUP = /^[0-9a-f]{1,4}$/i

function parseV4(raw: string): Uint8Array | null {
  const parts = raw.split('.')
  if (parts.length !== 4) return null
  const bytes = new Uint8Array(4)
  for (let i = 0; i < 4; i += 1) {
    const part = parts[i] ?? ''
    if (!V4_OCTET.test(part)) return null
    const value = Number(part)
    if (value > 255) return null
    bytes[i] = value
  }
  return bytes
}

function parseV6(raw: string): Uint8Array | null {
  if (raw.includes('%')) return null
  const halves = raw.split('::')
  if (halves.length > 2) return null

  const groupsOf = (text: string): number[] | null => {
    if (text === '') return []
    const parts = text.split(':')
    const out: number[] = []
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i] ?? ''
      // A dotted quad may close the address (::ffff:1.2.3.4, 64:ff9b::1.2.3.4).
      if (i === parts.length - 1 && part.includes('.')) {
        const v4 = parseV4(part)
        if (!v4) return null
        out.push(((v4[0] ?? 0) << 8) | (v4[1] ?? 0), ((v4[2] ?? 0) << 8) | (v4[3] ?? 0))
        continue
      }
      if (!V6_GROUP.test(part)) return null
      out.push(Number.parseInt(part, 16))
    }
    return out
  }

  const head = groupsOf(halves[0] ?? '')
  if (!head) return null
  let groups: number[]
  if (halves.length === 2) {
    const tail = groupsOf(halves[1] ?? '')
    if (!tail) return null
    const missing = 8 - head.length - tail.length
    if (missing < 1) return null
    groups = [...head, ...new Array<number>(missing).fill(0), ...tail]
  } else {
    groups = head
  }
  if (groups.length !== 8) return null

  const bytes = new Uint8Array(16)
  groups.forEach((group, i) => {
    bytes[i * 2] = group >> 8
    bytes[i * 2 + 1] = group & 0xff
  })
  return bytes
}

/** An IPv4-mapped IPv6 address (::ffff:0:0/96) folded back to its IPv4. */
function unmapV4(bytes: Uint8Array): Uint8Array | null {
  for (let i = 0; i < 10; i += 1) if (bytes[i] !== 0) return null
  if (bytes[10] !== 0xff || bytes[11] !== 0xff) return null
  return bytes.slice(12, 16)
}

export function parseAddress(raw: string | null | undefined): ParsedAddress | null {
  const text = (raw ?? '').trim()
  if (text === '') return null
  if (text.includes(':')) {
    const bytes = parseV6(text)
    if (!bytes) return null
    const mapped = unmapV4(bytes)
    return mapped ? { family: 4, bytes: mapped } : { family: 6, bytes }
  }
  const bytes = parseV4(text)
  return bytes ? { family: 4, bytes } : null
}

/** One token of the list: an address, or address/prefix. */
export function parseAllowlistEntry(raw: string): AllowlistEntry | null {
  const source = raw.trim()
  if (source === '') return null
  const slash = source.indexOf('/')
  const addressText = slash === -1 ? source : source.slice(0, slash)
  const prefixText = slash === -1 ? null : source.slice(slash + 1)
  const address = parseAddress(addressText)
  if (!address) return null
  const maxPrefix = address.family === 4 ? 32 : 128
  if (prefixText === null) return { ...address, prefix: maxPrefix, source }
  if (!/^\d{1,3}$/.test(prefixText)) return null
  const prefix = Number(prefixText)
  if (prefix > maxPrefix) return null
  return { ...address, prefix, source }
}

/**
 * Splits the variable on commas, whitespace and newlines. Every token is
 * either an entry or a rejection; the caller decides what a rejection means
 * (the proxy logs it once, the decision below fails closed on an empty
 * result of a non-empty list).
 */
export function parseAllowlist(raw: string | null | undefined): ParsedAllowlist {
  const entries: AllowlistEntry[] = []
  const rejected: string[] = []
  for (const token of (raw ?? '').split(/[\s,]+/)) {
    if (token === '') continue
    const entry = parseAllowlistEntry(token)
    if (entry) entries.push(entry)
    else rejected.push(token)
  }
  return { entries, rejected }
}

export function addressMatches(address: ParsedAddress, entry: AllowlistEntry): boolean {
  if (address.family !== entry.family) return false
  const wholeBytes = entry.prefix >> 3
  for (let i = 0; i < wholeBytes; i += 1) {
    if (address.bytes[i] !== entry.bytes[i]) return false
  }
  const remainingBits = entry.prefix & 7
  if (remainingBits === 0) return true
  const mask = (0xff << (8 - remainingBits)) & 0xff
  return ((address.bytes[wholeBytes] ?? 0) & mask) === ((entry.bytes[wholeBytes] ?? 0) & mask)
}

export function isAllowedAddress(
  address: string | null | undefined,
  entries: AllowlistEntry[],
): boolean {
  const parsed = parseAddress(address)
  if (!parsed) return false
  return entries.some((entry) => addressMatches(parsed, entry))
}

/** True when the variable carries anything at all, valid or not. */
export function isAllowlistConfigured(raw: string | null | undefined): boolean {
  return (raw ?? '').trim() !== ''
}

/**
 * The decision both layers act on.
 *
 *   'open'   no list configured: the perimeter does not exist
 *   'allow'  the address is on the list
 *   'deny'   a list exists and the address is not on it, is unreadable, or
 *            the list itself parsed to nothing
 */
export function adminAllowlistDecision(
  address: string | null | undefined,
  raw: string | null | undefined,
): AllowlistDecision {
  if (!isAllowlistConfigured(raw)) return 'open'
  const { entries } = parseAllowlist(raw)
  if (entries.length === 0) return 'deny'
  return isAllowedAddress(address, entries) ? 'allow' : 'deny'
}

/** Paths the perimeter covers: the panel, its MFA page, and its API. */
export function isAdminPerimeterPath(pathname: string): boolean {
  return pathname.startsWith('/admin') || pathname.startsWith('/api/admin/')
}
