/**
 * The operator's blocklist (section 57, migration 234): the one fraud rule
 * that refuses outright. docs/FRAUD.md draws the line as "velocity refuses,
 * the score never" because a refusal must be countable and explainable; a
 * blocklist row is exactly that -- one typed value, one typed reason.
 *
 * This module holds what both sides share: how a value is normalised before
 * it is stored or looked up, and what the customer is told. It never talks to
 * the database.
 */

export const BLOCKLIST_KINDS = ['email', 'phone', 'ip', 'card_fingerprint'] as const
export type BlocklistKind = (typeof BLOCKLIST_KINDS)[number]

export const BLOCKLIST_KIND_LABEL_HE: Record<BlocklistKind, string> = {
  email: 'אימייל',
  phone: 'טלפון',
  ip: 'כתובת IP',
  card_fingerprint: 'טביעת כרטיס',
}

export const MAX_REASON_LENGTH = 500
export const MAX_EXPIRY_DAYS = 3650

export function isBlocklistKind(raw: unknown): raw is BlocklistKind {
  return typeof raw === 'string' && (BLOCKLIST_KINDS as readonly string[]).includes(raw)
}

/**
 * The stored and looked-up form of a value. A blocklist that keeps
 * `Dana@Example.com` and looks up `dana@example.com` blocks nobody, so both
 * sides normalise through this one function.
 */
export function normalizeBlockValue(kind: BlocklistKind, raw: unknown): string | null {
  const value = String(raw ?? '').trim()
  if (value.length === 0) return null
  switch (kind) {
    case 'email': {
      const lower = value.toLowerCase()
      return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(lower) ? lower : null
    }
    case 'phone': {
      // Digits only, Israeli local form: +972-52-463-5550 and 052-4635550 are
      // one number and must be one row.
      let digits = value.replace(/\D/g, '')
      if (digits.startsWith('972')) digits = `0${digits.slice(3)}`
      return /^0\d{8,9}$/.test(digits) ? digits : null
    }
    case 'ip': {
      const ip = value.replace(/^::ffff:/i, '')
      return /^[0-9a-f.:]{3,45}$/i.test(ip) ? ip.toLowerCase() : null
    }
    case 'card_fingerprint':
      return value.length <= 200 ? value : null
  }
}

export type BlocklistRow = {
  kind: string
  value: string
  reason: string
  expires_at: string | null
  removed_at: string | null
}

/** Active now: not removed and not expired. */
export function isBlockActive(row: BlocklistRow, now: Date): boolean {
  if (row.removed_at) return false
  if (row.expires_at && new Date(row.expires_at).getTime() <= now.getTime()) return false
  return true
}

/**
 * What the customer sees. Deliberately the same sentence for every kind and
 * every reason: the reason is for the operator, and a message that names
 * the matched value teaches a fraudster which of their details to change.
 */
export const BLOCKED_MESSAGE_HE = 'לא ניתן להשלים את ההזמנה מהחשבון הזה. לעזרה פנו לשירות הלקוחות.'

export type BlocklistDecision =
  | { blocked: false }
  | { blocked: true; kind: BlocklistKind; reason: string; message: string }

export function blocklistDecision(matches: BlocklistRow[], now: Date): BlocklistDecision {
  const active = matches.filter((row) => isBlockActive(row, now) && isBlocklistKind(row.kind))
  const first = active[0]
  if (!first || !isBlocklistKind(first.kind)) return { blocked: false }
  return { blocked: true, kind: first.kind, reason: first.reason, message: BLOCKED_MESSAGE_HE }
}

/** `expires_at` for a block that lasts `days` from now, or null for no expiry. */
export function expiryFor(days: unknown, now: Date): string | null | undefined {
  const text = String(days ?? '').trim()
  if (text === '') return null
  const n = Number(text)
  if (!Number.isInteger(n) || n < 1 || n > MAX_EXPIRY_DAYS) return undefined
  return new Date(now.getTime() + n * 86_400_000).toISOString()
}
