import { checkOptionalIsraeliPostalCode } from '@/lib/checkout/israeli-postal-code'

/**
 * The checkout split into steps, and the rule for leaving each one.
 *
 * The whole form stays mounted in the DOM at every step: only visibility
 * changes. That is not a styling preference, it is what keeps `FormData` whole.
 * Unmounting step 1 to render step 3 would drop the name, phone and email from
 * the submission, and the server action would reject an order whose fields the
 * shopper did in fact fill in. So "which step am I on" is a display concern
 * here, and this module answers only one question: may the shopper move on.
 *
 * Every check is a pure function of the values, so the step gate is testable
 * without a browser and cannot drift from what the inputs actually hold.
 */

export const CHECKOUT_STEPS = ['details', 'address', 'review'] as const

export type CheckoutStep = (typeof CHECKOUT_STEPS)[number]

export const STEP_TITLES: Record<CheckoutStep, string> = {
  details: 'פרטים אישיים',
  address: 'כתובת למשלוח',
  review: 'ביקורת ותשלום',
}

/** Field name to message. Empty object means the step is clear. */
export type StepErrors = Record<string, string>

export type StepValues = Record<string, string | undefined>

const REQUIRED_MESSAGE = 'שדה חובה'

function blank(value: string | undefined): boolean {
  return (value ?? '').trim() === ''
}

/**
 * Israeli mobile numbers as they are actually typed: with or without the
 * leading zero's separators, and occasionally in +972 form.
 *
 * Deliberately not a general phone validator. This number is what the courier
 * and the coupon SMS use, so a landline that cannot receive a text is a real
 * failure to catch at the door rather than at delivery.
 */
export function checkIsraeliMobile(raw: string | undefined): string | null {
  if (blank(raw)) return REQUIRED_MESSAGE
  const digits = (raw ?? '').replace(/[\s\-()]/g, '').replace(/^\+?972/, '0')
  if (!/^\d+$/.test(digits)) return 'מספר טלפון מכיל ספרות בלבד'
  if (!/^05\d{8}$/.test(digits)) return 'מספר נייד ישראלי הוא 10 ספרות ומתחיל ב-05'
  return null
}

/**
 * Email shape only.
 *
 * The order confirmation and the coupon both go here, so a typo costs the
 * shopper the thing they paid for. There is no way to prove an address
 * receives mail from a regex, and pretending otherwise with a longer pattern
 * only rejects valid addresses, so this checks the shape and stops.
 */
export function checkEmail(raw: string | undefined): string | null {
  if (blank(raw)) return REQUIRED_MESSAGE
  const value = (raw ?? '').trim()
  if (/\s/.test(value)) return 'כתובת אימייל לא יכולה להכיל רווח'
  if (!/^[^@]+@[^@.]+(\.[^@.]+)+$/.test(value)) return 'כתובת אימייל לא תקינה'
  return null
}

export function validateDetailsStep(values: StepValues): StepErrors {
  const errors: StepErrors = {}
  if (blank(values.first_name)) errors.first_name = REQUIRED_MESSAGE
  if (blank(values.last_name)) errors.last_name = REQUIRED_MESSAGE

  const phone = checkIsraeliMobile(values.phone)
  if (phone) errors.phone = phone

  const email = checkEmail(values.email)
  if (email) errors.email = email

  return errors
}

export function validateAddressStep(values: StepValues): StepErrors {
  const errors: StepErrors = {}
  if (blank(values.city)) errors.city = REQUIRED_MESSAGE
  if (blank(values.street)) errors.street = REQUIRED_MESSAGE
  if (blank(values.street_number)) errors.street_number = REQUIRED_MESSAGE

  // Optional, but wrong-when-present is still wrong. The shared checker is the
  // same one the single-page form already used, so the 5-digit legacy code
  // keeps being accepted here exactly as it was. It answers `null` for an empty
  // field, which is the "nothing to check" case and not a failure.
  const zip = checkOptionalIsraeliPostalCode(values.zip ?? '')
  if (zip && !zip.ok) errors.zip = zip.message

  return errors
}

/**
 * The last step. Terms are the only gate: payment method has a default, and the
 * wallet field is capped by the input itself.
 */
export function validateReviewStep(values: StepValues): StepErrors {
  const errors: StepErrors = {}
  if (values.accept_terms !== 'on') errors.accept_terms = 'יש לאשר את תנאי השימוש'
  return errors
}

const VALIDATORS: Record<CheckoutStep, (values: StepValues) => StepErrors> = {
  details: validateDetailsStep,
  address: validateAddressStep,
  review: validateReviewStep,
}

export function validateStep(step: CheckoutStep, values: StepValues): StepErrors {
  return VALIDATORS[step](values)
}

/**
 * Every step that must be clear before `step` may be displayed.
 *
 * Used to stop a deep link or a stale state from dropping the shopper on the
 * pay button with an empty address behind it.
 */
export function stepsBefore(step: CheckoutStep): CheckoutStep[] {
  return CHECKOUT_STEPS.slice(0, CHECKOUT_STEPS.indexOf(step))
}

/**
 * The furthest step the given values justify showing.
 *
 * Walks forward from the first step and stops at the first one that does not
 * validate, so a half-filled form reopens where it broke rather than at the
 * end.
 */
export function furthestReachableStep(values: StepValues): CheckoutStep {
  for (const step of CHECKOUT_STEPS) {
    if (Object.keys(validateStep(step, values)).length > 0) return step
  }
  return CHECKOUT_STEPS[CHECKOUT_STEPS.length - 1] as CheckoutStep
}

export function isLastStep(step: CheckoutStep): boolean {
  return step === CHECKOUT_STEPS[CHECKOUT_STEPS.length - 1]
}

export function nextStep(step: CheckoutStep): CheckoutStep {
  const index = CHECKOUT_STEPS.indexOf(step)
  return (CHECKOUT_STEPS[Math.min(index + 1, CHECKOUT_STEPS.length - 1)] ?? step) as CheckoutStep
}

export function previousStep(step: CheckoutStep): CheckoutStep {
  const index = CHECKOUT_STEPS.indexOf(step)
  return (CHECKOUT_STEPS[Math.max(index - 1, 0)] ?? step) as CheckoutStep
}

/**
 * Checkout failures the shopper can act on, separated from the ones they cannot.
 *
 * The codes are the ones `beginCheckout` actually returns, read off
 * `server/actions/payments/checkout.ts`, not a guess at Cardcom's own numeric
 * decline table. That table exists, but nothing in this repo surfaces it to the
 * browser yet, and a retry button wired to codes we never receive is a button
 * that never appears.
 *
 * Retryable means pressing pay again could plausibly succeed without the
 * shopper leaving the page. Everything else is terminal: offering "try again"
 * on a disabled checkout or a missing address just loops them through the same
 * refusal.
 */
export type CheckoutFailureKind = 'retryable' | 'terminal'

const RETRYABLE_CODES = new Set([
  // The provider connection failed. Nothing was charged and nothing was
  // decided, so the same press can simply be repeated.
  'PAYMENT_PROVIDER_ERROR',
  // Explicitly "wait and try again".
  'RATE_LIMITED',
  // Both are about the SAVED CARD, not the order: it is gone, or its expiry
  // has passed. Choosing another card and pressing pay again works.
  'NOT_FOUND',
  'VALIDATION',
])

export function classifyCheckoutFailure(code: string | null | undefined): CheckoutFailureKind {
  if (!code) return 'terminal'
  return RETRYABLE_CODES.has(code.trim().toUpperCase()) ? 'retryable' : 'terminal'
}
