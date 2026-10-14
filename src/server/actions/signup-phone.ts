'use server'

import { confirmPath } from '@/lib/auth/signup-phone'
import { withActionContext } from '@/lib/observability/action-context'
import type { AuthState } from '@/server/actions/auth'
import { resendSignupPhoneCore, verifySignupPhoneCore } from '@/server/auth/signup-phone-steps'
import { redirect } from 'next/navigation'

/**
 * The second step of the first-time signup (STEP 18) as the /signup/verify-phone
 * page posts it. The bodies are `server/auth/signup-phone-steps.ts`, shared
 * with the register panel's inline actions (UX24); this file is the
 * redirecting shape, which lands on the email step with the phone marked
 * verified.
 */

async function runResendSignupPhoneOtp(_: AuthState, formData: FormData): Promise<AuthState> {
  const outcome = await resendSignupPhoneCore(formData)
  return outcome.ok ? { success: outcome.to } : { error: outcome.error }
}

async function runVerifySignupPhone(_: AuthState, formData: FormData): Promise<AuthState> {
  const outcome = await verifySignupPhoneCore(formData)
  if (!outcome.ok) return { error: outcome.error }
  redirect(confirmPath(outcome.next, true))
}

export async function resendSignupPhoneOtp(_: AuthState, formData: FormData): Promise<AuthState> {
  return withActionContext('auth.signup_phone_resend', () => runResendSignupPhoneOtp(_, formData))
}

export async function verifySignupPhone(_: AuthState, formData: FormData): Promise<AuthState> {
  return withActionContext('auth.signup_phone_verify', () => runVerifySignupPhone(_, formData))
}
