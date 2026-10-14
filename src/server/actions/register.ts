'use server'

import { withActionContext } from '@/lib/observability/action-context'
import type { RegisterField } from '@/server/auth/register-core'
import { registerCore } from '@/server/auth/register-core'
import { verifySignupPhoneCore } from '@/server/auth/signup-phone-steps'

/**
 * The register panel's actions (UX24): the same registration as
 * `signUpWithEmail` and the same code check as `verifySignupPhone`, answering
 * with the NEXT STEP instead of a redirect, because the panel is a stepper
 * that lives either on /signup or inside the login dialog over whatever page
 * the shopper is on, and a redirect would leave that page.
 *
 * `null` is "nothing happened yet" for `useActionState`. An error carries the
 * field it belongs to when it has one, so the panel can return to the step
 * that holds it instead of showing "שם מלא חייב להכיל לפחות 2 תווים" under
 * the phone field.
 */
export type RegisterState =
  | null
  | { error: string; field?: RegisterField }
  | { step: 'verify'; phone: string; email: string; next: string | null }
  | { step: 'welcome'; phoneVerified: boolean; email: string; next: string | null }

async function runRegisterAccount(formData: FormData): Promise<RegisterState> {
  const outcome = await registerCore(formData)
  if (!outcome.ok) return { error: outcome.error, field: outcome.field }
  if (outcome.verifyingPhone) {
    return {
      step: 'verify',
      phone: outcome.verifyingPhone,
      email: outcome.email,
      next: outcome.next,
    }
  }
  return { step: 'welcome', phoneVerified: false, email: outcome.email, next: outcome.next }
}

async function runVerifyRegisterPhone(formData: FormData): Promise<RegisterState> {
  const outcome = await verifySignupPhoneCore(formData)
  if (!outcome.ok) return { error: outcome.error }
  const email = formData.get('email')
  return {
    step: 'welcome',
    phoneVerified: true,
    email: typeof email === 'string' ? email : '',
    next: outcome.next,
  }
}

export async function registerAccount(
  _: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  return withActionContext('auth.register', () => runRegisterAccount(formData))
}

export async function verifyRegisterPhone(
  _: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  return withActionContext('auth.register_verify_phone', () => runVerifyRegisterPhone(formData))
}
