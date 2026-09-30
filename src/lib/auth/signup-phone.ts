import type { IssueOutcome, VerifyOutcome } from '@/lib/sms/otp'

/**
 * Phone verification inside the first-time signup (STEP 18).
 *
 * THE SHAPE. `signUp` creates the account with the email unconfirmed and no
 * session; the phone from the form is then challenged over our own Twilio
 * SMS (`lib/sms/otp.ts`, purpose `signup_phone`), with the new user id bound
 * into the challenge. The customer types the code on /signup/verify-phone,
 * the verify action attaches the number to `auth.users` as confirmed and
 * stamps `profiles.phone_verified_at`, and only then is the email step shown.
 *
 * WHY NOT SUPABASE'S OWN PHONE OTP. Measured on the hosted project on
 * 2026-10-01: `external_phone_enabled` is false and no Twilio SID is set, so
 * `signInWithOtp({ phone })` fails for every customer; and even configured,
 * that flow signs a phone IN rather than proving a phone belongs to the
 * account being created. Our OTP already exists for the profile page and
 * costs nothing new.
 *
 * DEGRADES, NEVER BLOCKS. No environment this repo can see ships SMS yet
 * (`SMS_ENABLED`/`TWILIO_SMS_FROM` unset), and a signup that cannot finish
 * because a text cannot be sent is an account lost. When the code cannot be
 * issued the signup proceeds straight to the email step exactly as before,
 * the reason is logged, and the number stays unverified on the profile.
 */

/** Where the signup lands after `signUp`, given whether a code went out. */
export function signupStepAfterOtp(
  outcome: IssueOutcome,
  next: string | null | undefined,
): { path: string; verifying: boolean } {
  if (outcome.ok) return { path: verifyPhonePath(outcome.to, next), verifying: true }
  return { path: confirmPath(next, false), verifying: false }
}

export function verifyPhonePath(e164: string, next: string | null | undefined): string {
  const params = new URLSearchParams({ phone: e164 })
  if (next) params.set('next', next)
  return `/signup/verify-phone?${params.toString()}`
}

export function confirmPath(next: string | null | undefined, phoneVerified: boolean): string {
  const params = new URLSearchParams()
  if (phoneVerified) params.set('phone', 'verified')
  if (next) params.set('next', next)
  const query = params.toString()
  return query ? `/signup/confirm?${query}` : '/signup/confirm'
}

/**
 * One sentence per outcome. "wrong" and "locked" are different sentences on
 * purpose: after five misses the challenge is gone and typing the right
 * digits will not help, so the customer is told to ask for a new code.
 */
export function verifyOutcomeHebrew(result: Exclude<VerifyOutcome, 'ok'>): string {
  switch (result) {
    case 'wrong':
      return 'הקוד שגוי, נסו שוב'
    case 'expired':
      return 'הקוד פג תוקף, בקשו קוד חדש'
    case 'locked':
      return 'יותר מדי ניסיונות שגויים, בקשו קוד חדש'
    case 'unavailable':
      return 'אימות הטלפון אינו זמין כרגע, אפשר להמשיך בלעדיו'
  }
}

export function issueFailureHebrew(reason: Exclude<IssueOutcome, { ok: true }>['reason']): string {
  switch (reason) {
    case 'bad_phone':
      return 'יש להזין מספר טלפון נייד ישראלי (05X)'
    case 'send_failed':
      return 'שליחת הקוד נכשלה, נסו שוב'
    case 'sms_unavailable':
    case 'store_unavailable':
      return 'שליחת SMS אינה זמינה כרגע, אפשר להמשיך בלעדיה'
  }
}

/**
 * The cookie that carries the new user's id between the signup POST and the
 * resend button, because there is no session yet to read it from. Fifteen
 * minutes: longer than the code's ten, so a resend after an expiry still
 * knows whose phone it is. HttpOnly, and scoped to /signup so it rides no
 * other request.
 */
export const SIGNUP_UID_COOKIE = 'ke_signup_uid'
export const SIGNUP_UID_MAX_AGE = 15 * 60

/** GoTrue's wording when the number already belongs to another account. */
export function phoneTakenByAnotherAccount(message: string): boolean {
  const lower = message.toLowerCase()
  return lower.includes('already') && lower.includes('phone')
}
