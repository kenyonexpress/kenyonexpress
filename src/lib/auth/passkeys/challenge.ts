import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * The WebAuthn challenge, sealed into a cookie instead of a table.
 *
 * A ceremony is two server actions with a browser prompt in between, so the
 * challenge issued by the first must reach the second untouched. Storing it
 * server-side would need a table that does not exist until migration 178 is
 * applied (Ofir's call, not this session's), plus an expiry sweep; a sealed
 * httpOnly cookie needs neither, and the HMAC makes the client a courier, not
 * an author: a forged or edited payload fails `timingSafeEqual` and the
 * ceremony dies before any signature is checked.
 *
 * Everything here is pure (secret and clock are parameters) so the tests need
 * no env and no cookie store. The server actions own both.
 */

export type ChallengeType = 'registration' | 'authentication'

export interface ChallengePayload {
  challenge: string
  type: ChallengeType
  /** Bound at registration (the session that asked), null for login. */
  userId: string | null
  expiresAt: number
}

export const PASSKEY_CHALLENGE_COOKIE = 'ke-passkey-challenge'

/**
 * Five minutes. The prompt is one Face ID glance; what this bounds is a
 * captured cookie's usefulness, not a slow customer.
 */
export const PASSKEY_CHALLENGE_TTL_MS = 5 * 60_000

/** 32 random bytes, base64url: the size the WebAuthn spec recommends. */
export function newChallenge(): string {
  return randomBytes(32).toString('base64url')
}

function sign(body: string, secret: string): Buffer {
  return createHmac('sha256', `ke-passkey-challenge:${secret}`).update(body).digest()
}

export function sealChallenge(payload: ChallengePayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${sign(body, secret).toString('base64url')}`
}

/**
 * Verifies the seal and the clock, or returns null. Null on ANY defect,
 * with no distinction between tampered, expired and malformed: the caller's
 * answer to all three is the same "start over", and a distinction would only
 * tell a forger which part of their forgery failed.
 */
export function openChallenge(
  sealed: string,
  secret: string,
  now: number = Date.now(),
): ChallengePayload | null {
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
  if (!isChallengePayload(payload)) return null
  if (payload.expiresAt <= now) return null
  return payload
}

function isChallengePayload(value: unknown): value is ChallengePayload {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.challenge === 'string' &&
    v.challenge.length > 0 &&
    (v.type === 'registration' || v.type === 'authentication') &&
    (typeof v.userId === 'string' || v.userId === null) &&
    typeof v.expiresAt === 'number'
  )
}
