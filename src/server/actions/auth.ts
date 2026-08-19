'use server'

import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'

import { passwordResetResult } from '@/lib/auth/password-reset'
import { decidePhoneMerge } from '@/lib/auth/phone-merge'
import {
  isSmsCapableIsraeli,
  phoneAuthEnabled,
  phoneAuthErrorHebrew,
  toE164Israeli,
} from '@/lib/auth/phone-otp'
import { safeNextPath } from '@/lib/auth/safe-next'
import { GUEST_SESSION_COOKIE, getGuestSessionId } from '@/lib/cart/guest-session'
import { siteUrl } from '@/lib/site-url'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp } from '@/lib/utils/rate-limit'
import {
  loginSchema,
  magicLinkSchema,
  newPasswordSchema,
  passwordResetSchema,
  phoneOtpSchema,
  phoneVerifySchema,
  signupSchema,
} from '@/lib/validations/auth'
import { mergeGuestCart } from '@/server/actions/cart'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export type AuthState = { error: string } | { success: string } | null

const ERROR_MAP: Record<string, string> = {
  'Invalid login credentials': 'כתובת אימייל או סיסמה שגויים',
  'Email not confirmed': 'כתובת האימייל טרם אומתה — בדקו את תיבת הדואר',
  'User already registered': 'כתובת האימייל כבר רשומה במערכת',
  'Password should be at least 6 characters': 'הסיסמה חייבת להכיל לפחות 6 תווים',
  'Signup is disabled': 'ההרשמה סגורה כרגע',
  'Email rate limit exceeded': 'יותר מדי ניסיונות — נסו שוב מאוחר יותר',
  'Too many requests': 'יותר מדי ניסיונות — נסו שוב מאוחר יותר',
  /*
    THE ONLY WAY /reset-password FAILS FOR A REAL CUSTOMER, AND IT USED TO SAY
    NOTHING.

    `updateUser` is authorised by the recovery session the mail link opens, so
    a link that expired, was already used, or was never followed at all leaves
    no session and this is what Supabase returns. It was unmapped, so the page
    said "אירעה שגיאה, נסו שוב" - true, useless, and with no next step on a
    screen that has no other link on it.

    Not guessed. The string was READ OUT OF THE LOG that the unmapped-fallback
    warning above started writing: `auth.error_unmapped … reason: "Auth session
    missing!"`, from a direct visit to /reset-password. Sibling wordings for an
    expired link are deliberately NOT listed here - they have not been seen on
    this project, and the fallback now names anything new rather than hiding it.
  */
  'Auth session missing': 'קישור האיפוס פג או שכבר נעשה בו שימוש — בקשו קישור חדש',
}

/**
 * THE FALLBACK IS LOGGED, BECAUSE IT IS INDISTINGUISHABLE FROM WORKING.
 *
 * Every key above is an ENGLISH STRING SUPABASE CHOOSES, matched by substring.
 * Nothing here is under our control and nothing warns when one of them is
 * reworded upstream: the match simply stops firing, "כתובת אימייל או סיסמה
 * שגויים" quietly becomes "אירעה שגיאה, נסו שוב", and the sign-in form still
 * looks like it is behaving. The customer is told nothing useful and we are
 * told nothing at all.
 *
 * So an unmapped message is a warning with the message on it. The reason goes
 * to the log and never into the response - the same split the API routes are
 * held to by `log-coverage.test.ts`.
 */
function toHebrew(msg: string): string {
  for (const [key, val] of Object.entries(ERROR_MAP)) {
    if (msg.includes(key)) return val
  }
  log.warn('auth.error_unmapped', { reason: msg })
  return 'אירעה שגיאה, נסו שוב'
}

const safeNext = safeNextPath

/**
 * WHERE SUPABASE SENDS THE CUSTOMER BACK. `siteUrl()`, NOT A BARE ENV READ.
 *
 * These three URLs used to interpolate `process.env.NEXT_PUBLIC_APP_URL`
 * directly, and that variable is not in the required list in `lib/env.ts`, so
 * nothing refuses to boot without it. MEASURED against `pnpm start` on this
 * machine: clicking "כניסה עם Google" sent the customer to Google carrying
 * `redirect_to=undefined%2Fauth%2Fcallback%3Fnext%3D%2F` - the literal word
 * "undefined" as the origin, because template interpolation stringifies it
 * instead of failing.
 *
 * That is the worst shape a missing variable can take: `signInWithOAuth`
 * returns no error, the button works, the customer reaches a real Google
 * screen, and only the trip back is broken. The same read is behind the magic
 * link and the password-reset mail, so all three ways into an account share
 * one unguarded variable.
 *
 * `siteUrl()` is what the other ten call sites in the repo already use -
 * `layout.tsx`, `sitemap`, `robots`, the feeds, invoices, `finalize.ts` - and
 * it falls back to the canonical origin. These were the only three that did
 * not, which is exactly why they were the ones that broke.
 */
function authRedirect(path: string): string {
  return `${siteUrl()}${path}`
}

// ──────────────────────────────────────────────
// Google OAuth
// ──────────────────────────────────────────────
async function runSignInWithGoogle(_: AuthState, formData: FormData): Promise<AuthState> {
  const next = safeNext(formData.get('next'))
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: authRedirect(`/auth/callback?next=${encodeURIComponent(next)}`),
      scopes: 'openid email profile',
    },
  })
  if (error) return { error: toHebrew(error.message) }
  if (data.url) redirect(data.url)
  return null
}

// ──────────────────────────────────────────────
// Email / Password sign-in
// ──────────────────────────────────────────────
async function runSignInWithEmail(_: AuthState, formData: FormData): Promise<AuthState> {
  const ip = await getClientIp()
  const allowed = await checkRateLimit(`login:${ip}`)
  if (!allowed) return { error: 'יותר מדי ניסיונות כניסה — נסו שוב בעוד שעה' }

  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }

  // Per-account as well as per-IP, for the same reason `phone-otp-number` exists
  // below: the IP ceiling alone is a ceiling on one attacker's connection, not
  // on one customer's password. A list of proxies turns ten tries an hour into
  // ten per proxy against the same address. Lower-cased so `A@b.com` and
  // `a@b.com` cannot each buy their own allowance for one account.
  //
  // Twenty is above any real person's typo rate and far below a dictionary.
  const accountAllowed = await checkRateLimit(
    `login-account:${parsed.data.email.trim().toLowerCase()}`,
    20,
    3600,
  )
  // Deliberately the SAME sentence the IP refusal returns. Saying "too many
  // attempts on this account" to someone who has made none from this IP
  // confirms the address is registered.
  if (!accountAllowed) return { error: 'יותר מדי ניסיונות כניסה — נסו שוב בעוד שעה' }

  const supabase = await createClient()
  const { data: signInData, error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) return { error: toHebrew(error.message) }

  const sessionId = await getGuestSessionId()
  if (signInData.user && sessionId) {
    await mergeGuestCart(supabase, signInData.user.id, sessionId)
    const cookieStore = await cookies()
    cookieStore.delete(GUEST_SESSION_COOKIE)
  }

  redirect(safeNext(formData.get('next')))
}

// ──────────────────────────────────────────────
// Email / Password sign-up (phone required)
// ──────────────────────────────────────────────
async function runSignUpWithEmail(_: AuthState, formData: FormData): Promise<AuthState> {
  const ip = await getClientIp()
  const allowed = await checkRateLimit(`signup:${ip}`, 5, 3600)
  if (!allowed) return { error: 'יותר מדי ניסיונות הרשמה — נסו שוב בעוד שעה' }

  const parsed = signupSchema.safeParse({
    full_name: formData.get('full_name'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    password: formData.get('password'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }

  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.full_name, phone: parsed.data.phone },
    },
  })
  if (error) return { error: toHebrew(error.message) }
  redirect('/signup/confirm')
}

// ──────────────────────────────────────────────
// Magic link (OTP email)
// ──────────────────────────────────────────────
async function runSendMagicLink(_: AuthState, formData: FormData): Promise<AuthState> {
  const ip = await getClientIp()
  const allowed = await checkRateLimit(`magic:${ip}`, 5, 3600)
  if (!allowed) return { error: 'יותר מדי ניסיונות — נסו שוב בעוד שעה' }

  const parsed = magicLinkSchema.safeParse({ email: formData.get('email') })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: authRedirect('/auth/callback'),
    },
  })
  if (error) return { error: toHebrew(error.message) }
  return { success: 'שלחנו קישור כניסה לאימייל שלך — בדקו את תיבת הדואר' }
}

// ──────────────────────────────────────────────
// Phone OTP (SMS)
// ──────────────────────────────────────────────

/**
 * Attaches the number to the account that already carries it in `profiles`,
 * BEFORE the SMS goes out, so a successful code opens the customer's real
 * account instead of minting an empty new one.
 *
 * The whole decision is in `lib/auth/phone-merge.ts` and is tested there; this
 * only fetches what that function needs and performs what it decided. It never
 * throws: a merge that could not be attempted must still let the customer
 * receive a code and sign in - worst case into a new account, which is what
 * would have happened without any of this.
 */
async function attachPhoneToExistingAccount(e164: string): Promise<void> {
  const admin = createAdminClient()

  // `profiles.phone` holds whatever the signup form was given - '050-1234567',
  // '+972 50 123 4567', '0501234567' - so the comparison has to be on the
  // NORMALISED value, which SQL cannot do. The suffix filter narrows the rows
  // the database returns (the last seven digits are identical in every one of
  // those spellings); the exact match is then made in TypeScript by the same
  // normaliser the rest of the flow uses. Fetching every profile with a phone
  // and filtering here would work today and stop working at scale.
  const suffix = e164.slice(-7)
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, phone, email')
    .ilike('phone', `%${suffix}`)
    .limit(50)
  const candidates = (profiles ?? []).filter((row) => toE164Israeli(row.phone) === e164)

  let authUser: { id: string; phone: string | null } | null = null
  if (candidates.length === 1) {
    const sole = candidates[0]
    if (sole) {
      const { data: found } = await admin.auth.admin.getUserById(sole.id)
      // Supabase stores the phone WITHOUT the leading '+'. Comparing the two
      // forms directly is how this silently decides every account already has a
      // different phone and never merges anything.
      authUser = found?.user
        ? { id: found.user.id, phone: found.user.phone ? `+${found.user.phone}` : null }
        : null
    }
  }

  // Deliberately NOT a scan of the user table for this number. Paging through
  // `listUsers` to find out whether somebody else holds it is both unbounded
  // and pointless: `phone` is unique in `auth.users`, so an attach onto a taken
  // number fails with a constraint error, which is logged below. The check that
  // is worth making locally is the idempotent one - this account already has
  // it, so there is nothing to do.
  const alreadyAttachedToSomeone = authUser?.phone === e164

  const decision = decidePhoneMerge({ e164, candidates, authUser, alreadyAttachedToSomeone })
  if (decision.action !== 'attach') {
    log.info('auth.phone_merge_skipped', { reason: decision.reason })
    return
  }

  const { error } = await admin.auth.admin.updateUserById(decision.userId, {
    phone: e164,
    // Confirmed here because the OTP that follows is what actually proves
    // possession; leaving it unconfirmed would make Supabase demand a second
    // verification of the same number.
    phone_confirm: true,
  })
  if (error) log.error('auth.phone_merge_failed', { reason: error.message })
}

async function runSendPhoneOtp(_: AuthState, formData: FormData): Promise<AuthState> {
  if (!phoneAuthEnabled()) return { error: 'כניסה בטלפון אינה זמינה כרגע' }

  const ip = await getClientIp()
  // Every SMS costs money and lands on somebody's handset. Tighter than the
  // magic link's five because an unwanted email is ignored and an unwanted text
  // at 2am is a complaint.
  const allowed = await checkRateLimit(`phone-otp:${ip}`, 5, 3600)
  if (!allowed) return { error: 'יותר מדי ניסיונות — נסו שוב בעוד שעה' }

  const parsed = phoneOtpSchema.safeParse({ phone: formData.get('phone') })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }

  const e164 = toE164Israeli(parsed.data.phone)
  if (!e164 || !isSmsCapableIsraeli(parsed.data.phone)) {
    return { error: 'יש להזין מספר טלפון נייד ישראלי (05X)' }
  }

  // Per-number as well as per-IP: the IP ceiling alone lets one attacker on a
  // rotating connection text the same person repeatedly.
  const numberAllowed = await checkRateLimit(`phone-otp-number:${e164}`, 5, 3600)
  if (!numberAllowed) return { error: 'יותר מדי בקשות למספר הזה — נסו שוב בעוד שעה' }

  await attachPhoneToExistingAccount(e164)

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({ phone: e164 })
  if (error) {
    log.error('auth.phone_otp_send_failed', { reason: error.message })
    return { error: phoneAuthErrorHebrew(error.message) }
  }

  return { success: e164 }
}

async function runVerifyPhoneOtp(_: AuthState, formData: FormData): Promise<AuthState> {
  if (!phoneAuthEnabled()) return { error: 'כניסה בטלפון אינה זמינה כרגע' }

  const ip = await getClientIp()
  // Six digits is a million codes; without a ceiling here the SMS gate is
  // decorative. Twenty an hour leaves room for fat fingers and nothing else.
  const allowed = await checkRateLimit(`phone-verify:${ip}`, 20, 3600)
  if (!allowed) return { error: 'יותר מדי ניסיונות — נסו שוב בעוד שעה' }

  const parsed = phoneVerifySchema.safeParse({
    phone: formData.get('phone'),
    token: formData.get('token'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }

  const e164 = toE164Israeli(parsed.data.phone)
  if (!e164) return { error: 'מספר הטלפון אינו תקין' }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.verifyOtp({
    phone: e164,
    token: parsed.data.token,
    type: 'sms',
  })
  if (error) return { error: phoneAuthErrorHebrew(error.message) }

  const sessionId = await getGuestSessionId()
  if (data.user && sessionId) {
    await mergeGuestCart(supabase, data.user.id, sessionId)
    const cookieStore = await cookies()
    cookieStore.delete(GUEST_SESSION_COOKIE)
  }

  // A phone-only account has no profile row, because the trigger that creates
  // one keys off the email. Written here so the rest of the site - which reads
  // `profiles`, not `auth.users` - can see the customer at all.
  if (data.user) {
    const admin = createAdminClient()
    await admin
      .from('profiles')
      .upsert({ id: data.user.id, phone: e164 }, { onConflict: 'id', ignoreDuplicates: true })
  }

  redirect(safeNext(formData.get('next')))
}

// ──────────────────────────────────────────────
// Sign out (current device)
// ──────────────────────────────────────────────
async function runSignOut() {
  const supabase = await createClient()
  await supabase.auth.signOut({ scope: 'local' })
  redirect('/login')
}

// ──────────────────────────────────────────────
// Sign out (all devices)
// ──────────────────────────────────────────────
async function runSignOutAll() {
  const supabase = await createClient()
  await supabase.auth.signOut({ scope: 'global' })
  redirect('/login')
}

// ──────────────────────────────────────────────
// Password reset request
// ──────────────────────────────────────────────
async function runSendPasswordReset(_: AuthState, formData: FormData): Promise<AuthState> {
  const ip = await getClientIp()
  const allowed = await checkRateLimit(`reset:${ip}`, 5, 3600)
  if (!allowed) return { error: 'יותר מדי ניסיונות — נסו שוב בעוד שעה' }

  const parsed = passwordResetSchema.safeParse({ email: formData.get('email') })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }

  // Per-address too: the IP ceiling does not stop a rotating connection from
  // mailing one customer a reset link every minute until they click one.
  const addressAllowed = await checkRateLimit(
    `reset-address:${parsed.data.email.trim().toLowerCase()}`,
    5,
    3600,
  )
  // Still the neutral reply. A refusal that differs from the success message
  // would turn this endpoint into a registration oracle, which is the whole
  // point of `passwordResetResult` below.
  if (!addressAllowed) return passwordResetResult(null)

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: authRedirect('/auth/callback?next=/reset-password'),
  })

  // Never let the reply reveal whether the address is registered. Failures are
  // logged for operators; the caller always sees the same message.
  if (error) log.error('auth.password_reset_failed', { reason: error.message })
  return passwordResetResult(error)
}

// ──────────────────────────────────────────────
// Update password (after recovery flow)
// ──────────────────────────────────────────────
async function runUpdatePassword(_: AuthState, formData: FormData): Promise<AuthState> {
  // The recovery session is what authorises this, so the ceiling is not about
  // guessing. It is about a leaked or replayed recovery link being used to
  // cycle a password repeatedly, and about the same session being driven in a
  // loop; ten an hour is more than a real recovery ever needs.
  const ip = await getClientIp()
  const allowed = await checkRateLimit(`update-password:${ip}`, 10, 3600)
  if (!allowed) return { error: 'יותר מדי ניסיונות — נסו שוב בעוד שעה' }

  const parsed = newPasswordSchema.safeParse({
    password: formData.get('password'),
    confirm_password: formData.get('confirm_password'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) return { error: toHebrew(error.message) }
  redirect('/')
}

export async function signInWithGoogle(_: AuthState, formData: FormData): Promise<AuthState> {
  return withActionContext('auth.sign_in_google', () => runSignInWithGoogle(_, formData))
}

export async function signInWithEmail(_: AuthState, formData: FormData): Promise<AuthState> {
  return withActionContext('auth.sign_in_email', () => runSignInWithEmail(_, formData))
}

export async function signUpWithEmail(_: AuthState, formData: FormData): Promise<AuthState> {
  return withActionContext('auth.sign_up_email', () => runSignUpWithEmail(_, formData))
}

export async function sendMagicLink(_: AuthState, formData: FormData): Promise<AuthState> {
  return withActionContext('auth.send_magic_link', () => runSendMagicLink(_, formData))
}

export async function sendPhoneOtp(_: AuthState, formData: FormData): Promise<AuthState> {
  return withActionContext('auth.send_phone_otp', () => runSendPhoneOtp(_, formData))
}

export async function verifyPhoneOtp(_: AuthState, formData: FormData): Promise<AuthState> {
  return withActionContext('auth.verify_phone_otp', () => runVerifyPhoneOtp(_, formData))
}

export async function signOut() {
  return withActionContext('auth.sign_out', () => runSignOut())
}

export async function signOutAll() {
  return withActionContext('auth.sign_out_all', () => runSignOutAll())
}

export async function sendPasswordReset(_: AuthState, formData: FormData): Promise<AuthState> {
  return withActionContext('auth.send_password_reset', () => runSendPasswordReset(_, formData))
}

export async function updatePassword(_: AuthState, formData: FormData): Promise<AuthState> {
  return withActionContext('auth.update_password', () => runUpdatePassword(_, formData))
}
