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
