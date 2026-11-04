import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'

/**
 * A stateless, signed OTP challenge for the WhatsApp sign-in (S19).
 *
 * WHY OUR OWN CODE AND NOT SUPABASE'S. Measured 04.11 against production
 * `/auth/v1/settings`: the phone provider is OFF, so `signInWithOtp({ phone })`
 * cannot issue a code at all. Meta Cloud API only delivers a message; it does
 * not generate or check codes. So the code is made here and the proof that it
 * was made here is an HMAC the customer's browser carries back in an httpOnly
 * cookie.
 *
 * NO TABLE, AND THAT IS THE POINT. A row per code would need a migration and a
 * cleanup job. The challenge holds only the subject (the E.164 number) and the
 * expiry, and the MAC binds them to the code. The code itself is never stored
 * anywhere, so a leaked cookie is useless without the WhatsApp message.
 *
 * Guessing is bounded outside this file, by `phone-verify-number` (5 an hour
 * per number) against a code that lives `OTP_TTL_SECONDS`.
 */

export const OTP_TTL_SECONDS = 600
export const OTP_LENGTH = 6

export function generateOtpCode(): string {
  // randomInt is uniform over the range, unlike Math.random() * 10 ** 6.
  return String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0')
}

function mac(secret: string, payload: string, code: string): string {
  return createHmac('sha256', secret).update(`${payload}.${code}`).digest('base64url')
}

function encode(subject: string, expiresAt: number): string {
  return Buffer.from(JSON.stringify({ s: subject, e: expiresAt }), 'utf8').toString('base64url')
}

export function issueChallenge(input: {
  subject: string
  code: string
  secret: string
  now?: number
}): string {
  const expiresAt = Math.floor((input.now ?? Date.now()) / 1000) + OTP_TTL_SECONDS
  const payload = encode(input.subject, expiresAt)
  return `${payload}.${mac(input.secret, payload, input.code)}`
}

export type ChallengeVerdict = 'ok' | 'expired' | 'mismatch' | 'malformed'

export function verifyChallenge(input: {
  challenge: string | null | undefined
  subject: string
  code: string
  secret: string
  now?: number
}): ChallengeVerdict {
  const parts = (input.challenge ?? '').split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return 'malformed'
  const [payload, signature] = parts as [string, string]

  let decoded: { s?: unknown; e?: unknown }
  try {
    decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return 'malformed'
  }
  if (typeof decoded.s !== 'string' || typeof decoded.e !== 'number') return 'malformed'

  // The MAC is checked before the expiry so a forged payload with a far-future
  // expiry cannot learn anything from which error comes back.
  const expected = Buffer.from(mac(input.secret, payload, input.code))
  const given = Buffer.from(signature)
  const macOk = expected.length === given.length && timingSafeEqual(expected, given)
  if (!macOk || decoded.s !== input.subject) return 'mismatch'

  if (Math.floor((input.now ?? Date.now()) / 1000) > decoded.e) return 'expired'
  return 'ok'
}
