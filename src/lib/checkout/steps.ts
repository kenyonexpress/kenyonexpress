import { checkOptionalIsraeliPostalCode } from '@/lib/checkout/israeli-postal-code'

/**
 * The checkout's sections, and the rule each one has to satisfy before the
 * order is sent.
 *
 * These were the four steps of a wizard until 30.09.2026. The checkout is one
 * page now, the way the live WooCommerce checkout it is measured against is:
 * every section is visible at once and there is a single submit. The
 * grouping survived the stepper because the rules are per section (what the
 * details block needs, what the address block needs) and because a saved
 * address still switches two of them off at once. `validateAllSteps` is what
 * the single submit runs; the per-step functions are what it is made of.
 *
 * Every check is a pure function of the values, so the gate is testable
 * without a browser and cannot drift from what the inputs actually hold.
 */

export const CHECKOUT_STEPS = ['details', 'address', 'review', 'confirm'] as const

export type CheckoutStep = (typeof CHECKOUT_STEPS)[number]

export const STEP_TITLES: Record<CheckoutStep, string> = {
  details: 'פרטים אישיים',
  address: 'כתובת למשלוח',
  review: 'ביקורת הזמנה',
  /**
   * The final block Electro really shows below its order review: payment
   * notices, privacy, terms, then the order button. Electro has no stepper of
   * its own (see lib/checkout/electro-content.ts), so this step takes its
   * CONTENT from Electro and its shape from us.
   */
  confirm: 'אישור ותשלום',
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
 * Reviewing the order asks nothing of the shopper: the payment method has a
 * default and the wallet field is capped by the input itself. It is a step so
 * the totals get a screen of their own before money moves.
 */
export function validateReviewStep(_values: StepValues): StepErrors {
  return {}
}

/**
 * The last step. Terms are the only gate, and they sit here rather than on the
 * review because accepting them is the act immediately before paying, which is
 * also where Electro puts its tickbox.
 */
export function validateConfirmStep(values: StepValues): StepErrors {
  const errors: StepErrors = {}
  if (values.accept_terms !== 'on') errors.accept_terms = 'יש לאשר את תנאי השימוש'
  return errors
}

const VALIDATORS: Record<CheckoutStep, (values: StepValues) => StepErrors> = {
  details: validateDetailsStep,
  address: validateAddressStep,
  review: validateReviewStep,
  confirm: validateConfirmStep,
}

export function validateStep(step: CheckoutStep, values: StepValues): StepErrors {
  return VALIDATORS[step](values)
}

/**
 * Every section at once, for the one submit of a single-page checkout.
 *
 * `skip` names the sections a saved address answers for: their fields are not
 * rendered, so validating them would report four missing values over a line
 * of summary text the shopper cannot edit. The remaining sections are merged
 * in page order, first message per field, so the form can land focus on the
 * topmost error rather than the last one found.
 */
export function validateAllSteps(
  values: StepValues,
  skip: readonly CheckoutStep[] = [],
): StepErrors {
  const errors: StepErrors = {}
  for (const step of CHECKOUT_STEPS) {
    if (skip.includes(step)) continue
    for (const [field, message] of Object.entries(validateStep(step, values))) {
      if (!(field in errors)) errors[field] = message
    }
  }
  return errors
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

// ---------------------------------------------------------------------------
// The flow: three steps over the four sections (UX17, 14.10.2026)
// ---------------------------------------------------------------------------

/**
 * The checkout became a stepped flow again on 14.10.2026, this time at every
 * width: personal details, then the address (with the delivery slot, the
 * carrier and the notes), then payment (method, wallet, terms and the pay
 * button). The order review stays beside the steps the whole way.
 *
 * The flow is a layer OVER the sections above, not a replacement: `details`
 * and `address` are the sections of the same name, and `payment` is `review`
 * plus `confirm`. Every rule still lives in the per-section validators, so a
 * step's "continue" judges exactly what the one submit judges, and a saved
 * address switches the same two sections off in both.
 */
export const CHECKOUT_FLOW_STEPS = ['details', 'address', 'payment'] as const

export type CheckoutFlowStep = (typeof CHECKOUT_FLOW_STEPS)[number]

export const FLOW_STEP_TITLES: Record<CheckoutFlowStep, string> = {
  details: STEP_TITLES.details,
  address: STEP_TITLES.address,
  payment: 'תשלום',
}

const FLOW_SECTIONS: Record<CheckoutFlowStep, readonly CheckoutStep[]> = {
  details: ['details'],
  address: ['address'],
  payment: ['review', 'confirm'],
}

/** The sections a flow step is made of, in page order. */
export function sectionsOfFlowStep(step: CheckoutFlowStep): readonly CheckoutStep[] {
  return FLOW_SECTIONS[step]
}

/**
 * One step's errors, for its "continue" button. `skip` is the same list the
 * single submit takes (the sections a saved address answers for), so a step
 * whose every section is skipped is clear by definition.
 */
export function validateFlowStep(
  step: CheckoutFlowStep,
  values: StepValues,
  skip: readonly CheckoutStep[] = [],
): StepErrors {
  const errors: StepErrors = {}
  for (const section of FLOW_SECTIONS[step]) {
    if (skip.includes(section)) continue
    for (const [field, message] of Object.entries(validateStep(section, values))) {
      if (!(field in errors)) errors[field] = message
    }
  }
  return errors
}

export function flowStepIndex(step: CheckoutFlowStep): number {
  return CHECKOUT_FLOW_STEPS.indexOf(step)
}

/** The step after `step`, or null on the last one. */
export function nextFlowStep(step: CheckoutFlowStep): CheckoutFlowStep | null {
  return CHECKOUT_FLOW_STEPS[flowStepIndex(step) + 1] ?? null
}

/** The step before `step`, or null on the first one. */
export function previousFlowStep(step: CheckoutFlowStep): CheckoutFlowStep | null {
  const index = flowStepIndex(step)
  return index > 0 ? (CHECKOUT_FLOW_STEPS[index - 1] ?? null) : null
}

/**
 * Where each field lives, so an error the single submit finds can send the
 * shopper back to the step that owns it rather than to a red line behind a
 * collapsed panel. A field the table does not know is treated as the last
 * step's, which is where the submit button is and where the shopper already
 * stands.
 */
const FIELD_FLOW_STEP: Record<string, CheckoutFlowStep> = {
  first_name: 'details',
  last_name: 'details',
  phone: 'details',
  email: 'details',
  city: 'address',
  street: 'address',
  street_number: 'address',
  apartment: 'address',
  floor: 'address',
  zip: 'address',
  delivery_slot: 'address',
  shipping_option: 'address',
  order_notes: 'address',
  gift_recipient_email: 'address',
  accept_terms: 'payment',
  token_id: 'payment',
  apply_wallet_ils: 'payment',
  save_card: 'payment',
}

export function flowStepForField(field: string): CheckoutFlowStep {
  return FIELD_FLOW_STEP[field] ?? 'payment'
}

/**
 * The earliest step that owns an error in `errors`, or null when there are
 * none. Earliest in flow order, not in object order, so the shopper is taken
 * to the first thing that is wrong on the page.
 */
export function firstFlowStepWithErrors(errors: StepErrors): CheckoutFlowStep | null {
  const owned = new Set(Object.keys(errors).map(flowStepForField))
  for (const step of CHECKOUT_FLOW_STEPS) {
    if (owned.has(step)) return step
  }
  return null
}

/**
 * The step the flow opens on.
 *
 * A saved address answers the details and the address, so a returning shopper
 * opens on the address step: not on payment, because the delivery slot, the
 * carrier and the notes live in the address step and are still theirs to set,
 * and not on details, which would be a summary line with nothing to do. A
 * guest opens on the first step.
 */
export function initialFlowStep(skip: readonly CheckoutStep[]): CheckoutFlowStep {
  return skip.includes('details') ? 'address' : 'details'
}

export type FlowStepState = 'done' | 'current' | 'upcoming'

export function flowStepState(step: CheckoutFlowStep, current: CheckoutFlowStep): FlowStepState {
  const index = flowStepIndex(step)
  const now = flowStepIndex(current)
  if (index < now) return 'done'
  return index === now ? 'current' : 'upcoming'
}
