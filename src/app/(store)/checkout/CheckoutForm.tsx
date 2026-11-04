'use client'

import CheckoutConsentText, { CheckoutPrivacyNote } from '@/components/checkout/CheckoutConsentText'
import TurnstileWidget from '@/components/fraud/TurnstileWidget'
import { trackCheckoutStep } from '@/lib/analytics/checkout-steps'
import { trackCommerce } from '@/lib/analytics/commerce-client'
import type { CartView } from '@/lib/cart/types'
import { paymentReturnTarget } from '@/lib/checkout/frame-return-message'
import { checkOptionalIsraeliPostalCode } from '@/lib/checkout/israeli-postal-code'
import {
  CHECKOUT_STEPS,
  type CheckoutStep,
  type StepErrors,
  type StepValues,
  classifyCheckoutFailure,
  validateStep,
} from '@/lib/checkout/steps'
import { clampWalletIls } from '@/lib/checkout/wallet-input'
import type { GiftDraft } from '@/lib/gifts/draft'
import { GIFT_WRAP_FEE_AGOROT, giftDateInputBounds } from '@/lib/gifts/wrap'
import { t } from '@/lib/i18n/messages'
import { type Agorot, parseIls, sumAgorot } from '@/lib/money'
import { shekelsRounded } from '@/lib/money-format'
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

/** What the account has saved under "invoice to business", if anything. */
export type CheckoutInvoicePrefill = {
  invoiceToBusiness: boolean
  businessName: string | null
  businessRegistrationNumber: string | null
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
  invoiceSettings = null,
  giftPrefill = null,
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
  /**
   * The account's saved "invoice to business" preference, so the block below
   * opens pre-filled for a returning business customer. Null for a shopper who
   * never set one (and for a guest, who has no row to read).
   */
  invoiceSettings?: CheckoutInvoicePrefill | null
  /**
   * S22: what the shopper typed on /gift/[product]. The gift box opens ticked
   * and filled; they can still edit or untick it here.
   */
  giftPrefill?: GiftDraft | null
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
  const payButtonRef = useRef<HTMLButtonElement>(null)

  /**
   * Whether the real pay button is on screen, which hides the sticky bar.
   * Starts false so the bar is server-rendered and present from first paint;
   * the observer corrects it after mount. Without IntersectionObserver (old
   * WebViews) the bar simply stays, which is the safe side: two ways to pay.
   */
  const [payButtonVisible, setPayButtonVisible] = useState(false)
  useEffect(() => {
    const button = payButtonRef.current
    if (!button || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) =>
      setPayButtonVisible(Boolean(entry?.isIntersecting)),
    )
    observer.observe(button)
    return () => observer.disconnect()
  }, [])

  const [paymentChoice, setPaymentChoice] = useState<string>(
    savedCards.find((card) => card.isDefault)?.id ?? savedCards[0]?.id ?? 'new',
  )
  const usingSavedCard = paymentChoice !== 'new'
  const [zipError, setZipError] = useState<string | null>(null)

  // Q08: the business-invoice fields show only once the box is ticked, like the
  // gift block. The inputs stay MOUNTED either way (hidden by the wrapper), so
  // a saved name survives an untick-and-retick within the same visit.
  const [businessInvoice, setBusinessInvoice] = useState(
    Boolean(invoiceSettings?.invoiceToBusiness),
  )
  const [stepErrors, setStepErrors] = useState<StepErrors>({})
  // Bumped on every refused press, so the summary re-announces even when the
  // same fields are still wrong the second time.
  const [submitAttempts, setSubmitAttempts] = useState(0)

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

  /**
   * A COUPON SHIPS NOWHERE, AND THE STEP GATE DID NOT KNOW THAT.
   *
   * `validateAddressStep` requires city, street and street number from every
   * shopper unconditionally, and the address step renders for everyone whose
   * account has no saved address. So a first-time buyer of a coupon - which is
   * most of this catalogue and most of its customers - reached step 2 and could
   * not leave it without inventing a delivery address for something that is
   * delivered by email. Measured 2026-09-10 against a coupon-only cart on the
   * production build: "המשך" refused with שדה חובה on all three fields.
   *
   * The server had it right the whole time. `validateCartView` computes
   * `requiresAddress: hasPhysical`, the form posts it as `needs_address`, and
   * `submitCheckout` reads the address fields only inside
   * `if (needsAddress && !addressId)`. The address the shopper was forced to
   * type was then discarded. Only the client-side step gate was asking.
   *
   * The step itself is KEPT rather than dropped from the list: the order notes
   * and the whole gift block live in it, and gifting is a coupon feature. What
   * changes is that the address fields are not rendered, the gate has nothing
   * to demand, and the step is named for what it actually contains.
   */
  const addressNotNeeded: CheckoutStep[] = needsAddress ? [] : ['address']
  const stepsWithNothingToFill: CheckoutStep[] = [...savedAddressAnswersFor, ...addressNotNeeded]

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
    if (stepsWithNothingToFill.includes(target)) return {}
    return validateStep(target, readValues())
  }

  /**
   * Every rule, every section, in one pass. Electro's checkout is one page with
   * no stepper (V02), so there is no "current step" to gate: the press of pay
   * is the only moment the shopper says "done", and it answers with every
   * missing field at once rather than one section at a time.
   */
  const checkAll = (): StepErrors =>
    Object.assign({}, ...CHECKOUT_STEPS.map((entry) => checkStep(entry)))

  /**
   * Focus the first wrong field in DOM order, which is the order the shopper
   * reads. Focusing also scrolls it into view, so a phone user who pressed the
   * sticky pay bar at the bottom lands on the field that stopped them instead
   * of on an error they cannot see.
   */
  const focusFirstError = (errors: StepErrors) => {
    const form = formRef.current
    if (!form) return
    for (const element of Array.from(form.elements)) {
      const name = (element as HTMLInputElement).name
      if (name && errors[name] && element instanceof HTMLElement) {
        element.focus()
        return
      }
    }
  }

  const errorFor = (field: string): string | undefined => stepErrors[field]
  /**
   * The id of a field's error node, and undefined when it has no error.
   *
   * `aria-invalid` alone says "this is wrong" and never says WHAT is wrong: a
   * screen reader lands on the input, announces "invalid", and the Hebrew
   * message sitting next to it is not part of the accessible description. The
   * fields carried `aria-invalid` and no `aria-describedby`, so every checkout
   * error was visible and unannounced. Israeli standard 5568 adopts WCAG 2.0
   * AA, which makes 3.3.1 Error Identification a legal requirement here, not a
   * nicety.
   */
  const errorIdFor = (field: string): string | undefined =>
    stepErrors[field] ? `co-err-${field.replaceAll('_', '-')}` : undefined

  const balanceAtBusiness = cart.balance_due_at_business
  const itemsTotal = sumAgorot(cart.items.map((item) => item.line_total))

  // Gift fields are mounted only while the box is ticked, so an unticked box
  // cannot post a half-typed address, and the server forwards the fields only
  // when both the flag and the email are present.
  const [isGift, setIsGift] = useState(Boolean(giftPrefill))

  /**
   * The date picker's bounds, set AFTER mount rather than at render.
   *
   * `giftDateInputBounds` reads the clock, and the server and the browser do
   * not necessarily agree about which day it is - they are minutes apart at
   * best and on opposite sides of midnight at worst. Rendering the attributes
   * on the server would make that disagreement a hydration mismatch on a form
   * that takes card details. Empty until mounted means the picker is briefly
   * unbounded, which costs nothing: the ceiling that actually decides is
   * `resolveGiftDeliverAt` on the server.
   */
  const [giftDateBounds, setGiftDateBounds] = useState<{ min?: string; max?: string }>({})
  useEffect(() => {
    setGiftDateBounds(giftDateInputBounds())
  }, [])

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
    trackCheckoutStep('identity')
    if (needsAddress) trackCheckoutStep('address')
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

  // S07: a guest pays as a guest. The press of "pay" no longer detours through
  // Google; submitCheckout gives the shopper an anonymous session, and the
  // Google sign-in is offered after payment, on /checkout/return, to keep the
  // order on an account. The "already bought here?" link above stays for the
  // returning customer who wants their saved address and card.
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    const form = event.currentTarget
    const zip = (form.elements.namedItem('zip') as HTMLInputElement | null)?.value ?? ''
    if (!validateZip(zip)) {
      event.preventDefault()
      return
    }

    // Every section, whatever the shopper scrolled past. The zip above has its
    // own blur check, and the rest are the step rules run together.
    const errors = checkAll()
    setStepErrors(errors)
    if (Object.keys(errors).length > 0) {
      event.preventDefault()
      setSubmitAttempts((count) => count + 1)
      focusFirstError(errors)
      return
    }

    trackCheckoutStep('payment_redirect')
  }

  // The returning customer's way to their saved address and card. What they
  // already typed is stashed so the ?resume=1 trip back refills it.
  const signInFromNotice = () => {
    const form = formRef.current
    if (form) {
      const data = new FormData(form)
      const stash: Record<string, string> = {}
      for (const name of RESUME_FIELDS) {
        const value = data.get(name)
        if (typeof value === 'string' && value !== '') stash[name] = value
      }
      try {
        window.sessionStorage.setItem(RESUME_KEY, JSON.stringify(stash))
      } catch {
        // A blocked sessionStorage costs the refill, not the sign-in.
      }
    }
    trackCheckoutStep('guest_login')
    googleFormRef.current?.requestSubmit()
  }

  // The payment frame cannot move this tab (its sandbox withholds
  // allow-top-navigation on purpose), so when Cardcom returns into it,
  // /checkout/frame-return posts the confirmation path here and this page
  // navigates itself. Same origin only, checked again on receipt, and only to
  // a path under /checkout/. src/lib/checkout/frame-return-message.ts.
  const frameUrl = state && 'frame' in state ? state.frame?.url : undefined
  useEffect(() => {
    if (!frameUrl) return
    const onMessage = (event: MessageEvent) => {
      const target = paymentReturnTarget(event.data, event.origin, window.location.origin)
      if (!target) return
      window.location.replace(target)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [frameUrl])

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
          <span>כבר קניתם כאן בעבר?</span>
          <button
            type="button"
            className="checkout-guest-notice__link"
            onClick={signInFromNotice}
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

      {/*
        One page, Electro's: the details, the address and the extras in the
        main column, and the order panel with the payment box and the pay
        button beside it (below it under 992). There is no stepper; the press
        of pay validates every section at once (`checkAll`).
      */}
      <form
        action={formAction}
        onSubmit={handleSubmit}
        ref={formRef}
        className="checkout-page__grid"
        aria-busy={busy || undefined}
        noValidate
      >
        <input type="hidden" name="client_ref" value={clientRef} />
        <input type="hidden" name="channel" value={channel} />
        <input type="hidden" name="needs_address" value={needsAddress ? 'true' : 'false'} />
        {address.id && <input type="hidden" name="address_id" value={address.id} />}

        <div className="checkout-col-main">
          {/*
            WooCommerce's `ul.woocommerce-error`, which Electro paints above the
            billing fields when place-order is refused. Keyed on the attempt so
            a second refused press is announced again, not swallowed as an
            unchanged live region.
          */}
          {Object.keys(stepErrors).length > 0 && (
            <div
              key={submitAttempts}
              className="checkout-error checkout-error--summary"
              role="alert"
              data-testid="checkout-error-summary"
            >
              {t('checkout.single.errorSummary')}
            </div>
          )}

          <div className="checkout-group">
            <section className="checkout-section" aria-label="פרטים אישיים">
              <h2 className="checkout-section__title">
                <span>פרטים אישיים</span>
              </h2>

              {address.id ? (
                <p>{address.full_name}</p>
              ) : (
                <>
                  {/* Email first, as in Electro's billing block: it is where
                      the order and the coupon are sent, and the one field a
                      guest cannot get wrong without losing what they paid for. */}
                  <div className="checkout-fields-row checkout-fields-row--single">
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
                        aria-describedby={errorIdFor('email')}
                      />
                      {errorFor('email') && (
                        <span id="co-err-email" className="checkout-field__error" role="alert">
                          {errorFor('email')}
                        </span>
                      )}
                    </div>
                  </div>

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
                        aria-describedby={errorIdFor('first_name')}
                      />
                      {errorFor('first_name') && (
                        <span id="co-err-first-name" className="checkout-field__error" role="alert">
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
                        aria-describedby={errorIdFor('last_name')}
                      />
                      {errorFor('last_name') && (
                        <span id="co-err-last-name" className="checkout-field__error" role="alert">
                          {errorFor('last_name')}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="checkout-fields-row checkout-fields-row--single">
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
                        aria-describedby={errorIdFor('phone')}
                      />
                      {errorFor('phone') && (
                        <span id="co-err-phone" className="checkout-field__error" role="alert">
                          {errorFor('phone')}
                        </span>
                      )}
                    </div>
                  </div>
                </>
              )}
            </section>

            {/*
              Business VAT fields at checkout (Q08). The same row the account
              page edits (`customer_invoice_settings`, 239): the action upserts
              it BEFORE the charge, and `invoices.ts` reads it when the tax
              document is built. A one-off business purchase therefore needs
              no detour through the account settings first.
            */}
            <section
              className="checkout-section"
              aria-label={t('checkout.businessInvoice.title')}
              data-testid="business-invoice"
            >
              <h2 className="checkout-section__title">
                <span>{t('checkout.businessInvoice.title')}</span>
              </h2>
              <input type="hidden" name="invoice_fields" value="1" />
              <label className="checkout-terms">
                <input
                  type="checkbox"
                  name="invoice_to_business"
                  checked={businessInvoice}
                  onChange={(event) => setBusinessInvoice(event.target.checked)}
                />
                <span>{t('checkout.businessInvoice.toggle')}</span>
              </label>
              <div hidden={!businessInvoice}>
                <div className="checkout-fields-row">
                  <div className="checkout-field">
                    <label htmlFor="co-business-name">
                      {t('checkout.businessInvoice.name')}{' '}
                      <span className="checkout-field__required">*</span>
                    </label>
                    <input
                      id="co-business-name"
                      name="business_name"
                      defaultValue={invoiceSettings?.businessName ?? ''}
                      maxLength={120}
                      autoComplete="organization"
                      aria-invalid={errorFor('business_name') ? 'true' : undefined}
                      aria-describedby={errorIdFor('business_name')}
                    />
                    {errorFor('business_name') && (
                      <span
                        id="co-err-business-name"
                        className="checkout-field__error"
                        role="alert"
                      >
                        {errorFor('business_name')}
                      </span>
                    )}
                  </div>
                  <div className="checkout-field">
                    <label htmlFor="co-business-registration-number">
                      {t('checkout.businessInvoice.registrationNumber')}{' '}
                      <span className="checkout-field__required">*</span>
                    </label>
                    <input
                      id="co-business-registration-number"
                      name="business_registration_number"
                      defaultValue={invoiceSettings?.businessRegistrationNumber ?? ''}
                      inputMode="numeric"
                      maxLength={9}
                      placeholder="123456789"
                      /* Digits, so LTR like the phone above; the label stays RTL. */
                      dir="ltr"
                      aria-invalid={errorFor('business_registration_number') ? 'true' : undefined}
                      aria-describedby={errorIdFor('business_registration_number')}
                    />
                    {errorFor('business_registration_number') && (
                      <span
                        id="co-err-business-registration-number"
                        className="checkout-field__error"
                        role="alert"
                      >
                        {errorFor('business_registration_number')}
                      </span>
                    )}
                  </div>
                </div>
                <p className="checkout-privacy">{t('checkout.businessInvoice.hint')}</p>
              </div>
            </section>
          </div>

          <div className="checkout-group">
            {/*
              Rendered only for a cart that is actually delivered somewhere.
              The order notes and the gift block below stay either way - see
              `addressNotNeeded` for why the step survives without the address.
            */}
            {needsAddress && (
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
                          aria-describedby={errorIdFor('city')}
                        />
                        {errorFor('city') && (
                          <span id="co-err-city" className="checkout-field__error" role="alert">
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
                          aria-describedby={errorIdFor('street')}
                        />
                        {errorFor('street') && (
                          <span id="co-err-street" className="checkout-field__error" role="alert">
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
                          aria-describedby={errorIdFor('street_number')}
                        />
                        {errorFor('street_number') && (
                          <span
                            id="co-err-street-number"
                            className="checkout-field__error"
                            role="alert"
                          >
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
                          aria-describedby={
                            zipError || errorFor('zip') ? 'co-zip-error' : undefined
                          }
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
            )}

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
                          defaultValue={giftPrefill?.gift_recipient_email ?? ''}
                        />
                      </div>
                      <div className="checkout-field">
                        <label htmlFor="co-gift-name">שם המקבל</label>
                        <input
                          id="co-gift-name"
                          name="gift_recipient_name"
                          maxLength={80}
                          defaultValue={giftPrefill?.gift_recipient_name ?? ''}
                        />
                      </div>
                      <div className="checkout-field">
                        <label htmlFor="co-gift-message">ברכה אישית</label>
                        <textarea
                          id="co-gift-message"
                          name="gift_message"
                          maxLength={500}
                          placeholder="מזל טוב! בקיצור, תיהנו."
                          defaultValue={giftPrefill?.gift_message ?? ''}
                        />
                      </div>
                      <div className="checkout-field">
                        <label htmlFor="co-gift-deliver-at">{t('gift.deliverLabel')}</label>
                        <input
                          id="co-gift-deliver-at"
                          name="gift_deliver_at"
                          type="date"
                          /*
                            LTR, like the recipient email above: a date input
                            renders its own yyyy-mm-dd segments and the browser
                            orders them left to right regardless. The label and
                            the hint around it stay RTL.
                          */
                          dir="ltr"
                          min={giftDateBounds.min}
                          max={giftDateBounds.max}
                          defaultValue={giftPrefill?.gift_deliver_at ?? ''}
                        />
                        <span className="checkout-field__hint">{t('gift.deliverHint')}</span>
                      </div>

                      <label className="checkout-terms">
                        <input
                          type="checkbox"
                          name="gift_wrap"
                          defaultChecked={Boolean(giftPrefill?.gift_wrap)}
                        />
                        <span>
                          {t('gift.wrapLabel')} ({shekelsRounded(GIFT_WRAP_FEE_AGOROT)})
                        </span>
                      </label>

                      <p className="checkout-privacy">
                        {/*
                          Reworded for 226: "אחרי התשלום" was true of every gift
                          until a send date existed, and a customer who schedules
                          one for next month must not be told it goes out now.
                        */}
                        {t('gift.notice')}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>

        {/* The order panel, Electro's `#order_review`: the lines, the totals,
            the payment box and the place-order button. Sticky beside the form
            from 992 up, so the total and the button stay in view while the
            shopper fills a long address; stacked below it on a phone, where
            the sticky pay bar further down takes over that job. */}
        <aside className="checkout-col-review">
          <section className="checkout-review" aria-label="ההזמנה שלך">
            <h2 className="checkout-section__title">
              <span>ההזמנה שלך</span>
            </h2>

            <div>
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
                            תשלום באתר: {shekelsRounded(item.customer_pays_now)} · יתרה בעסק:{' '}
                            {shekelsRounded(item.balance_due_at_business)}
                          </span>
                        )}
                      </td>
                      <td className="checkout-item__total">
                        {shekelsRounded(item.customer_pays_now)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="checkout-review__row">
                    <th scope="row">מחיר</th>
                    <td>{shekelsRounded(itemsTotal)}</td>
                  </tr>
                  {balanceAtBusiness > 0 && (
                    <tr className="checkout-review__row checkout-review__row--muted">
                      <th scope="row">יתרה לתשלום בעסק (בקופון)</th>
                      <td>{shekelsRounded(balanceAtBusiness)}</td>
                    </tr>
                  )}
                  <tr className="checkout-review__row checkout-review__row--total">
                    <th scope="row">סה&quot;כ</th>
                    <td>{shekelsRounded(cart.subtotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="checkout-payment">
              <div>
                {/* The radio inside its label, so the whole 44px row is the
                    target and not the 13px circle. */}
                <label className="checkout-payment__method">
                  <input type="radio" checked readOnly />
                  <span>תשלום בעזרת כרטיס אשראי</span>
                </label>
                <p className="checkout-payment__note">תשלום מאובטח באשראי, באמצעות Cardcom.</p>

                {savedCards.length > 0 && (
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

                {walletBalance > 0 && (
                  <div className="checkout-wallet">
                    <label htmlFor="co-wallet">
                      שימוש ביתרת ארנק (זמין: {shekelsRounded(walletBalanceAgorot)})
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

                <CheckoutPrivacyNote />

                <label className="checkout-terms">
                  <input
                    type="checkbox"
                    name="accept_terms"
                    aria-invalid={errorFor('accept_terms') ? 'true' : undefined}
                    aria-describedby={errorIdFor('accept_terms')}
                  />
                  <span>
                    <CheckoutConsentText /> <span className="checkout-field__required">*</span>
                  </span>
                </label>
                {errorFor('accept_terms') && (
                  <span id="co-err-accept-terms" className="checkout-field__error" role="alert">
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

                {/* Renders nothing unless a Turnstile key pair is configured.
                    Placed immediately above the pay button so a shopper who has
                    to solve it sees it at the moment they mean to pay. */}
                <TurnstileWidget action="checkout" />

                <button
                  type="submit"
                  className="checkout-pay-btn"
                  disabled={busy}
                  aria-busy={busy || undefined}
                  ref={payButtonRef}
                >
                  {busy && <span className="checkout-spinner" aria-hidden="true" />}
                  {busy
                    ? googlePending
                      ? 'מעביר להתחברות...'
                      : usingSavedCard
                        ? 'מחייב את הכרטיס השמור...'
                        : 'מעביר לדף תשלום מאובטח...'
                    : 'שליחת הזמנה'}
                </button>
              </div>
            </div>
          </section>
        </aside>

        {/*
          The sticky pay bar, under 992 only (checkout-page.css). On a phone
          the real button sits under the whole form and the order panel, about
          two screens down; this keeps the total and a way to pay under the
          thumb the whole time. A second submit of the SAME form, so it runs
          the same `handleSubmit`: a refused press focuses the first wrong
          field, which scrolls the shopper to it. Hidden while the real button
          is on screen, so the two are never seen together. Named apart from
          "שליחת הזמנה" so a by-name query still finds exactly one button.
        */}
        <div
          className="checkout-sticky-pay"
          data-hidden={payButtonVisible ? '' : undefined}
          data-testid="checkout-sticky-pay"
        >
          <span className="checkout-sticky-pay__total">
            <span className="checkout-sticky-pay__label">{t('checkout.single.stickyTotal')}</span>
            <strong>{shekelsRounded(cart.subtotal)}</strong>
          </span>
          <button
            type="submit"
            className="checkout-sticky-pay__btn"
            disabled={busy}
            aria-busy={busy || undefined}
            tabIndex={payButtonVisible ? -1 : undefined}
          >
            {busy && <span className="checkout-spinner" aria-hidden="true" />}
            {busy ? t('checkout.single.stickyBusy') : t('checkout.single.stickyPay')}
          </button>
        </div>
      </form>

      {frame && (
        <section className="checkout-frame" aria-label="תשלום מאובטח">
          <div className="checkout-frame__head">
            <span className="checkout-frame__title">תשלום מאובטח</span>
            <span className="checkout-frame__order">הזמנה {frame.orderId.slice(0, 8)}</span>
          </div>
          {/*
            The payment page runs here rather than in place of the site. When it
            finishes, Cardcom navigates THIS iframe to /checkout/frame-return,
            which posts the confirmation path up to this page (the sandbox
            below forbids the frame from moving the tab itself), and the
            listener above navigates the tab —
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
