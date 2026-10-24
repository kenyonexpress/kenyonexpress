import 'server-only'

import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'

/** Ten minutes, three wrong guesses, one use (table: migration 285, cap enforced here). */
export const WA_OTP_TTL_MS = 10 * 60 * 1000
export const WA_OTP_MAX_ATTEMPTS = 3

function otpKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const base =
    env.PASSKEY_CHALLENGE_SECRET ?? env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  return createHmac('sha256', base).update('ke-wa-otp-v1').digest()
}

export function newOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

/** Bound to the phone, so a code for one number is worthless for another. */
export function hashOtp(phoneE164: string, code: string, env?: NodeJS.ProcessEnv): string {
  return createHmac('sha256', otpKey(env)).update(`${phoneE164}|${code}`).digest('hex')
}

export function otpMatches(
  phoneE164: string,
  code: string,
  storedHash: string,
  env?: NodeJS.ProcessEnv,
): boolean {
  if (!/^[0-9]{6}$/.test(code)) return false
  const a = Buffer.from(hashOtp(phoneE164, code, env))
  const b = Buffer.from(storedHash)
  return a.length === b.length && timingSafeEqual(a, b)
}
