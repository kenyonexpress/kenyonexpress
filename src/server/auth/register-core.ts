import { isSmsCapableIsraeli, toE164Israeli } from '@/lib/auth/phone-otp'
import type { RegisterField } from '@/lib/auth/register-steps'
import { safeNextPath } from '@/lib/auth/safe-next'
import { TERMS_ACCEPT_FIELD, TERMS_NOT_ACCEPTED, termsAccepted } from '@/lib/auth/terms-acceptance'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp } from '@/lib/utils/rate-limit'
import { signupSchema } from '@/lib/validations/auth'
import { gotrueErrorHebrew } from '@/server/auth/gotrue-errors'
import { issueSignupPhoneOtp } from '@/server/auth/signup-phone-otp'
import { termsAcceptanceRecord } from '@/server/auth/terms-record'

/**
 * The one registration (UX24), shared by the legacy redirecting action
 * (`signUpWithEmail`, which still serves `app/actions/auth`'s `signup`
 * re-export and any form that posts without JavaScript) and the inline
 * action the register panel uses (`registerAccount`), which returns the next
 * step instead of navigating to it.
 *
 * ORDER. The IP ceiling first, so a flood never reaches the schema or
 * GoTrue; the schema, with the FIELD of the first issue so the panel can
 * return to the step that holds it; the terms box, which is not a schema
 * field because an unticked checkbox is ABSENT from FormData rather than
 * invalid; then `signUp` with the acceptance stamped into the user's
 * metadata in the same INSERT that creates the account.
 *
 * THE PHONE. Challenged by SMS only for a user that was actually created:
 * with confirmations on, GoTrue answers an existing address with a
 * placeholder user that has no identities (its enumeration guard), and
 * texting the phone typed next to somebody else's email would turn that
 * guard into an SMS to a stranger. A code that cannot be sent skips the
 * step (lib/auth/signup-phone.ts): the account exists, the number stays
 * unverified on the profile, and the customer is told nothing is wrong.
 */

export type { RegisterField }

export type RegisterOutcome =
  | { ok: false; error: string; field?: RegisterField }
  | {
      ok: true
      email: string
      /** The safe `next`, or null for the home page. */
      next: string | null
      /** The E.164 a code went out to, or null when the phone step is skipped. */
      verifyingPhone: string | null
    }

export const SIGNUP_TOO_MANY = 'יותר מדי ניסיונות הרשמה — נסו שוב בעוד שעה'

const FIELDS: readonly RegisterField[] = ['full_name', 'email', 'phone', 'password']

function fieldOf(path: PropertyKey[]): RegisterField | undefined {
  const head = path[0]
  return typeof head === 'string' && (FIELDS as readonly string[]).includes(head)
    ? (head as RegisterField)
    : undefined
}

export async function registerCore(formData: FormData): Promise<RegisterOutcome> {
  const ip = await getClientIp()
  const allowed = await checkRateLimit(`signup:${ip}`, 5, 3600)
  if (!allowed) return { ok: false, error: SIGNUP_TOO_MANY }

  const parsed = signupSchema.safeParse({
    full_name: formData.get('full_name'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      ok: false,
      error: issue?.message ?? 'נתונים לא תקינים',
      field: issue ? fieldOf(issue.path) : undefined,
    }
  }
  if (!termsAccepted(formData.get(TERMS_ACCEPT_FIELD))) {
    return { ok: false, error: TERMS_NOT_ACCEPTED, field: 'accept_terms' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        full_name: parsed.data.full_name,
        phone: parsed.data.phone,
        ...termsAcceptanceRecord(),
      },
    },
  })
  if (error) return { ok: false, error: gotrueErrorHebrew(error.message) }

  const safe = safeNextPath(formData.get('next'))
  const next = safe === '/' ? null : safe
  const created = data.user && (data.user.identities?.length ?? 0) > 0 ? data.user : null
  const e164 = toE164Israeli(parsed.data.phone)
  if (created && e164 && isSmsCapableIsraeli(parsed.data.phone)) {
    const outcome = await issueSignupPhoneOtp({ e164, userId: created.id })
    if (outcome.ok) return { ok: true, email: parsed.data.email, next, verifyingPhone: outcome.to }
  }
  return { ok: true, email: parsed.data.email, next, verifyingPhone: null }
}
