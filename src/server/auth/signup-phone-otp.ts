import { isServedOverHttps } from '@/lib/auth/session-cookie'
import { SIGNUP_UID_COOKIE, SIGNUP_UID_MAX_AGE } from '@/lib/auth/signup-phone'
import { log } from '@/lib/observability/log'
import { type IssueOutcome, issuePhoneOtp } from '@/lib/sms/otp'
import { createAdminClient } from '@/lib/supabase/admin'
import { cookies } from 'next/headers'

/**
 * Sends the signup code and remembers whose it is.
 *
 * Called by `signUpWithEmail` right after `auth.signUp`, and again by the
 * resend button. The user id rides an HttpOnly cookie between the two
 * because the account has no session yet: email confirmation is on, so
 * `signUp` returns a user and no tokens.
 *
 * Never throws and never fails the signup: the caller reads the outcome and
 * either shows the code screen or skips to the email step
 * (`lib/auth/signup-phone.ts`).
 */
export async function issueSignupPhoneOtp(args: {
  e164: string
  userId: string
}): Promise<IssueOutcome> {
  const admin = createAdminClient()
  const outcome = await issuePhoneOtp(admin, {
    phone: args.e164,
    userId: args.userId,
    purpose: 'signup_phone',
  })

  if (!outcome.ok) {
    // `sms_unavailable` is the expected state on every deployment today
    // (no registered Israeli sender); it is info, not a warning, so the log
    // does not cry wolf on each signup until SMS is switched on.
    const write = outcome.reason === 'sms_unavailable' ? log.info : log.warn
    write('auth.signup_phone_otp_skipped', { reason: outcome.reason, detail: outcome.detail })
    return outcome
  }

  try {
    const cookieStore = await cookies()
    cookieStore.set(SIGNUP_UID_COOKIE, args.userId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isServedOverHttps(),
      path: '/',
      maxAge: SIGNUP_UID_MAX_AGE,
    })
  } catch (error) {
    // Only a resend needs the cookie; the verify step reads the user id off
    // the challenge itself.
    log.warn('auth.signup_uid_cookie_failed', {
      reason: error instanceof Error ? error.message : 'unknown',
    })
  }
  return outcome
}

export async function readSignupUid(): Promise<string | null> {
  const cookieStore = await cookies()
  const value = cookieStore.get(SIGNUP_UID_COOKIE)?.value ?? null
  return value && /^[0-9a-f-]{36}$/i.test(value) ? value : null
}

export async function clearSignupUid(): Promise<void> {
  try {
    const cookieStore = await cookies()
    cookieStore.delete(SIGNUP_UID_COOKIE)
  } catch {
    // Expires on its own in fifteen minutes.
  }
}
