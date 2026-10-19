import { createHmac, timingSafeEqual } from 'node:crypto'
import { isValidVoucherCode, normalizeVoucherCode } from './code'

/**
 * QR payload for a voucher:
 *   KEV1.<base64url(JSON payload)>.<base64url(HMAC-SHA256)>
 *
 * The MAC covers the full `KEV1.<payload>` prefix, so the version byte cannot
 * be swapped without breaking the signature. The payload proves the QR was
 * minted by the platform; it is NOT an authorization token. Single use is
 * decided by the database, never by possession of a valid payload.
 *
 * Authoritative document: ARCHITECTURE-VOUCHER-REDEMPTION.md section 4.1.
 * This intentionally does NOT reuse src/server/domain/orders/redemption.ts,
 * whose digest is a bare unsigned sha256 (forgeable by anyone with the repo).
 */

const VERSION_PREFIX = 'KEV1'

export interface VoucherQrPayload {
  /** schema version */
  v: 1
  /** voucher short code */
  c: string
  /** supplier id */
  s: string
  /** owning user id */
  u: string
  /** expiry, unix seconds */
  e: number
  /** signing key id, for rotation */
  k: string
}

export class VoucherQrSecretMissingError extends Error {
  constructor() {
    super('VOUCHER_QR_SECRET is not set; refusing to sign or verify voucher QR payloads')
    this.name = 'VoucherQrSecretMissingError'
  }
}

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

function primarySecret(): string {
  const secret = process.env.VOUCHER_QR_SECRET
  if (!secret || secret.length < 16) throw new VoucherQrSecretMissingError()
  return secret
}

/** Verify-time secrets: current first, then the previous one for rotation. */
function verificationSecrets(): string[] {
  const secrets = [primarySecret()]
  const previous = process.env.VOUCHER_QR_SECRET_PREVIOUS
  if (previous && previous.length >= 16) secrets.push(previous)
  return secrets
}

function sign(signingInput: string, secret: string): string {
  return createHmac('sha256', secret).update(signingInput).digest('base64url')
}

export function signVoucherQrPayload(payload: Omit<VoucherQrPayload, 'v'> & { v?: 1 }): string {
  const full: VoucherQrPayload = { ...payload, v: 1 }
  const body = base64UrlEncode(JSON.stringify(full))
  const signingInput = `${VERSION_PREFIX}.${body}`
  const mac = sign(signingInput, primarySecret())
  return `${signingInput}.${mac}`
}

/**
 * Returns the parsed payload only when the signature matches under some
 * accepted secret (constant-time compare on equal-length buffers). Never
 * throws on a bad payload; returns null. Throws only when no secret is
 * configured, which is an operator error, not an attacker input.
 */
export function verifyVoucherQrPayload(token: string): VoucherQrPayload | null {
  if (typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [prefix, body, mac] = parts
  if (prefix !== VERSION_PREFIX || !body || !mac) return null

  const signingInput = `${prefix}.${body}`
  const provided = Buffer.from(mac)

  const matches = verificationSecrets().some((secret) => {
    const expected = Buffer.from(sign(signingInput, secret))
    return expected.length === provided.length && timingSafeEqual(expected, provided)
  })
  if (!matches) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return null
  }

  if (!isWellFormed(parsed)) return null
  return parsed
}

/** A token is one of exactly three things, and two of them are not the same. */
export type VoucherQrCheck =
  | { status: 'verified'; payload: VoucherQrPayload }
  | { status: 'forged' }
  | { status: 'unverifiable'; error: VoucherQrSecretMissingError }

/**
 * The three-way answer, for callers that must tell a bad token from a broken
 * verifier.
 *
 * WHY THIS EXISTS RATHER THAN A TRY/CATCH AT EACH CALL SITE. `forged` and
 * `unverifiable` look alike and must never be handled alike:
 *
 *   forged        a permanent property of the token. The till DISCARDS it -
 *                 `drainQueue` clears anything not returned as an error,
 *                 because "a signature does not become valid later".
 *   unverifiable  a property of THIS SERVER, right now, with no secret
 *                 configured. It becomes valid the moment an operator sets
 *                 VOUCHER_QR_SECRET.
 *
 * Conflating them destroys money: a queue of genuine offline redemptions,
 * scanned at a till while the deployment was missing its secret, would each be
 * marked an invalid signature and dropped, and the customers had already paid.
 *
 * MEASURED, 2026-09-08, 28 events over seven days: `verifyVoucherQrPayload`
 * throws on any well-formed-looking token when the secret is absent, and both
 * call sites let it escape - so a cashier scanning a real voucher got a crash
 * page, and any bot walking /redeem/<junk> raised a server exception. Note that
 * a token with the wrong shape returns null before the secret is read, so this
 * only bites the tokens that look real.
 */
export function classifyVoucherQrPayload(token: string): VoucherQrCheck {
  try {
    const payload = verifyVoucherQrPayload(token)
    return payload ? { status: 'verified', payload } : { status: 'forged' }
  } catch (error) {
    if (error instanceof VoucherQrSecretMissingError) return { status: 'unverifiable', error }
    throw error
  }
}

/**
 * Whether this server can verify a QR token at all.
 *
 * For the batch route, which decides ONCE for a whole queue: it must refuse the
 * request before the loop touches the database, the same way its rate limit
 * does, so a batch is never half-burned.
 */
export function canVerifyVoucherQr(): boolean {
  try {
    primarySecret()
    return true
  } catch (error) {
    if (error instanceof VoucherQrSecretMissingError) return false
    throw error
  }
}

function isWellFormed(value: unknown): value is VoucherQrPayload {
  if (typeof value !== 'object' || value === null) return false
  const p = value as Record<string, unknown>
  if (p.v !== 1) return false
  if (typeof p.c !== 'string' || !isValidVoucherCode(normalizeVoucherCode(p.c))) return false
  if (typeof p.s !== 'string' || p.s.length === 0) return false
  if (typeof p.u !== 'string' || p.u.length === 0) return false
  if (typeof p.k !== 'string' || p.k.length === 0) return false
  if (typeof p.e !== 'number' || !Number.isSafeInteger(p.e) || p.e <= 0) return false
  return true
}
