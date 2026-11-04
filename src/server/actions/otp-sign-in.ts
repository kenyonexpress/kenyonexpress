'use server'

import { generateOtpCode, issueChallenge, verifyChallenge } from '@/lib/auth/otp-challenge'
import { buildOtpEmail } from '@/lib/auth/otp-email'
import { isSmsCapableIsraeli, phoneAuthErrorHebrew, toE164Israeli } from '@/lib/auth/phone-otp'
import { safeNextPath } from '@/lib/auth/safe-next'
import { type OtpChannel, sendWhatsAppOtp, whatsappCloudConfig } from '@/lib/auth/whatsapp-cloud'
import { GUEST_SESSION_COOKIE, getGuestSessionId } from '@/lib/cart/guest-session'
import { sendEmail } from '@/lib/email/resend'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp } from '@/lib/utils/rate-limit'
import { magicLinkSchema, phoneOtpSchema, phoneVerifySchema } from '@/lib/validations/auth'
import { mergeGuestCart } from '@/server/actions/cart'
import { identifyPostHogUser } from '@/server/analytics/track'
import { claimReferralOnce } from '@/server/referrals/claim'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

/**
 * S19: sign in with a six-digit code, by WhatsApp when Meta Cloud API is
 * configured and by email when it is not. The channel decision is
 * `otpChannel()` in `lib/auth/whatsapp-cloud.ts`; see `docs/S19-auth.md`.
 *
 * HOW A WHATSAPP CODE BECOMES A SUPABASE SESSION. Supabase's phone provider is
 * off (measured), so there is no Supabase phone OTP to verify. Once our own
 * challenge checks out, the account that owns the number is found through
 * `profiles`, a magic-link token is minted for its email with the service key,
 * and that token is redeemed on the request's own client. That is the same
 * `verifyOtp({ token_hash })` the magic-link callback does, so the session it
 * sets is indistinguishable from any other email sign-in.
 *
 * NO ACCOUNT IS CREATED FROM A PHONE NUMBER. A Supabase user needs an email to
 * receive the magic-link token, and inventing one would leave a customer with
 * an address they do not own. A number with no account gets told to sign in
 * by email and add the number in their details.
 */

export type OtpState =
  | null
  | { error: string; fallback?: 'email' }
  | { sent: true; channel: OtpChannel; to: string }

const CHALLENGE_COOKIE = 'ke_otp_challenge'

const NO_ACCOUNT_FOR_PHONE =
  'לא מצאנו חשבון עם המספר הזה. היכנסו עם אימייל, והוסיפו את המספר בפרטי החשבון'
const AMBIGUOUS_PHONE = 'המספר הזה רשום ביותר מחשבון אחד. היכנסו עם אימייל'
const WRONG_CODE = 'הקוד שגוי או שפג תוקפו'

async function runSendSignInCode(_: OtpState, formData: FormData): Promise<OtpState> {
  const ip = await getClientIp()
  const config = whatsappCloudConfig()

  // `channel=email` is the customer taking the fallback after a WhatsApp send
  // failed; without config there is no other leg to take.
  if (!config || formData.get('channel') === 'email') return sendEmailCode(ip, formData)

  if (!(await checkRateLimit(`phone-otp:${ip}`, 5, 3600))) {
    return { error: 'יותר מדי בקשות קוד, נסו שוב בעוד שעה' }
  }
  const parsed = phoneOtpSchema.safeParse({ phone: formData.get('phone') })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'מספר טלפון לא תקין' }
  const e164 = toE164Israeli(parsed.data.phone)
  if (!e164 || !isSmsCapableIsraeli(parsed.data.phone)) {
    return { error: 'יש להזין מספר נייד ישראלי (05X)' }
  }
  if (!(await checkRateLimit(`phone-otp-number:${e164}`, 3, 3600))) {
    return { error: 'נשלחו יותר מדי קודים למספר הזה, נסו שוב בעוד שעה' }
  }

  // The code is sent whether or not the number has an account, so this step
  // cannot be used to learn who is a customer. The answer comes only after
  // possession of the number has been proven.
  const code = generateOtpCode()
  const sent = await sendWhatsAppOtp(config, e164, code)
  if (!sent.ok) {
    log.warn('auth.whatsapp_otp_send_failed', { reason: sent.reason })
    return { error: 'שליחת הקוד ב-WhatsApp נכשלה. אפשר לקבל קוד לאימייל', fallback: 'email' }
  }

  const store = await cookies()
  store.set(CHALLENGE_COOKIE, issueChallenge({ subject: e164, code, secret: config.secret }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  })
  return { sent: true, channel: 'whatsapp', to: e164 }
}

async function sendEmailCode(ip: string, formData: FormData): Promise<OtpState> {
  if (!(await checkRateLimit(`magic:${ip}`, 5, 3600))) {
    return { error: 'יותר מדי ניסיונות, נסו שוב בעוד שעה' }
  }
  const parsed = magicLinkSchema.safeParse({ email: formData.get('email') })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'כתובת אימייל לא תקינה' }
  const email = parsed.data.email

  // The branded Hebrew mail when Resend is configured and the address has an
  // account: `generateLink` returns the same six-digit `email_otp` Supabase
  // would have mailed. Otherwise Supabase sends its own mail, which also
  // creates the account for a first-time address, as the magic link does.
  if (process.env.RESEND_API_KEY) {
    try {
      const { data } = await createAdminClient().auth.admin.generateLink({
        type: 'magiclink',
        email,
      })
      const otp = data?.properties?.email_otp
      if (otp) {
        const mail = buildOtpEmail(otp)
        const result = await sendEmail({ to: email, ...mail })
        if (result.ok) return { sent: true, channel: 'email', to: email }
        log.warn('auth.email_otp_branded_failed', { reason: result.reason })
      }
    } catch (cause) {
      log.warn('auth.email_otp_generate_threw', {
        reason: cause instanceof Error ? cause.message : 'unknown',
      })
    }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({ email })
  if (error) return { error: phoneAuthErrorHebrew(error.message) }
  return { sent: true, channel: 'email', to: email }
}

async function runVerifySignInCode(_: OtpState, formData: FormData): Promise<OtpState> {
  const ip = await getClientIp()
  if (!(await checkRateLimit(`phone-verify:${ip}`, 20, 3600))) {
    return { error: 'יותר מדי ניסיונות, נסו שוב בעוד שעה' }
  }
  const token = String(formData.get('token') ?? '').trim()
  if (!/^\d{6}$/.test(token)) return { error: 'הקוד בן 6 ספרות' }

  const config = whatsappCloudConfig()
  const channel = formData.get('channel') === 'whatsapp' && config ? 'whatsapp' : 'email'
  const supabase = await createClient()

  let userId: string | null = null
  let provenPhone: string | null = null

  if (channel === 'whatsapp' && config) {
    const parsed = phoneVerifySchema.safeParse({ phone: formData.get('phone'), token })
    const e164 = parsed.success ? toE164Israeli(parsed.data.phone) : null
    if (!e164) return { error: 'מספר טלפון לא תקין' }
    if (!(await checkRateLimit(`phone-verify-number:${e164}`, 5, 3600))) {
      return { error: 'יותר מדי ניסיונות למספר הזה, בקשו קוד חדש בעוד שעה' }
    }

    const store = await cookies()
    const verdict = verifyChallenge({
      challenge: store.get(CHALLENGE_COOKIE)?.value,
      subject: e164,
      code: token,
      secret: config.secret,
    })
    if (verdict !== 'ok')
      return { error: verdict === 'expired' ? 'הקוד פג תוקף, בקשו קוד חדש' : WRONG_CODE }
    // Single use: the cookie goes the moment it has been accepted.
    store.delete(CHALLENGE_COOKIE)

    const owner = await findAccountByPhone(e164)
    if (owner === 'none') return { error: NO_ACCOUNT_FOR_PHONE, fallback: 'email' }
    if (owner === 'many') return { error: AMBIGUOUS_PHONE, fallback: 'email' }
    if (owner === 'failed') return { error: 'הכניסה נכשלה, נסו שוב' }

    const { data: link, error: linkError } = await createAdminClient().auth.admin.generateLink({
      type: 'magiclink',
      email: owner.email,
    })
    const hashed = link?.properties?.hashed_token
    if (linkError || !hashed) {
      log.error('auth.whatsapp_otp_mint_failed', { reason: linkError?.message ?? 'no_token' })
      return { error: 'הכניסה נכשלה, נסו שוב' }
    }
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: hashed, type: 'magiclink' })
    if (error || !data.user) return { error: 'הכניסה נכשלה, נסו שוב' }
    userId = data.user.id
    provenPhone = e164
  } else {
    const parsed = magicLinkSchema.safeParse({ email: formData.get('email') })
    if (!parsed.success) return { error: 'כתובת אימייל לא תקינה' }
    if (!(await checkRateLimit(`otp-verify-email:${parsed.data.email}`, 5, 3600))) {
      return { error: 'יותר מדי ניסיונות לכתובת הזו, בקשו קוד חדש בעוד שעה' }
    }
    const { data, error } = await supabase.auth.verifyOtp({
      email: parsed.data.email,
      token,
      type: 'email',
    })
    if (error || !data.user) return { error: phoneAuthErrorHebrew(error?.message ?? '') }
    userId = data.user.id
  }

  await afterSignIn(supabase, userId, provenPhone)
  redirect(safeNextPath(formData.get('next')))
}

/**
 * The account that carries this number. `profiles.phone` is free text in the
 * customer's own spelling, so the exact comparison is on the normalised value;
 * the suffix filter only narrows what the database returns. Same lookup as
 * `attachPhoneToExistingAccount` in `actions/auth.ts`.
 */
async function findAccountByPhone(
  e164: string,
): Promise<{ id: string; email: string } | 'none' | 'many' | 'failed'> {
  const { data, error } = await createAdminClient()
    .from('profiles')
    .select('id, phone, email')
    .ilike('phone', `%${e164.slice(-7)}`)
    .limit(50)
  // A failed read is not "no account": it would tell a real customer their
  // number is unknown and send them off to a different sign-in for nothing.
  if (error) {
    log.error('auth.whatsapp_otp_lookup_failed', { reason: error.message })
    return 'failed'
  }
  const matches = (data ?? []).filter(
    (row): row is { id: string; phone: string; email: string } =>
      toE164Israeli(row.phone) === e164 && typeof row.email === 'string' && row.email.length > 0,
  )
  if (matches.length === 0) return 'none'
  if (matches.length > 1) return 'many'
  const only = matches[0] as { id: string; email: string }
  return { id: only.id, email: only.email }
}

/** The same follow-through the phone and password paths in `actions/auth.ts` do. */
async function afterSignIn(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  provenPhone: string | null,
): Promise<void> {
  const sessionId = await getGuestSessionId()
  await identifyPostHogUser(userId)
  if (sessionId) {
    const merged = await mergeGuestCart(supabase, userId, sessionId)
    if (merged) (await cookies()).delete(GUEST_SESSION_COOKIE)
  }
  if (provenPhone) {
    // 217 may be unapplied: a missing column is "not available yet", never a
    // reason a successful sign-in turns into an error.
    const { error } = await createAdminClient()
      .from('profiles')
      .update({
        phone_verified_at: new Date().toISOString(),
        phone_verified_e164: provenPhone,
      } as never)
      .eq('id', userId)
    if (error && error.code !== '42703' && error.code !== 'PGRST204') {
      log.warn('auth.phone_verified_write_failed', { reason: error.message })
    }
  }
  await claimReferralOnce(userId, sessionId)
}

export async function sendSignInCode(state: OtpState, formData: FormData): Promise<OtpState> {
  return withActionContext('auth.send_sign_in_code', () => runSendSignInCode(state, formData))
}

export async function verifySignInCode(state: OtpState, formData: FormData): Promise<OtpState> {
  return withActionContext('auth.verify_sign_in_code', () => runVerifySignInCode(state, formData))
}
