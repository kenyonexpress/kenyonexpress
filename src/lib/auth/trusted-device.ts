import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * "Remember this device" for the TOTP challenge (STEP 18).
 *
 * A successful aal2 verify with the box ticked seals `{userId, expiresAt}`
 * into an httpOnly cookie for 30 days. The staff gate (`lib/admin/rbac.ts`)
 * treats a cookie that opens FOR THE SIGNED-IN USER as an already-passed
 * challenge. The HMAC secret is the same server-only key the passkey
 * ceremony uses, so the browser is a courier and not an author: an edited
 * or forged payload fails `timingSafeEqual` before anything is trusted.
 *
 * The cookie is bound to a user id, not to a session: a second account on
 * the same browser still faces its own challenge. Pure, with secret and
 * clock as parameters, so the tests need no env and no cookie store.
 */

export const TRUSTED_DEVICE_COOKIE = 'ke-trusted-device'

/** Thirty days, the lifetime the goal fixed. */
export const TRUSTED_DEVICE_TTL_MS = 30 * 24 * 60 * 60_000

export interface TrustedDevicePayload {
  userId: string
  expiresAt: number
}

function sign(body: string, secret: string): Buffer {
  return createHmac('sha256', `ke-trusted-device:${secret}`).update(body).digest()
}

export function sealTrustedDevice(payload: TrustedDevicePayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${sign(body, secret).toString('base64url')}`
}

/**
 * Null on ANY defect (tampered, expired, malformed) with no distinction,
 * for the same reason as the passkey challenge: the answer to all three is
 * "challenge again", and a distinction only tells a forger what failed.
 */
export function openTrustedDevice(
  sealed: string,
  secret: string,
  now: number = Date.now(),
): TrustedDevicePayload | null {
  const dot = sealed.indexOf('.')
  if (dot <= 0) return null
  const body = sealed.slice(0, dot)
  const mac = sealed.slice(dot + 1)

  let given: Buffer
  try {
    given = Buffer.from(mac, 'base64url')
  } catch {
    return null
  }
  const expected = sign(body, secret)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null

  let payload: unknown
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (!isPayload(payload)) return null
  if (payload.expiresAt <= now) return null
  return payload
}

/** The gate's one sentence: a cookie counts only for the user it names. */
export function isDeviceTrustedFor(
  sealed: string | null | undefined,
  userId: string,
  secret: string | null,
  now: number = Date.now(),
): boolean {
  if (!sealed || !secret) return false
  const payload = openTrustedDevice(sealed, secret, now)
  return payload !== null && payload.userId === userId
}

function isPayload(value: unknown): value is TrustedDevicePayload {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.userId === 'string' && v.userId.length > 0 && typeof v.expiresAt === 'number'
}
