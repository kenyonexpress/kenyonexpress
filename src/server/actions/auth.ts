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
import { confirmPath, verifyPhonePath } from '@/lib/auth/signup-phone'
import { GUEST_SESSION_COOKIE, getGuestSessionId } from '@/lib/cart/guest-session'
import { siteUrl } from '@/lib/site-url'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPublicClient } from '@/lib/supabase/anon'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp } from '@/lib/utils/rate-limit'
import { escapeLikePattern } from '@/lib/utils/search-escape'
import {
  changePasswordSchema,
  emailOtpVerifySchema,
  loginSchema,
  magicLinkSchema,
  newPasswordSchema,
  passwordResetSchema,
  phoneOtpSchema,
  phoneVerifySchema,
} from '@/lib/validations/auth'
import { mergeGuestCart } from '@/server/actions/cart'
import { gotrueErrorHebrew } from '@/server/auth/gotrue-errors'
import { trySendBrandedMagicLink } from '@/server/auth/magic-link-send'
import { trySendBrandedPasswordReset } from '@/server/auth/password-reset-send'
import { registerCore } from '@/server/auth/register-core'
import { claimReferralOnce } from '@/server/referrals/claim'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export type AuthState = { error: string } | { success: string } | null

const toHebrew = gotrueErrorHebrew

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
    // Only on a merge that actually ran: see the same guard in
    // app/auth/callback/route.ts. A cleared cookie orphans the guest cart.
    const merged = await mergeGuestCart(supabase, signInData.user.id, sessionId)
    if (merged) {
      const cookieStore = await cookies()
      cookieStore.delete(GUEST_SESSION_COOKIE)
    }
  }

  redirect(safeNext(formData.get('next')))
}

// ──────────────────────────────────────────────
// Email / Password sign-up (phone required)
// ──────────────────────────────────────────────
async function runSignUpWithEmail(_: AuthState, formData: FormData): Promise<AuthState> {
  // The registration itself (ceiling, schema, terms, signUp, the SMS
  // challenge) is `server/auth/register-core.ts`, shared with the inline
  // `registerAccount` the register panel uses (UX24). This wrapper is the
  // redirecting shape: the code screen when a text went out, the email step
  // otherwise, carrying `next` either way.
  const outcome = await registerCore(formData)
  if (!outcome.ok) return { error: outcome.error }
  if (outcome.verifyingPhone) redirect(verifyPhonePath(outcome.verifyingPhone, outcome.next))
  redirect(confirmPath(outcome.next, false))
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

  // The branded Hebrew mail via Resend, when it can be sent (existing user,
  // keys configured). Falls back to Supabase's own mail otherwise, so a login
  // is never blocked by the pretty path; the success copy is identical on both
  // legs and reveals nothing about whether the address exists.
  const branded = await trySendBrandedMagicLink(parsed.data.email)
  if (!branded) {
    const supabase = await createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email: parsed.data.email,
      options: {
        emailRedirectTo: authRedirect('/auth/callback'),
      },
    })
    if (error) return { error: toHebrew(error.message) }
  }
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
    .ilike('phone', `%${escapeLikePattern(suffix)}`)
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
    // Gated on the return value, same as the other two login paths: clearing
    // the cookie after a merge that did not run orphans the guest cart.
    const merged = await mergeGuestCart(supabase, data.user.id, sessionId)
    if (merged) {
      const cookieStore = await cookies()
      cookieStore.delete(GUEST_SESSION_COOKIE)
    }
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

  // The referral claim for the ONE signup path that never reaches
  // /auth/callback: `verifyOtp` establishes the session right here, so the
  // claim the callback makes for email, magic link and Google has to be made
  // again for phone. `sessionId` is read above, before the merge deletes the
  // cookie, which is deliberate - it is the device fingerprint the fraud guard
  // scores on. Best-effort, and never a reason a sign-in fails.
  if (data.user) {
    await claimReferralOnce(data.user.id, sessionId)
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

  // The branded Hebrew mail first (STEP 16), GoTrue's own template as the
  // fallback: same arrangement as the magic link. `false` from the sender
  // means "could not", never "no such user", and the fallback below is silent
  // for an unknown address too, so the reply stays one sentence either way.
  if (await trySendBrandedPasswordReset(parsed.data.email)) return passwordResetResult(null)

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

// ──────────────────────────────────────────────
// Email OTP (the code from the login mail, typed instead of clicked)
// ──────────────────────────────────────────────
async function runVerifyEmailOtp(_: AuthState, formData: FormData): Promise<AuthState> {
  const ip = await getClientIp()
  // Same ceiling as the SMS code and for the same reason: six digits is a
  // million codes, and without this the mail gate is decorative.
  const allowed = await checkRateLimit(`email-verify:${ip}`, 20, 3600)
  if (!allowed) return { error: 'יותר מדי ניסיונות — נסו שוב בעוד שעה' }

  const parsed = emailOtpVerifySchema.safeParse({
    email: formData.get('email'),
    token: formData.get('token'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }

  // Per-address as well as per-IP, the way the password login is, so a list of
  // proxies cannot buy one address twenty tries each.
  const addressAllowed = await checkRateLimit(`email-verify-address:${parsed.data.email}`, 20, 3600)
  if (!addressAllowed) return { error: 'יותר מדי ניסיונות — נסו שוב בעוד שעה' }

  const supabase = await createClient()
  // `type: 'email'` is what GoTrue expects for the code that rides with a
  // magic link (`email_otp` off `generateLink`); 'magiclink' is the token_hash
  // leg the callback route consumes. Both verify the same secret.
  const { data, error } = await supabase.auth.verifyOtp({
    email: parsed.data.email,
    token: parsed.data.token,
    type: 'email',
  })
  if (error) return { error: toHebrew(error.message) }

  // From here on this is the callback route's job, done here because the
  // session was minted in this request and never passes through /auth/callback.
  const sessionId = await getGuestSessionId()
  if (data.user && sessionId) {
    const merged = await mergeGuestCart(supabase, data.user.id, sessionId)
    if (merged) {
      const cookieStore = await cookies()
      cookieStore.delete(GUEST_SESSION_COOKIE)
    }
  }
  if (data.user) {
    await claimReferralOnce(data.user.id, sessionId)
  }

  redirect(safeNext(formData.get('next')))
}

// ──────────────────────────────────────────────
// Change password (signed in, current password re-proves the owner)
// ──────────────────────────────────────────────
async function runChangePassword(_: AuthState, formData: FormData): Promise<AuthState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) return { error: 'יש להתחבר' }

  // Keyed on the session, not the IP: the thing being guessed here is one
  // account's current password, from a device that already holds its cookies.
  const allowed = await checkRateLimit(`change-password:${user.id}`, 10, 3600)
  if (!allowed) return { error: 'יותר מדי ניסיונות — נסו שוב בעוד שעה' }

  const parsed = changePasswordSchema.safeParse({
    current_password: formData.get('current_password'),
    password: formData.get('password'),
    confirm_password: formData.get('confirm_password'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }

  // `updateUser` trusts the session, and a session is exactly what a shared
  // or stolen device has. The current password is checked against GoTrue on
  // a throwaway anon client that persists nothing: a wrong one fails here and
  // the real session is untouched; a right one mints a session we revoke on
  // the spot, so the check leaves no second login behind.
  const verifier = createPublicClient()
  const { error: verifyError } = await verifier.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.current_password,
  })
  if (verifyError) return { error: 'הסיסמה הנוכחית שגויה' }
  await verifier.auth.signOut({ scope: 'local' })

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) return { error: toHebrew(error.message) }
  return { success: 'הסיסמה עודכנה' }
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

export async function verifyEmailOtp(_: AuthState, formData: FormData): Promise<AuthState> {
  return withActionContext('auth.verify_email_otp', () => runVerifyEmailOtp(_, formData))
}

export async function changePassword(_: AuthState, formData: FormData): Promise<AuthState> {
  return withActionContext('auth.change_password', () => runChangePassword(_, formData))
}
