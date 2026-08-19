'use client'

import { trackCommerce } from '@/lib/analytics/commerce-client'
import { track } from '@/lib/analytics/tracker'
import type { CartView } from '@/lib/cart/types'
import { sectionsFromElectro } from '@/lib/checkout/electro-content'
import { checkOptionalIsraeliPostalCode } from '@/lib/checkout/israeli-postal-code'
import { clampWalletIls } from '@/lib/checkout/wallet-input'
import {
  CHECKOUT_STEPS,
  type CheckoutStep,
  STEP_TITLES,
  type StepErrors,
  type StepValues,
  classifyCheckoutFailure,
  isLastStep,
  nextStep,
  previousStep,
  validateStep,
} from '@/lib/checkout/steps'
import { type Agorot, parseIls, sumAgorot } from '@/lib/money'
import { shekels } from '@/lib/money-format'
import { type AuthState, signInWithGoogle } from '@/server/actions/auth'
import { type CheckoutFormState, submitCheckout } from '@/server/actions/payments/checkout'
import { useActionState, useEffect, useRef, useState } from 'react'

export type CheckoutAddressPrefill = {
  id: string | null
  full_name: string
  phone: string
  city: string
  street: string
  street_number: string
  apartment: string
  floor: string
  zip: string
  email: string
}

export type CheckoutSavedCard = {
  id: string
  last4: string | null
  brand: string | null
  isDefault: boolean
}

// What a guest typed before being sent to Google. Kept in sessionStorage rather
// than posted anywhere: it is the shopper's own address, it never needs to
// leave the tab, and sessionStorage dies with the tab. Without it the OAuth
// round trip returns to an empty form and the shopper retypes an address they
// already gave, which is the usual reason a guest checkout is abandoned at the
// login step.
const RESUME_KEY = 'ke.checkout.resume'
const RESUME_FIELDS = [
  'first_name',
  'last_name',
  'city',
  'street',
  'street_number',
  'apartment',
  'floor',
  'zip',
  'phone',
  'email',
  'order_notes',
] as const

function readResume(): Partial<Record<(typeof RESUME_FIELDS)[number], string>> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.sessionStorage.getItem(RESUME_KEY)
    return raw ? (JSON.parse(raw) as Record<string, string>) : {}
  } catch {
    return {}
  }
}

export default function CheckoutForm({
  cart,
  clientRef,
  needsAddress,
  address,
  walletBalance,
  savedCards = [],
  isAuthenticated,
  resuming = false,
  channel = 'web',
}: {
  cart: CartView
  clientRef: string
  needsAddress: boolean
  address: CheckoutAddressPrefill
  walletBalance: number
  savedCards?: CheckoutSavedCard[]
  isAuthenticated: boolean
  /** True when we are back from Google and the form should refill itself. */
  resuming?: boolean
  /**
   * 'app' only when this page was opened inside the native app's WebView. It
   * changes where Cardcom sends the browser back to, and nothing else.
   */
  channel?: 'web' | 'app'
}) {
  /**
   * `begin_checkout`, once per mount of the checkout page.
   *
   * Fired here rather than from the server action, because the ad platforms
   * want the moment a shopper REACHED checkout - the top of the funnel step
   * they optimise against - and not the moment they submitted it. The server
   * already emits its own first-party `begin_checkout` from `beginCheckout`,
   * at the later moment, and the two answer different questions.
   *
   * A no-op without consent: `trackCommerce` finds neither vendor global.
   */
  // biome-ignore lint/correctness/useExhaustiveDependencies: the cart is a fresh object each render; keying on its identity would refire the event on every keystroke.
  useEffect(() => {
    trackCommerce('begin_checkout', {
      // `CartView` is agorot end to end, so nothing is converted here. The
      // only division on this path is `toCurrencyAmount`, at the vendor
      // boundary.
      items: cart.items.map((item) => ({
        id: item.product_id,
        name: item.name_he,
        priceAgorot: item.unit_price,
        quantity: item.quantity,
      })),
      // `total`, not `subtotal`: the amount the card is actually charged, after
      // a discount code. Reporting the pre-discount figure makes every funnel
      // report overstate the value of reaching checkout.
      valueAgorot: cart.total,
    })
  }, [])

  const [state, formAction, isPending] = useActionState<CheckoutFormState, FormData>(
    submitCheckout,
    null,
  )
  const [googleState, googleAction, googlePending] = useActionState<AuthState, FormData>(
    signInWithGoogle,
    null,
  )

  const formRef = useRef<HTMLFormElement>(null)
  const googleFormRef = useRef<HTMLFormElement>(null)

  const [paymentChoice, setPaymentChoice] = useState<string>(
    savedCards.find((card) => card.isDefault)?.id ?? savedCards[0]?.id ?? 'new',
  )
  const usingSavedCard = paymentChoice !== 'new'
  const [zipError, setZipError] = useState<string | null>(null)

  const [step, setStep] = useState<CheckoutStep>('details')
  const [stepErrors, setStepErrors] = useState<StepErrors>({})

  /**
   * A saved address is submitted by id, so its fields are never rendered. With
   * nothing in the DOM to read, the step rules would report missing required
   * fields and trap the shopper on a step that shows only a summary.
   *
   * BOTH steps, not just the address one. The personal-details block collapses
   * to the saved name on the same condition, so the details rules were checking
   * `first_name`, `last_name`, `phone` and `email` against a form that renders
   * none of the four - and `goNext` refused to move with no error to show,
   * because the error slots live inside the branch that was not rendered
   * either. A returning customer pressed "המשך" and nothing happened at all.
   *
   * The submission never wanted those fields here: `submitCheckout` reads them
   * only inside `if (needsAddress && !addressId)` and takes the email from the
   * session.
   */
  const savedAddressAnswersFor: CheckoutStep[] = address.id ? ['details', 'address'] : []

  /** Current values straight off the form, so the gate reads what is really there. */
  const readValues = (): StepValues => {
    const form = formRef.current
    if (!form) return {}
    const data = new FormData(form)
    const values: StepValues = {}
    for (const [key, value] of data.entries()) {
      if (typeof value === 'string') values[key] = value
    }
    return values
  }

  const checkStep = (target: CheckoutStep): StepErrors => {
    if (savedAddressAnswersFor.includes(target)) return {}
    return validateStep(target, readValues())
  }

  const goNext = () => {
    const errors = checkStep(step)
    setStepErrors(errors)
    if (Object.keys(errors).length > 0) return
    setStep(nextStep(step))
  }

  const goBack = () => {
    setStepErrors({})
    setStep(previousStep(step))
  }

  /**
   * Jumping straight to a step from the indicator is allowed backwards and
   * only as far forwards as the filled fields justify, so the stepper cannot
   * be used to skip the address.
   */
  const goToStep = (target: CheckoutStep) => {
    const targetIndex = CHECKOUT_STEPS.indexOf(target)
    if (targetIndex <= CHECKOUT_STEPS.indexOf(step)) {
      setStepErrors({})
      setStep(target)
      return
    }
    for (const between of CHECKOUT_STEPS.slice(0, targetIndex)) {
      const errors = checkStep(between)
      if (Object.keys(errors).length > 0) {
        setStepErrors(errors)
        setStep(between)
        return
      }
    }
    setStepErrors({})
    setStep(target)
  }

  const errorFor = (field: string): string | undefined => stepErrors[field]

  /** Derived from the committed Electro capture, not hardcoded here. */
  const confirmSections = sectionsFromElectro()

  const balanceAtBusiness = cart.balance_due_at_business
  const itemsTotal = sumAgorot(cart.items.map((item) => item.line_total))

  // Gift fields are mounted only while the box is ticked, so an unticked box
  // cannot post a half-typed address, and the server forwards the fields only
  // when both the flag and the email are present.
  const [isGift, setIsGift] = useState(false)

  // `walletBalance` and the `apply_wallet_ils` field are the one place on this
  // page still denominated in shekels: the wallet column is `balance_ils` and
  // the server action parses the field back out in shekels. It is lifted to
  // agorot here so the cap below compares like with like. Comparing the raw
  // shekel balance against the agorot subtotal would have offered a wallet
  // ceiling a hundred times the cart.
  const walletBalanceAgorot: Agorot = parseIls(walletBalance.toFixed(2))
  const walletMaxIls = Math.min(walletBalanceAgorot, cart.subtotal) / 100

  const [firstName, ...restName] = (address.full_name ?? '').split(' ')
  const prefill = {
    first_name: firstName ?? '',
    last_name: restName.join(' '),
    city: address.city,
    street: address.street,
    street_number: address.street_number,
    apartment: address.apartment,
    floor: address.floor,
    zip: address.zip,
    phone: address.phone,
    email: address.email,
    order_notes: '',
  }

  useEffect(() => {
    track('checkout_step', { step: 'identity' })
    if (needsAddress) track('checkout_step', { step: 'address' })
  }, [needsAddress])

  // Refill after the Google round trip. Done in an effect against the live DOM
  // rather than through defaultValue, because the values are only readable on
  // the client and a defaultValue read during render would differ between the
  // server and client passes.
  useEffect(() => {
    if (!resuming) return
    const saved = readResume()
    const form = formRef.current
    if (!form) return
    for (const name of RESUME_FIELDS) {
      const value = saved[name]
      if (!value) continue
      const field = form.elements.namedItem(name)
      if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
        if (!field.value) field.value = value
      }
    }
    window.sessionStorage.removeItem(RESUME_KEY)
  }, [resuming])

  const validateZip = (value: string): boolean => {
    const check = checkOptionalIsraeliPostalCode(value)
    setZipError(check && !check.ok ? check.message : null)
    return !check || check.ok
  }

  // The single gate that makes this a guest checkout: the form is filled, and
  // only the press of "pay" needs an identity. A guest is stashed and sent to
  // Google here instead of being turned away at the door.
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    const form = event.currentTarget
    const zip = (form.elements.namedItem('zip') as HTMLInputElement | null)?.value ?? ''
    if (!validateZip(zip)) {
      event.preventDefault()
      return
    }

    // Every step, not just the visible one. The fields stay mounted across
    // steps so the submission is whole, and the flip side of that is that a
    // shopper who edited step 1 into an invalid state and walked forward would
    // otherwise reach the card with it. Land them back on the step that broke.
    for (const candidate of CHECKOUT_STEPS) {
      const errors = checkStep(candidate)
      if (Object.keys(errors).length > 0) {
        event.preventDefault()
        setStepErrors(errors)
        setStep(candidate)
        return
      }
    }

    if (!isAuthenticated) {
      event.preventDefault()
      const data = new FormData(form)
      const stash: Record<string, string> = {}
      for (const name of RESUME_FIELDS) {
        const value = data.get(name)
        if (typeof value === 'string' && value !== '') stash[name] = value
      }
      try {
        window.sessionStorage.setItem(RESUME_KEY, JSON.stringify(stash))
      } catch {
        // A blocked sessionStorage costs the refill, not the checkout.
      }
      track('checkout_step', { step: 'guest_login' })
      googleFormRef.current?.requestSubmit()
      return
    }

    track('checkout_step', { step: 'payment_redirect' })
  }

  const authError = googleState && 'error' in googleState ? googleState.error : null
  const formError = state && 'error' in state ? state.error : null
  const failureCode = state && 'code' in state ? state.code : null
  const failureKind = formError ? classifyCheckoutFailure(failureCode) : null
  // The hosted payment page, once beginCheckout has created it. Its presence is
  // what switches the page from "filling in a form" to "paying".
  const frame = state && 'frame' in state ? state.frame : null
  const busy = isPending || googlePending

  return (
    <>
      {!isAuthenticated && (
        <div className="checkout-guest-notice">
          <span>קונית כאן בעבר?</span>
          <button
            type="button"
            className="checkout-guest-notice__link"
            onClick={() => googleFormRef.current?.requestSubmit()}
            disabled={googlePending}
          >
            {googlePending ? 'מעביר להתחברות...' : 'יש ללחוץ כאן כדי להתחבר'}
          </button>
        </div>
      )}

      {/* Its own form: nesting it inside the checkout form is invalid HTML and
          would make the OAuth submit carry the whole address payload. */}
      <form action={googleAction} ref={googleFormRef} hidden>
        <input type="hidden" name="next" value="/checkout?resume=1" />
      </form>

      <ol className="checkout-steps" aria-label="שלבי ההזמנה">
        {CHECKOUT_STEPS.map((entry, index) => {
          const current = entry === step
          const done = CHECKOUT_STEPS.indexOf(entry) < CHECKOUT_STEPS.indexOf(step)
          return (
            <li
              key={entry}
              className="checkout-steps__item"
              data-state={current ? 'current' : done ? 'done' : 'upcoming'}
              aria-current={current ? 'step' : undefined}
            >
              <button
                type="button"
                className="checkout-steps__btn"
                onClick={() => goToStep(entry)}
                disabled={busy}
              >
                <span className="checkout-steps__index" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="checkout-steps__label">{STEP_TITLES[entry]}</span>
              </button>
            </li>
          )
        })}
      </ol>

      {/*
        One form across every step, and no step is unmounted: only hidden. A
        step rendered conditionally would drop its fields from `FormData`, and
        the server action would reject an order for missing a name the shopper
        typed two screens ago.
      */}
      <form
        action={formAction}
        onSubmit={handleSubmit}
        ref={formRef}
        className="checkout-page__grid"
        data-step={step}
        noValidate
      >
        <input type="hidden" name="client_ref" value={clientRef} />
        <input type="hidden" name="channel" value={channel} />
        <input type="hidden" name="needs_address" value={needsAddress ? 'true' : 'false'} />
        {address.id && <input type="hidden" name="address_id" value={address.id} />}

        <div className="checkout-col-main">
          <div className="checkout-step" hidden={step !== 'details'}>
            <section className="checkout-section" aria-label="פרטים אישיים">
              <h2 className="checkout-section__title">
                <span>פרטים אישיים</span>
              </h2>

              {address.id ? (
                <p>{address.full_name}</p>
              ) : (
                <>
                  <div className="checkout-fields-row">
                    <div className="checkout-field">
                      <label htmlFor="co-first-name">
                        שם פרטי <span className="checkout-field__required">*</span>
                      </label>
                      <input
                        id="co-first-name"
                        name="first_name"
                        defaultValue={prefill.first_name}
                        autoComplete="given-name"
                        aria-invalid={errorFor('first_name') ? 'true' : undefined}
                      />
                      {errorFor('first_name') && (
                        <span className="checkout-field__error" role="alert">
                          {errorFor('first_name')}
                        </span>
                      )}
                    </div>
                    <div className="checkout-field">
                      <label htmlFor="co-last-name">
                        שם משפחה <span className="checkout-field__required">*</span>
                      </label>
                      <input
                        id="co-last-name"
                        name="last_name"
                        defaultValue={prefill.last_name}
                        autoComplete="family-name"
                        aria-invalid={errorFor('last_name') ? 'true' : undefined}
                      />
                      {errorFor('last_name') && (
                        <span className="checkout-field__error" role="alert">
                          {errorFor('last_name')}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="checkout-fields-row">
                    <div className="checkout-field">
                      <label htmlFor="co-phone">
                        טלפון <span className="checkout-field__required">*</span>
                      </label>
                      <input
                        id="co-phone"
                        name="phone"
                        defaultValue={prefill.phone}
                        inputMode="tel"
                        autoComplete="tel"
                        placeholder="05XXXXXXXX"
                        /*
                          LTR, like the gift-recipient email a few fields down
                          already is. A number and an address are Latin on a
                          Hebrew page; the form around them stays RTL. Measured
                          before this line: the BUYER's own phone and email
                          rendered flush right while the RECIPIENT's rendered
                          flush left, in the same form, on the same screen.
                        */
                        dir="ltr"
                        aria-invalid={errorFor('phone') ? 'true' : undefined}
                      />
                      {errorFor('phone') && (
                        <span className="checkout-field__error" role="alert">
                          {errorFor('phone')}
                        </span>
                      )}
                    </div>
                    <div />
                  </div>

                  <div className="checkout-fields-row">
                    <div className="checkout-field">
                      <label htmlFor="co-email">
                        כתובת אימייל <span className="checkout-field__required">*</span>
                      </label>
                      <input
                        id="co-email"
                        name="email"
                        type="email"
                        defaultValue={prefill.email}
                        autoComplete="email"
                        dir="ltr"
                        aria-invalid={errorFor('email') ? 'true' : undefined}
                      />
                      {errorFor('email') && (
                        <span className="checkout-field__error" role="alert">
                          {errorFor('email')}
                        </span>
                      )}
                    </div>
                    <div />
                  </div>
                </>
              )}
            </section>
          </div>

          <div className="checkout-step" hidden={step !== 'address'}>
            <section className="checkout-section" aria-label="כתובת למשלוח">
              <h2 className="checkout-section__title">
                <span>כתובת למשלוח</span>
              </h2>

              {address.id ? (
                <p>
                  {address.street} {address.street_number}, {address.city}
                </p>
              ) : (
                <>
                  <div className="checkout-fields-row checkout-fields-row--single">
                    <div className="checkout-field">
                      <label htmlFor="co-city">
                        עיר <span className="checkout-field__required">*</span>
                      </label>
                      <input
                        id="co-city"
                        name="city"
                        defaultValue={prefill.city}
                        autoComplete="address-level2"
                        aria-invalid={errorFor('city') ? 'true' : undefined}
                      />
                      {errorFor('city') && (
                        <span className="checkout-field__error" role="alert">
                          {errorFor('city')}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="checkout-fields-row">
                    <div className="checkout-field">
                      <label htmlFor="co-street">
                        רחוב <span className="checkout-field__required">*</span>
                      </label>
                      <input
                        id="co-street"
                        name="street"
                        defaultValue={prefill.street}
                        autoComplete="address-line1"
                        aria-invalid={errorFor('street') ? 'true' : undefined}
                      />
                      {errorFor('street') && (
                        <span className="checkout-field__error" role="alert">
                          {errorFor('street')}
                        </span>
                      )}
                    </div>
                    <div className="checkout-field">
                      <label htmlFor="co-number">
                        מספר בית <span className="checkout-field__required">*</span>
                      </label>
                      <input
                        id="co-number"
                        name="street_number"
                        defaultValue={prefill.street_number}
                        aria-invalid={errorFor('street_number') ? 'true' : undefined}
                      />
                      {errorFor('street_number') && (
                        <span className="checkout-field__error" role="alert">
                          {errorFor('street_number')}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="checkout-fields-row">
                    <div className="checkout-field">
                      <label htmlFor="co-apartment">מספר דירה (אופציונלי)</label>
                      <input
                        id="co-apartment"
                        name="apartment"
                        defaultValue={prefill.apartment}
                        autoComplete="address-line2"
                      />
                    </div>
                    <div className="checkout-field">
                      <label htmlFor="co-floor">קומה (אופציונלי)</label>
                      <input id="co-floor" name="floor" defaultValue={prefill.floor} />
                    </div>
                  </div>

                  <div className="checkout-fields-row">
                    <div className="checkout-field">
                      <label htmlFor="co-zip">מיקוד / תא דואר (אופציונלי)</label>
                      <input
                        id="co-zip"
                        name="zip"
                        defaultValue={prefill.zip}
                        inputMode="numeric"
                        autoComplete="postal-code"
                        aria-invalid={zipError || errorFor('zip') ? 'true' : undefined}
                        aria-describedby={zipError ? 'co-zip-error' : undefined}
                        onBlur={(event) => validateZip(event.currentTarget.value)}
                      />
                      {(zipError || errorFor('zip')) && (
                        <span className="checkout-field__error" id="co-zip-error" role="alert">
                          {zipError ?? errorFor('zip')}
                        </span>
                      )}
                    </div>
                    <div />
                  </div>
                </>
              )}
            </section>

            <section className="checkout-section" aria-label="מידע נוסף">
              <h2 className="checkout-section__title">
                <span>מידע נוסף</span>
              </h2>
              <div className="checkout-field">
                <label htmlFor="co-notes">הערות להזמנה (אופציונלי)</label>
                <textarea
                  id="co-notes"
                  name="order_notes"
                  placeholder="הערות על ההזמנה, לדוגמה, הערות מיוחדות למסירה."
                />
              </div>

              {/*
                Offered only when there is a coupon to give. A gift here is a
                voucher that changes hands; a physical line ships to an address
                and has nothing to transfer, so showing the fields for one would
                promise something the order cannot do.
              */}
              {cart.items.some((item) => item.type === 'coupon') && (
                <div className="checkout-field">
                  <label className="checkout-terms">
                    <input
                      type="checkbox"
                      name="gift"
                      checked={isGift}
                      onChange={(e) => setIsGift(e.target.checked)}
                    />
                    <span>הקופון מיועד למישהו אחר (מתנה)</span>
                  </label>

                  {isGift && (
                    <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
                      <div className="checkout-field">
                        <label htmlFor="co-gift-email">
                          מייל המקבל <span className="checkout-field__required">*</span>
                        </label>
                        <input
                          id="co-gift-email"
                          name="gift_recipient_email"
                          type="email"
                          required={isGift}
                          dir="ltr"
                          placeholder="name@example.com"
                        />
                      </div>
                      <div className="checkout-field">
                        <label htmlFor="co-gift-name">שם המקבל</label>
                        <input id="co-gift-name" name="gift_recipient_name" maxLength={80} />
                      </div>
                      <div className="checkout-field">
                        <label htmlFor="co-gift-message">ברכה אישית</label>
                        <textarea
                          id="co-gift-message"
                          name="gift_message"
                          maxLength={500}
                          placeholder="מזל טוב! בקיצור, תיהנו."
                        />
                      </div>
                      <p className="checkout-privacy">
                        אחרי התשלום יישלח למקבל מייל עם קישור אישי לקבלת הקופון. עד שהוא ייאסף
                        הקופון נשאר בחשבון שלכם.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>

          {!isLastStep(step) && (
            <div className="checkout-nav">
              {step !== 'details' && (
                <button
                  type="button"
                  className="checkout-nav__back"
                  onClick={goBack}
                  disabled={busy}
                >
                  חזרה
                </button>
              )}
              <button type="button" className="checkout-nav__next" onClick={goNext} disabled={busy}>
                המשך
              </button>
            </div>
          )}
        </div>

        <aside className="checkout-step" hidden={step !== 'review' && step !== 'confirm'}>
          <section className="checkout-review" aria-label="ההזמנה שלך">
            <h2 className="checkout-section__title">
              <span>ההזמנה שלך</span>
            </h2>

            <div className="checkout-step" hidden={step === 'confirm'}>
              <table className="checkout-review__table">
                <thead>
                  <tr>
                    <th scope="col">מוצר</th>
                    <th scope="col">מחיר</th>
                  </tr>
                </thead>
                <tbody>
                  {cart.items.map((item) => (
                    <tr key={`${item.product_id}::${item.variant_id ?? 'null'}`}>
                      <td>
                        <span className="checkout-item__name">
                          {item.name_he} × {item.quantity}
                        </span>
                        {item.type === 'coupon' && item.balance_due_at_business > 0 && (
                          <span className="checkout-item__meta">
                            תשלום באתר: {shekels(item.customer_pays_now)} · יתרה בעסק:{' '}
                            {shekels(item.balance_due_at_business)}
                          </span>
                        )}
                      </td>
                      <td className="checkout-item__total">{shekels(item.customer_pays_now)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="checkout-review__row">
                    <th scope="row">מחיר</th>
                    <td>{shekels(itemsTotal)}</td>
                  </tr>
                  {balanceAtBusiness > 0 && (
                    <tr className="checkout-review__row checkout-review__row--muted">
                      <th scope="row">יתרה לתשלום בעסק (בקופון)</th>
                      <td>{shekels(balanceAtBusiness)}</td>
                    </tr>
                  )}
                  <tr className="checkout-review__row checkout-review__row--total">
                    <th scope="row">סה&quot;כ</th>
                    <td>{shekels(cart.subtotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="checkout-payment">
              <div className="checkout-step" hidden={step !== 'confirm'}>
                {/*
                Sourced from refs/electro-checkout-text.json, captured with a
                real browser against Electro's own checkout. Electro has no
                stepper, so what it contributes is the CONTENT of this block and
                its order, not a step of its own. Its body copy is theme filler
                (Lorem ipsum, a Stripe test card) and is deliberately not shipped.
              */}
                <ol className="checkout-confirm__sections">
                  {confirmSections.map((section) => (
                    <li key={section.id}>{section.title}</li>
                  ))}
                </ol>

                <div className="checkout-payment__method">
                  <input type="radio" checked readOnly id="co-pay-card" />
                  <label htmlFor="co-pay-card">תשלום בעזרת כרטיס אשראי</label>
                </div>
                <p className="checkout-payment__note">תשלום מאובטח באשראי, באמצעות Cardcom.</p>

                {step !== 'confirm' && savedCards.length > 0 && (
                  <fieldset className="checkout-cards">
                    <legend className="checkout-cards__legend">אמצעי תשלום</legend>
                    {savedCards.map((card) => (
                      <label className="checkout-cards__option" key={card.id}>
                        <input
                          type="radio"
                          name="token_id"
                          value={card.id}
                          checked={paymentChoice === card.id}
                          onChange={() => setPaymentChoice(card.id)}
                        />
                        <span>
                          {card.brand ?? 'כרטיס'} המסתיים ב-{card.last4 ?? '****'}
                        </span>
                      </label>
                    ))}
                    <label className="checkout-cards__option">
                      <input
                        type="radio"
                        name="token_id"
                        value="new"
                        checked={paymentChoice === 'new'}
                        onChange={() => setPaymentChoice('new')}
                      />
                      <span>כרטיס אחר</span>
                    </label>
                  </fieldset>
                )}

                {step !== 'confirm' && walletBalance > 0 && (
                  <div className="checkout-wallet">
                    <label htmlFor="co-wallet">
                      שימוש ביתרת ארנק (זמין: {shekels(walletBalanceAgorot)})
                    </label>
                    <input
                      id="co-wallet"
                      name="apply_wallet_ils"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={walletMaxIls}
                      step="0.01"
                      defaultValue={0}
                      /*
                        The three attributes above enforce nothing: this form is
                        `noValidate`, which is what lets it run its own step
                        gate and which also switches off every native
                        constraint in it. See lib/checkout/wallet-input.ts for
                        what a number above the ceiling used to reach the
                        shopper as.

                        On blur rather than on change, so the clamp never
                        rewrites a half-typed number under the cursor.
                      */
                      onBlur={(event) => {
                        event.currentTarget.value = clampWalletIls(
                          event.currentTarget.value,
                          walletMaxIls,
                        )
                      }}
                    />
                  </div>
                )}

                <p className="checkout-privacy">
                  הפרטים האישיים ישמשו לצורך ביצוע הרכישה, ולא יועברו לגורם שאינו מורשה בהתאם
                  למדיניות הפרטיות.
                </p>

                <label className="checkout-terms">
                  <input
                    type="checkbox"
                    name="accept_terms"
                    aria-invalid={errorFor('accept_terms') ? 'true' : undefined}
                  />
                  <span>
                    קראתי ואני מסכים לאתר תנאי שימוש{' '}
                    <span className="checkout-field__required">*</span>
                  </span>
                </label>
                {errorFor('accept_terms') && (
                  <span className="checkout-field__error" role="alert">
                    {errorFor('accept_terms')}
                  </span>
                )}

                {!usingSavedCard && (
                  <label className="checkout-terms">
                    <input type="checkbox" name="save_card" defaultChecked />
                    <span>שמירת כרטיס לתשלום מהיר בפעם הבאה</span>
                  </label>
                )}

                {formError && (
                  <div className="checkout-error" role="alert">
                    <span>{formError}</span>
                    {/*
                    Only offered when the code says another press could work.
                    A retry on a disabled checkout or a missing address walks
                    the shopper into the same refusal, which reads as the site
                    being broken rather than as an answer.
                  */}
                    {failureKind === 'retryable' && (
                      <button
                        type="button"
                        className="checkout-error__retry"
                        onClick={() => formRef.current?.requestSubmit()}
                        disabled={busy}
                      >
                        {busy ? 'שולח שוב...' : 'נסו שוב'}
                      </button>
                    )}
                  </div>
                )}
                {authError && (
                  <div className="checkout-error" role="alert">
                    {authError}
                  </div>
                )}

                <button type="submit" className="checkout-pay-btn" disabled={busy}>
                  {busy
                    ? googlePending
                      ? 'מעביר להתחברות...'
                      : usingSavedCard
                        ? 'מחייב את הכרטיס השמור...'
                        : 'מעביר לדף תשלום מאובטח...'
                    : 'שליחת הזמנה'}
                </button>

                <button
                  type="button"
                  className="checkout-nav__back checkout-nav__back--review"
                  onClick={goBack}
                  disabled={busy}
                >
                  חזרה לעריכת הכתובת
                </button>
              </div>

              {step === 'review' && (
                <button
                  type="button"
                  className="checkout-nav__next"
                  onClick={goNext}
                  disabled={busy}
                >
                  המשך לאישור
                </button>
              )}
            </div>
          </section>
        </aside>
      </form>

      {frame && (
        <section className="checkout-frame" aria-label="תשלום מאובטח">
          <div className="checkout-frame__head">
            <span className="checkout-frame__title">תשלום מאובטח</span>
            <span className="checkout-frame__order">הזמנה {frame.orderId.slice(0, 8)}</span>
          </div>
          {/*
            The payment page runs here rather than in place of the site. When it
            finishes, Cardcom navigates THIS iframe to /checkout/return, and
            PaymentFrameBreakout on that page moves the top window to itself —
            which is why lib/security/frame-policy.ts relaxes frame-ancestors to
            'self' on that one path and nowhere else.
          */}
          <iframe
            src={frame.url}
            title="דף תשלום מאובטח של Cardcom"
            className="checkout-frame__iframe"
            // The payment page needs scripts and same-origin storage against
            // its OWN origin. allow-same-origin is granted without
            // allow-top-navigation, so the framed page can work but cannot
            // move the tab out from under the shopper on its own.
            sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
          />
          <p className="checkout-frame__note">
            החיוב מתבצע מול Cardcom. אל תסגור את החלון עד לסיום התשלום.
          </p>
        </section>
      )}
    </>
  )
}
