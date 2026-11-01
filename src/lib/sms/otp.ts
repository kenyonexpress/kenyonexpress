import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import { del as cacheDel, get as cacheGet, set as cacheSet } from '@/lib/cache/redis'
import { log } from '@/lib/observability/log'
import { isUpstashConfigured } from '@/lib/rate-limit/upstash'
import { sendTransactionalSms } from '@/lib/sms/send'
import { isSmsConfigured, toSmsAddress } from '@/lib/sms/twilio'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * One-time codes over SMS, for verifying a phone the customer typed.
 *
 * WHY THIS IS NOT SUPABASE'S OTP. Sign-in by phone already goes through
 * `auth.signInWithOtp`, where Supabase mints and checks the code against its
 * own SMS provider. That path proves a phone can sign IN. This one proves the
 * phone a signed-in customer wrote on their profile is THEIRS, before the
 * notification stack starts texting it coupon codes: an unverified number in
 * `profiles.phone` is a stranger's handset receiving somebody else's purchase
 * details. Supabase's flow cannot do that without swapping the account's
 * sign-in identity, which is not what "verify my number" means.
 *
 * THE CODE IS NEVER STORED. Only an HMAC of it, keyed by a server secret, so a
 * Redis dump does not leak live codes. Verification hashes the typed code the
 * same way and compares in constant time.
 *
 * FIVE WRONG GUESSES BURN THE CHALLENGE. Six digits is a million codes and ten
 * minutes is long enough for a few thousand guesses at network speed; the
 * counter is stored WITH the challenge and incremented before the compare, so
 * a guess that races the increment still lands on a challenge that counts it.
 *
 * WHERE THE CHALLENGE LIVES. Upstash Redis through `src/lib/cache/redis.ts`,
 * with the TTL as the expiry. A serverless function has no memory between
 * invocations, so an in-process store would make the code the customer
 * receives unverifiable by the instance that answers the next request. When
 * Upstash is not configured the module says so and refuses to issue: a
 * verification that cannot be completed is worse than a button that explains
 * itself, and no environment this repo can see ships SMS without Upstash.
 *
 * `otp` IS THE ONE SMS KIND EXEMPT FROM OPT-OUT (see `lib/sms/opt-out.ts`);
 * the send goes through `sendTransactionalSms` so the log, the segment count
 * and the Israeli-mobile refusal all still apply.
 */

export const OTP_LENGTH = 6
export const OTP_TTL_SECONDS = 10 * 60
export const OTP_MAX_ATTEMPTS = 5

export type OtpPurpose = 'phone_verify'

interface Challenge {
  hash: string
  attempts: number
  /** Epoch ms. Stored beside the Redis TTL so the answer is exact, not approximate. */
  expiresAt: number
  purpose: OtpPurpose
  userId: string | null
}

export type IssueOutcome =
  | { ok: true; expiresAt: string; to: string; segments: number }
  | {
      ok: false
      reason: 'bad_phone' | 'sms_unavailable' | 'store_unavailable' | 'send_failed'
      detail?: string
    }

export type VerifyOutcome = 'ok' | 'wrong' | 'expired' | 'locked' | 'unavailable'

/** Exactly `OTP_LENGTH` digits, from the CSPRNG, leading zeros kept. */
export function generateOtpCode(): string {
  return String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0')
}

/**
 * The HMAC key. `OTP_SECRET` when set; otherwise derived from `CRON_SECRET`,
 * which production requires, the same fallback `wishlist/unsubscribe-token`
 * uses. Null when neither exists, which is a laptop with nothing configured.
 */
export function otpSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const explicit = env.OTP_SECRET?.trim()
  if (explicit) return explicit
  const cron = env.CRON_SECRET?.trim()
  return cron ? `otp:${cron}` : null
}

export function hashOtp(code: string, phoneE164: string, secret: string): string {
  return createHmac('sha256', secret).update(`${phoneE164}\n${code}`).digest('base64url')
}

export function challengeKey(phoneE164: string, purpose: OtpPurpose): string {
  return `otp:${purpose}:${phoneE164}`
}

/** For display next to "we sent a code to": +9725*****567. */
export function maskE164(e164: string): string {
  if (e164.length < 6) return e164
  return `${e164.slice(0, 5)}${'*'.repeat(Math.max(0, e164.length - 8))}${e164.slice(-3)}`
}

export interface OtpStore {
  get(key: string): Promise<Challenge | null>
  set(key: string, value: Challenge, ttlSeconds: number): Promise<boolean>
  del(key: string): Promise<boolean>
}

const redisStore: OtpStore = {
  get: (key) => cacheGet<Challenge>(key),
  set: (key, value, ttl) => cacheSet(key, value, ttl),
  del: (key) => cacheDel(key),
}

export async function issuePhoneOtp(
  admin: SupabaseClient,
  args: {
    phone: string | null | undefined
    userId: string | null
    purpose?: OtpPurpose
    env?: NodeJS.ProcessEnv
    store?: OtpStore
    /** Test seam: a fixed code instead of a random one. */
    code?: string
  },
): Promise<IssueOutcome> {
  const env = args.env ?? process.env
  const purpose = args.purpose ?? 'phone_verify'

  const to = toSmsAddress(args.phone)
  if (!to) return { ok: false, reason: 'bad_phone' }

  if (!isSmsConfigured(env)) {
    return { ok: false, reason: 'sms_unavailable', detail: 'SMS_ENABLED/TWILIO_SMS_FROM unset' }
  }

  const secret = otpSecret(env)
  const store = args.store ?? (isUpstashConfigured(env) ? redisStore : null)
  if (!secret || !store) {
    return {
      ok: false,
      reason: 'store_unavailable',
      detail: !secret ? 'no OTP_SECRET or CRON_SECRET' : 'Upstash is not configured',
    }
  }

  const code = args.code ?? generateOtpCode()
  const expiresAt = Date.now() + OTP_TTL_SECONDS * 1000
  const stored = await store.set(
    challengeKey(to, purpose),
    { hash: hashOtp(code, to, secret), attempts: 0, expiresAt, purpose, userId: args.userId },
    OTP_TTL_SECONDS,
  )
  // Stored BEFORE sent: a code that reached a phone and cannot be verified is
  // the one failure a customer cannot recover from by trying again.
  if (!stored) return { ok: false, reason: 'store_unavailable', detail: 'challenge write failed' }

  const sent = await sendTransactionalSms(admin, {
    kind: 'otp',
    payload: { code },
    phone: to,
    userId: args.userId,
    env,
  })

  if (sent.outcome !== 'sent') {
    // Do not leave a live challenge behind a message that never went out.
    await store.del(challengeKey(to, purpose))
    log.warn('sms.otp_issue_failed', { reason: sent.reason, outcome: sent.outcome })
    return {
      ok: false,
      reason: sent.outcome === 'skipped' ? 'sms_unavailable' : 'send_failed',
      detail: sent.reason,
    }
  }

  return { ok: true, expiresAt: new Date(expiresAt).toISOString(), to, segments: sent.segments }
}

export async function verifyPhoneOtp(args: {
  phone: string | null | undefined
  code: string
  purpose?: OtpPurpose
  env?: NodeJS.ProcessEnv
  store?: OtpStore
  nowMs?: number
}): Promise<{ result: VerifyOutcome; userId: string | null }> {
  const env = args.env ?? process.env
  const purpose = args.purpose ?? 'phone_verify'
  const now = args.nowMs ?? Date.now()

  const to = toSmsAddress(args.phone)
  const secret = otpSecret(env)
  const store = args.store ?? (isUpstashConfigured(env) ? redisStore : null)
  if (!to || !secret || !store) return { result: 'unavailable', userId: null }

  const key = challengeKey(to, purpose)
  const challenge = await store.get(key)
  if (!challenge) return { result: 'expired', userId: null }
  if (challenge.expiresAt <= now) {
    await store.del(key)
    return { result: 'expired', userId: challenge.userId }
  }

  // Counted before compared. See the header.
  const attempts = challenge.attempts + 1
  if (attempts > OTP_MAX_ATTEMPTS) {
    await store.del(key)
    return { result: 'locked', userId: challenge.userId }
  }

  const typed = args.code.replace(/\D/g, '')
  const expected = Buffer.from(challenge.hash)
  const provided = Buffer.from(hashOtp(typed, to, secret))
  const matches =
    typed.length === OTP_LENGTH &&
    expected.length === provided.length &&
    timingSafeEqual(expected, provided)

  if (!matches) {
    const remainingTtl = Math.max(1, Math.ceil((challenge.expiresAt - now) / 1000))
    if (attempts >= OTP_MAX_ATTEMPTS) {
      await store.del(key)
      return { result: 'locked', userId: challenge.userId }
    }
    await store.set(key, { ...challenge, attempts }, remainingTtl)
    return { result: 'wrong', userId: challenge.userId }
  }

  // Single use.
  await store.del(key)
  return { result: 'ok', userId: challenge.userId }
}

/** In-memory store for tests. Never used by application code. */
export function memoryOtpStore(): OtpStore & { size(): number } {
  const map = new Map<string, Challenge>()
  return {
    async get(key) {
      return map.get(key) ?? null
    },
    async set(key, value) {
      map.set(key, value)
      return true
    },
    async del(key) {
      return map.delete(key)
    },
    size() {
      return map.size
    },
  }
}
