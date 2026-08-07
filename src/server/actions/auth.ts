'use server'

import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'

import { passwordResetResult } from '@/lib/auth/password-reset'
import { safeNextPath } from '@/lib/auth/safe-next'
import { GUEST_SESSION_COOKIE, getGuestSessionId } from '@/lib/cart/guest-session'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp } from '@/lib/utils/rate-limit'
import {
  loginSchema,
  magicLinkSchema,
  newPasswordSchema,
  passwordResetSchema,
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
}

function toHebrew(msg: string): string {
  for (const [key, val] of Object.entries(ERROR_MAP)) {
    if (msg.includes(key)) return val
  }
  return 'אירעה שגיאה, נסו שוב'
}

const safeNext = safeNextPath

// ──────────────────────────────────────────────
// Google OAuth
// ──────────────────────────────────────────────
async function runSignInWithGoogle(_: AuthState, formData: FormData): Promise<AuthState> {
  const next = safeNext(formData.get('next'))
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=${encodeURIComponent(next)}`,
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
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  })
  if (error) return { error: toHebrew(error.message) }
  return { success: 'שלחנו קישור כניסה לאימייל שלך — בדקו את תיבת הדואר' }
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

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/reset-password`,
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
