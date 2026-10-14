import { isSmsCapableIsraeli, toE164Israeli } from '@/lib/auth/phone-otp'
import { safeNextPath } from '@/lib/auth/safe-next'
import {
  issueFailureHebrew,
  phoneTakenByAnotherAccount,
  verifyOutcomeHebrew,
} from '@/lib/auth/signup-phone'
import { log } from '@/lib/observability/log'
import { verifyPhoneOtp } from '@/lib/sms/otp'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, getClientIp } from '@/lib/utils/rate-limit'
import { phoneOtpSchema, phoneVerifySchema } from '@/lib/validations/auth'
import { clearSignupUid, issueSignupPhoneOtp, readSignupUid } from '@/server/auth/signup-phone-otp'

/**
 * The second step of the first-time signup (STEP 18): the code the customer
 * received on the phone they typed into the form. No session exists yet on
 * either step; the user id comes from the challenge (verify) or from the
 * HttpOnly cookie the first send left (resend). See lib/auth/signup-phone.ts.
 *
 * Lived inside `server/actions/signup-phone.ts` until UX24. The register
 * panel's inline actions (`server/actions/register.ts`) need the same two
 * steps without the redirect at the end, and a `'use server'` file can
 * export nothing but actions, so the bodies moved here and both action
 * files are wrappers.
 */

const UNDEFINED_COLUMN = '42703'
export const SIGNUP_PHONE_TOO_MANY = 'יותר מדי ניסיונות, נסו שוב בעוד שעה'

export type ResendOutcome = { ok: false; error: string } | { ok: true; to: string }

export type VerifyStepOutcome = { ok: false; error: string } | { ok: true; next: string | null }

export async function resendSignupPhoneCore(formData: FormData): Promise<ResendOutcome> {
  const ip = await getClientIp()
  // Every SMS costs money and lands on somebody's handset: the same ceiling
  // as the login OTP, per IP and per number.
  const allowed = await checkRateLimit(`signup-otp:${ip}`, 5, 3600)
  if (!allowed) return { ok: false, error: SIGNUP_PHONE_TOO_MANY }

  const parsed = phoneOtpSchema.safeParse({ phone: formData.get('phone') })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }
  }

  const e164 = toE164Israeli(parsed.data.phone)
  if (!e164 || !isSmsCapableIsraeli(parsed.data.phone)) {
    return { ok: false, error: 'יש להזין מספר טלפון נייד ישראלי (05X)' }
  }

  const numberAllowed = await checkRateLimit(`signup-otp-number:${e164}`, 5, 3600)
  if (!numberAllowed) return { ok: false, error: 'יותר מדי בקשות למספר הזה, נסו שוב בעוד שעה' }

  const userId = await readSignupUid()
  if (!userId) {
    return {
      ok: false,
      error: 'פג הזמן לאימות הטלפון. אפשר לאמת את המספר מהאזור האישי אחרי הכניסה',
    }
  }

  const outcome = await issueSignupPhoneOtp({ e164, userId })
  if (!outcome.ok) return { ok: false, error: issueFailureHebrew(outcome.reason) }
  return { ok: true, to: outcome.to }
}

export async function verifySignupPhoneCore(formData: FormData): Promise<VerifyStepOutcome> {
  const ip = await getClientIp()
  // Six digits is a million codes and the challenge burns after five wrong
  // ones; the per-IP ceiling is what stops a guesser from spreading across
  // many numbers instead.
  const allowed = await checkRateLimit(`signup-verify:${ip}`, 20, 3600)
  if (!allowed) return { ok: false, error: SIGNUP_PHONE_TOO_MANY }

  const parsed = phoneVerifySchema.safeParse({
    phone: formData.get('phone'),
    token: formData.get('token'),
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }
  }

  const e164 = toE164Israeli(parsed.data.phone)
  if (!e164) return { ok: false, error: 'מספר הטלפון אינו תקין' }

  const { result, userId } = await verifyPhoneOtp({
    phone: e164,
    code: parsed.data.token,
    purpose: 'signup_phone',
  })
  if (result !== 'ok') return { ok: false, error: verifyOutcomeHebrew(result) }
  if (!userId) {
    // A challenge issued without a user id is the profile-page purpose, not
    // this one; the key namespace should make that impossible, so say so.
    log.error('auth.signup_phone_challenge_without_user', { phone: e164 })
    return { ok: false, error: verifyOutcomeHebrew('expired') }
  }

  const admin = createAdminClient()

  // Confirmed on the identity itself, so `auth.users.phone_confirmed_at` is
  // set and a later phone sign-in (when the provider is wired) recognises
  // the number. The one refusal that matters is another account already
  // holding it: the signup still completes, the number stays off it, and
  // the customer is told in one sentence.
  const { error: attachError } = await admin.auth.admin.updateUserById(userId, {
    phone: e164,
    phone_confirm: true,
  })
  if (attachError) {
    log.warn('auth.signup_phone_attach_failed', { reason: attachError.message })
    await clearSignupUid()
    if (phoneTakenByAnotherAccount(attachError.message)) {
      return {
        ok: false,
        error: 'המספר הזה כבר משויך לחשבון אחר. אפשר להמשיך בלעדיו או להתחבר לחשבון הקיים',
      }
    }
    return { ok: false, error: 'שיוך המספר נכשל, נסו שוב' }
  }

  await stampProfile(admin, userId, e164)
  await clearSignupUid()
  const next = safeNextPath(formData.get('next'))
  return { ok: true, next: next === '/' ? null : next }
}

/**
 * `phone_verified_at` arrives with migration 254 (pending). Until it is
 * applied the UPDATE raises 42703 and is retried without the column, so a
 * signup completed today still records the verified number on the profile;
 * the timestamp is the only thing lost, and it is logged once per process.
 */
let warnedMissingColumn = false
async function stampProfile(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  e164: string,
): Promise<void> {
  const stamped = await admin
    .from('profiles')
    .update({ phone: e164, phone_verified_at: new Date().toISOString() } as never)
    .eq('id', userId)
  if (!stamped.error) return

  if (stamped.error.code === UNDEFINED_COLUMN) {
    if (!warnedMissingColumn) {
      warnedMissingColumn = true
      log.warn('db.optional_column_missing', {
        detail:
          'profiles.phone_verified_at: apply migrations/pending/254_profiles_phone_verified_at.sql',
      })
    }
    const fallback = await admin.from('profiles').update({ phone: e164 }).eq('id', userId)
    if (fallback.error) {
      log.warn('auth.signup_phone_profile_failed', { reason: fallback.error.message })
    }
    return
  }
  log.warn('auth.signup_phone_profile_failed', { reason: stamped.error.message })
}
