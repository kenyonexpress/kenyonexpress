'use server'

import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp } from '@/lib/utils/rate-limit'
import { redirect } from 'next/navigation'

/**
 * TOTP MFA enrolment and verification, for the super_admin gate in
 * lib/admin/rbac.ts (enforceSuperAdminMfa).
 *
 * Everything here is Supabase-native MFA (auth.mfa.*): the factor lives in
 * auth.mfa_factors, a successful verify upgrades the session to aal2, and the
 * `aal` claim rides the JWT, which is what the 181 trigger and RESTRICTIVE
 * policy read on the DB side. Passkeys are deliberately NOT this: a passkey
 * login mints an ordinary aal1 session via generateLink/verifyOtp, so it
 * proves possession at login and nothing afterwards.
 *
 * Any authenticated user may enrol; the factor only strengthens their own
 * account. Only super_admin is ever forced through it.
 */

const NOT_SIGNED_IN = 'צריך להתחבר כדי להגדיר אימות דו-שלבי'
const RATE_LIMITED = 'יותר מדי ניסיונות, נסו שוב בעוד שעה'
const ENROL_FAILED = 'הגדרת האימות הדו-שלבי נכשלה, נסו שוב'
const BAD_CODE = 'הקוד שגוי או שפג תוקפו, נסו שוב'

export type MfaEnrolState =
  | { factorId: string; qrSvg: string; secret: string }
  | { error: string }
  | null

export type MfaVerifyState = { error: string } | null

/**
 * Creates an unverified TOTP factor and hands the client what the
 * authenticator app needs. Abandoned factors from earlier attempts are
 * removed first: Supabase keeps every enroll() as a row, and a pile of
 * unverified factors turns listFactors into noise.
 */
async function runStartTotpEnrolment(): Promise<MfaEnrolState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: NOT_SIGNED_IN }

  const allowed = await checkRateLimit(`mfa-enrol:${user.id}`, 10, 3600)
  if (!allowed) return { error: RATE_LIMITED }

  const { data: factors } = await supabase.auth.mfa.listFactors()
  for (const factor of factors?.all ?? []) {
    if (factor.factor_type === 'totp' && factor.status === 'unverified') {
      await supabase.auth.mfa.unenroll({ factorId: factor.id })
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'KenyonExpress admin',
  })
  if (error || !data) {
    log.warn('mfa.enrol_failed', { reason: error?.message ?? 'no data' })
    return { error: ENROL_FAILED }
  }

  return { factorId: data.id, qrSvg: data.totp.qr_code, secret: data.totp.secret }
}

export async function startTotpEnrolment(): Promise<MfaEnrolState> {
  return withActionContext('mfa.enrol_start', () => runStartTotpEnrolment())
}

/**
 * Verifies a 6-digit code against a factor: the enrolment finish (factor was
 * unverified) and the login challenge (factor verified, session still aal1)
 * are the same ceremony to GoTrue. Success upgrades the session cookie to
 * aal2 and lands back in the panel.
 */
async function runVerifyTotpCode(
  _prev: MfaVerifyState,
  formData: FormData,
): Promise<MfaVerifyState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: NOT_SIGNED_IN }

  // TOTP has a million-code space; without a limit, six digits are brute
  // forceable inside a window. Keyed by user AND ip so a distributed guesser
  // still hits the per-account bound.
  const ip = await getClientIp()
  const [userAllowed, ipAllowed] = await Promise.all([
    checkRateLimit(`mfa-verify:${user.id}`, 10, 900),
    checkRateLimit(`mfa-verify-ip:${ip}`, 30, 900),
  ])
  if (!userAllowed || !ipAllowed) return { error: RATE_LIMITED }

  const code = String(formData.get('code') ?? '').trim()
  const factorId = String(formData.get('factor_id') ?? '')
  if (!/^\d{6}$/.test(code) || !factorId) return { error: BAD_CODE }

  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
    factorId,
  })
  if (challengeError || !challenge) {
    log.warn('mfa.challenge_failed', { reason: challengeError?.message ?? 'no data' })
    return { error: BAD_CODE }
  }

  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code,
  })
  if (verifyError) {
    log.warn('mfa.verify_failed', { reason: verifyError.message })
    return { error: BAD_CODE }
  }

  redirect('/admin')
}

export async function verifyTotpCode(
  prev: MfaVerifyState,
  formData: FormData,
): Promise<MfaVerifyState> {
  return withActionContext('mfa.verify', () => runVerifyTotpCode(prev, formData))
}
