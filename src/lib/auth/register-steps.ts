import { TERMS_NOT_ACCEPTED } from '@/lib/auth/terms-acceptance'
import { signupSchema } from '@/lib/validations/auth'

/**
 * The register panel's step machine (UX24), kept pure so the test can walk
 * it without React.
 *
 * FOUR STEPS, ONE FORM. "פרטים" (name, email, password) and "טלפון ותנאים"
 * (phone, the terms box) are two sections of the SAME form: the first
 * advances on the client with no request, the second posts the whole form.
 * "אימות הטלפון" is the six digits, shown only when a code actually went
 * out; on every deployment today no SMS sender exists, so that step is
 * marked skipped and the welcome follows the account's creation directly.
 * "ברוכים הבאים" is the end: the mail is on its way, the page says so.
 */
export type RegisterStep = 'details' | 'phone' | 'verify' | 'welcome'

/**
 * The fields a registration can refuse, named by the server so the stepper
 * can return to the step that holds the field. Declared here and not in the
 * server core because this module rides in the client chunk: a type-only
 * import of the core still reads as the storefront reaching a server-only
 * module to `catalogue-render-path.test`, which walks import lines.
 */
export type RegisterField = 'full_name' | 'email' | 'phone' | 'password' | 'accept_terms'

export const REGISTER_STEPS: readonly RegisterStep[] = ['details', 'phone', 'verify', 'welcome']

export const REGISTER_STEP_LABELS: Record<RegisterStep, string> = {
  details: 'פרטים',
  phone: 'טלפון ותנאים',
  verify: 'אימות הטלפון',
  welcome: 'ברוכים הבאים',
}

export type RegisterStepState = 'done' | 'current' | 'upcoming' | 'skipped'

export function stepIndex(step: RegisterStep): number {
  return REGISTER_STEPS.indexOf(step)
}

/**
 * Every step's state for the stepper, given where the customer is and
 * whether the code step was passed over (no SMS, or "דלגו בינתיים").
 */
export function stepStates(
  current: RegisterStep,
  phoneSkipped: boolean,
): Record<RegisterStep, RegisterStepState> {
  const at = stepIndex(current)
  const states = {} as Record<RegisterStep, RegisterStepState>
  for (const step of REGISTER_STEPS) {
    const index = stepIndex(step)
    if (index === at) states[step] = 'current'
    else if (index < at) states[step] = step === 'verify' && phoneSkipped ? 'skipped' : 'done'
    else states[step] = 'upcoming'
  }
  return states
}

/** What the live region says when the step changes. */
export function stepAnnouncement(step: RegisterStep): string {
  return `שלב ${stepIndex(step) + 1} מתוך ${REGISTER_STEPS.length}: ${REGISTER_STEP_LABELS[step]}`
}

/** The step a server-side field error belongs to; the phone step when it names none. */
export function stepForField(field: RegisterField | undefined): RegisterStep {
  switch (field) {
    case 'full_name':
    case 'email':
    case 'password':
      return 'details'
    default:
      return 'phone'
  }
}

export type DetailsValues = { full_name: string; email: string; password: string }
export type DetailsIssues = Partial<Record<keyof DetailsValues, string>>

const detailsSchema = signupSchema.pick({ full_name: true, email: true, password: true })
const phoneSchema = signupSchema.pick({ phone: true })

/**
 * The first step's refusal, from the SAME schema the server applies, so a
 * name, address or password the client lets through is one the server
 * accepts and the step never bounces back with a different sentence.
 */
export function detailsIssues(values: DetailsValues): DetailsIssues {
  const parsed = detailsSchema.safeParse(values)
  if (parsed.success) return {}
  const issues: DetailsIssues = {}
  for (const issue of parsed.error.issues) {
    const key = issue.path[0]
    if (key === 'full_name' || key === 'email' || key === 'password') {
      issues[key] ??= issue.message
    }
  }
  return issues
}

export type PhoneStepIssues = Partial<Record<'phone' | 'accept_terms', string>>

export function phoneStepIssues(values: { phone: string; accept_terms: boolean }): PhoneStepIssues {
  const issues: PhoneStepIssues = {}
  const parsed = phoneSchema.safeParse({ phone: values.phone })
  if (!parsed.success) issues.phone = parsed.error.issues[0]?.message ?? 'מספר טלפון לא תקין'
  if (!values.accept_terms) issues.accept_terms = TERMS_NOT_ACCEPTED
  return issues
}

/** The given name for the welcome line: the first word of what was typed. */
export function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? ''
}
