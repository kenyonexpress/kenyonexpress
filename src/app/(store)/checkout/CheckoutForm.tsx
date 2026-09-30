'use client'

import CityAutocomplete from '@/components/checkout/CityAutocomplete'
import DeliverySlotPicker from '@/components/checkout/DeliverySlotPicker'
import { trackCommerce } from '@/lib/analytics/commerce-client'
import { getCheckoutVariant } from '@/lib/analytics/feature-flags'
import { track } from '@/lib/analytics/tracker'
import type { CartView } from '@/lib/cart/types'
import { MIN_WALLET_REDEMPTION_ILS, redeemableCeilingAgorot } from '@/lib/cashback/redemption'
import type { DeliverySlot } from '@/lib/checkout/delivery-slots'
import { sectionsFromElectro } from '@/lib/checkout/electro-content'
import { checkOptionalIsraeliPostalCode } from '@/lib/checkout/israeli-postal-code'
import { cityFromPostalCode, postalCodeMatchesCity } from '@/lib/checkout/postal-autofill'
import {
  type CheckoutStep,
  STEP_TITLES,
  type StepErrors,
  type StepValues,
  classifyCheckoutFailure,
  validateAllSteps,
} from '@/lib/checkout/steps'
import { clampWalletIls } from '@/lib/checkout/wallet-input'
import { cityByName } from '@/lib/geo/cities'
import { type Agorot, parseIls, sumAgorot } from '@/lib/money'
import { shekels } from '@/lib/money-format'
import { PAYMENT_GATE_CLOSED_MESSAGE } from '@/lib/payments/provider-gate'
import { estimateDelivery } from '@/lib/shipping/estimate'
import { type AuthState, signInWithGoogle } from '@/server/actions/auth'
import { type CheckoutFormState, submitCheckout } from '@/server/actions/payments/checkout'
import Link from 'next/link'
import { useActionState, useEffect, useRef, useState } from 'react'
import { useCheckoutVariant } from './useCheckoutVariant'

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

/**
 * The cart's delivery-city preference, shared with `CartDeliveryEstimate`.
 * Written here when a picked checkout city is one the estimate knows, so the
 * cart and the checkout stop quoting two different cities to one shopper.
 */
const DELIVERY_CITY_KEY = 'ke_delivery_city_v1'

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
  'delivery_slot',
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

/**
 * The checkout, on one page.
 *
 * It was a four-step wizard on desktop until 30.09.2026 and a single long
 * column below 992px, because live's WooCommerce checkout is one page at every
 * width and the pixel gate at 380 and 768 said so. Now it is one page at 1440
 * too: billing on the right, "ההזמנה שלך" on the left, one submit at the
 * bottom of the panel. The sections keep their names from
 * lib/checkout/steps.ts because the validation is still per section and a
 * saved address still switches two of them off at once.
 */
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
  deliverySlots = [],
  paymentGateOpen = true,
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
   * Generated on the server from one clock (lib/checkout/delivery-slots.ts),
   * empty when nothing in the cart is delivered.
   */
  deliverySlots?: readonly DeliverySlot[]
  /**
   * False while the payment provider gate is closed: the form fills, the pay
   * button does not fire, and the server refuses anyway. See
   * lib/payments/provider-gate.ts.
   */
  paymentGateOpen?: boolean
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
  const checkoutVariant = useCheckoutVariant()

  // biome-ignore lint/correctness/useExhaustiveDependencies: the cart is a fresh object each render; keying on its identity would refire the event on every keystroke.
  useEffect(() => {
    // The flag decision first, so this begin_checkout (the funnel's entry
    // event for the experiment) carries $feature/checkout_variant. The
    // promise settles in at most ~2s and only delays the EVENT, never the
    // page; a fired-then-flagged ordering would leave the experiment's
    // exposure event without its entry step.
    void getCheckoutVariant().then(() => {
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
        // `total`, not `subtotal`: the amount the card is actually charged,
        // after a discount code. Reporting the pre-discount figure makes every
        // funnel report overstate the value of reaching checkout.
        valueAgorot: cart.total,
      })
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
  const [fieldErrors, setFieldErrors] = useState<StepErrors>({})

  /**
   * A saved address is submitted by id, so its fields are never rendered. With
   * nothing in the DOM to read, the rules would report missing required fields
   * against a summary the shopper cannot edit.
   *
   * BOTH sections, not just the address one. The personal-details block
   * collapses to the saved name on the same condition, so the details rules
   * were checking `first_name`, `last_name`, `phone` and `email` against a
   * form that renders none of the four. The submission never wanted those
   * fields here: `submitCheckout` reads them only inside
   * `if (needsAddress && !addressId)` and takes the email from the session.
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

  const errorFor = (field: string): string | undefined => fieldErrors[field]
  /**
   * The id of a field's error node, and undefined when it has no error.
   *
   * `aria-invalid` alone says "this is wrong" and never says WHAT is wrong: a
   * screen reader lands on the input, announces "invalid", and the Hebrew
   * message sitting next to it is not part of the accessible description.
   * Israeli standard 5568 adopts WCAG 2.0 AA, which makes 3.3.1 Error
   * Identification a legal requirement here, not a nicety.
   */
  const errorIdFor = (field: string): string | undefined =>
    fieldErrors[field] ? `co-err-${field.replaceAll('_', '-')}` : undefined

  /**
   * Land the shopper on the first thing that is wrong. On a single page the
   * error may be a screen above the button they pressed, and a red line they
   * cannot see is the same as no line.
   */
  const focusFirstInvalid = () => {
    const form = formRef.current
    if (!form) return
    window.requestAnimationFrame(() => {
      const target = form.querySelector<HTMLElement>('[aria-invalid="true"]')
      if (!target) return
      target.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
      target.focus?.({ preventScroll: true })
    })
  }

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
  // STEP 13: min(balance, on-site charge), or 0 when that sits under the ₪10
  // floor. Zero means the box is replaced by a sentence, not offered and
  // then refused.
  const walletMaxIls = redeemableCeilingAgorot(walletBalanceAgorot, cart.subtotal) / 100

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

  /**
   * The city as far as the delivery estimate is concerned. Starts from the
   * prefill (a saved address has one), follows a picked suggestion, and is
   * re-read from the field on blur so a typed city counts too. Only a city
   * `cities.ts` knows produces an estimate; anything else leaves the slot
   * picker on the registry's own 3-7 day band.
   */
  const [cityName, setCityName] = useState(address.city)
  const isSupplierDelivery = cart.shipping?.method === 'supplier_delivery'
  const deliveryEstimate = isSupplierDelivery
    ? estimateDelivery(cityByName(cityName)?.slug, 'supplier_delivery')
    : null

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
      if (
        field instanceof HTMLInputElement ||
        field instanceof HTMLTextAreaElement ||
        field instanceof HTMLSelectElement
      ) {
        if (!field.value) field.value = value
      }
    }
    if (saved.city) setCityName(saved.city)
    window.sessionStorage.removeItem(RESUME_KEY)
  }, [resuming])

  const validateZip = (value: string): boolean => {
    const check = checkOptionalIsraeliPostalCode(value)
    setZipError(check && !check.ok ? check.message : null)
    return !check || check.ok
  }

  /**
   * Postal-code autofill, both ways, and never over a typed value.
   *
   * `zipHint` is advice, not an error: it names the field that was filled in
   * for the shopper, or the region a typed code belongs to when that is not
   * the typed city. Neither blocks the submit; `zipError` alone does that.
   */
  const [zipHint, setZipHint] = useState<string | null>(null)
  const lookupRef = useRef<AbortController | null>(null)

  const fieldByName = (name: string): HTMLInputElement | null => {
    const field = formRef.current?.elements.namedItem(name)
    return field instanceof HTMLInputElement ? field : null
  }

  /** Code -> city, on leaving the zip field. Fills an empty city, hints on a mismatch. */
  const handleZipBlur = (value: string) => {
    if (!validateZip(value)) {
      setZipHint(null)
      return
    }
    const region = cityFromPostalCode(value)
    const city = fieldByName('city')
    if (!region || !city) {
      setZipHint(null)
      return
    }
    if (city.value.trim() === '') {
      city.value = region
      setCityName(region)
      setZipHint(`העיר הושלמה לפי המיקוד: ${region}. אפשר לערוך.`)
      return
    }
    setZipHint(
      postalCodeMatchesCity(value, city.value)
        ? null
        : `המיקוד שהוזן שייך לאזור ${region}. כדאי לבדוק.`,
    )
  }

  /**
   * City + street + house -> code, on leaving any of the three. Asks the
   * server only when the zip is still empty, and drops a stale answer if the
   * shopper moved on to another address before it arrived. Every failure is
   * silence: the field is optional, and a lookup that did not work must not
   * read as a checkout that did not.
   */
  const suggestZip = () => {
    const zip = fieldByName('zip')
    if (!zip || zip.value.trim() !== '') return
    const city = fieldByName('city')?.value.trim() ?? ''
    const street = fieldByName('street')?.value.trim() ?? ''
    const house = fieldByName('street_number')?.value.trim() ?? ''
    if (!city || !street || !house) return

    lookupRef.current?.abort()
    const controller = new AbortController()
    lookupRef.current = controller
    const params = new URLSearchParams({ city, street, house })
    fetch(`/api/checkout/postal-code?${params.toString()}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { zip?: string | null } | null) => {
        if (controller.signal.aborted) return
        const suggested = payload?.zip
        if (typeof suggested !== 'string' || !suggested) return
        // Re-read at arrival time, not at request time: the shopper may have
        // typed the code themselves while the lookup was in flight.
        const target = fieldByName('zip')
        if (!target || target.value.trim() !== '') return
        target.value = suggested
        validateZip(suggested)
        setZipHint('המיקוד הושלם אוטומטית לפי הכתובת. אפשר לערוך.')
      })
      .catch(() => {
        // Aborted, offline, or a non-JSON answer. Nothing to fill.
      })
  }

  const handleCityBlur = () => {
    setCityName(fieldByName('city')?.value ?? '')
    suggestZip()
  }

  const handleCityPick = (name: string) => {
    setCityName(name)
    const known = cityByName(name)
    if (!known) return
    try {
      window.localStorage.setItem(DELIVERY_CITY_KEY, known.slug)
    } catch {
      // Storage disabled: the cart keeps its own city, the estimate here still shows.
    }
  }

  // The single gate that makes this a guest checkout: the form is filled, and
  // only the press of "pay" needs an identity. A guest is stashed and sent to
  // Google here instead of being turned away at the door.
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    const form = event.currentTarget

    // Belt to the disabled button's braces: a submit reached by Enter in a
    // field, or by a script, must not start an order the server will refuse.
    if (!paymentGateOpen) {
      event.preventDefault()
      return
    }

    const zip = (form.elements.namedItem('zip') as HTMLInputElement | null)?.value ?? ''
    if (!validateZip(zip)) {
      event.preventDefault()
      focusFirstInvalid()
      return
    }

    // Every section at once. There is one submit on this page and every field
    // is in the DOM, so the whole form is judged in page order and the shopper
    // is taken to the first thing that is wrong.
    const errors = validateAllSteps(readValues(), savedAddressAnswersFor)
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      event.preventDefault()
      focusFirstInvalid()
      return
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

  const payLabel = !paymentGateOpen
    ? 'התשלום ייפתח בקרוב'
    : busy
      ? googlePending
        ? 'מעביר להתחברות...'
        : usingSavedCard
          ? 'מחייב את הכרטיס השמור...'
          : 'מעביר לדף תשלום מאובטח...'
      : 'שליחת הזמנה'

  /**
   * The three blocks Electro shows below its order review, in Electro's order
   * (see lib/checkout/electro-content.ts). Rendered by id so a refreshed
   * capture that reorders them reorders this panel without a code change.
   */
  const renderConfirmSection = (id: 'payment-note' | 'privacy' | 'terms') => {
    if (id === 'payment-note') {
      return (
        <div key={id}>
          <div className="checkout-payment__method">
            <input type="radio" checked readOnly id="co-pay-card" />
            <label htmlFor="co-pay-card">תשלום בעזרת כרטיס אשראי</label>
          </div>
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

          {walletBalance > 0 && walletMaxIls <= 0 && (
            <p className="checkout-wallet-note" data-testid="wallet-floor-note">
              מימוש קאשבק מהארנק אפשרי מסכום של ₪{MIN_WALLET_REDEMPTION_ILS} ומעלה (יתרה זמינה:{' '}
              {shekels(walletBalanceAgorot)})
            </p>
          )}
          {walletBalance > 0 && walletMaxIls > 0 && (
            <div className="checkout-wallet">
              <label htmlFor="co-wallet">
                שימוש ביתרת ארנק (זמין: {shekels(walletBalanceAgorot)}, מינימום ₪
                {MIN_WALLET_REDEMPTION_ILS})
              </label>
              <input
                id="co-wallet"
                name="apply_wallet_ils"
                type="number"
                inputMode="decimal"
                min={MIN_WALLET_REDEMPTION_ILS}
                max={walletMaxIls}
                step="0.01"
                defaultValue={0}
                /*
                  The three attributes above enforce nothing: this form is
                  `noValidate`, which is what lets it run its own gate and
                  which also switches off every native constraint in it. See
                  lib/checkout/wallet-input.ts for what a number above the
                  ceiling used to reach the shopper as.

                  On blur rather than on change, so the clamp never rewrites
                  a half-typed number under the cursor.
                */
                onBlur={(event) => {
                  event.currentTarget.value = clampWalletIls(
                    event.currentTarget.value,
                    walletMaxIls,
                    MIN_WALLET_REDEMPTION_ILS,
                  )
                }}
              />
            </div>
          )}
        </div>
      )
    }
    if (id === 'privacy') {
      return (
        <p key={id} className="checkout-privacy">
          הפרטים האישיים ישמשו לצורך ביצוע הרכישה, ולא יועברו לגורם שאינו מורשה בהתאם למדיניות
          הפרטיות.
        </p>
      )
    }
    return (
      <div key={id}>
        <label className="checkout-terms">
          <input
            type="checkbox"
            name="accept_terms"
            aria-invalid={errorFor('accept_terms') ? 'true' : undefined}
            aria-describedby={errorIdFor('accept_terms')}
          />
          <span>
            קראתי ואני מסכים/ה ל
            <Link href="/terms-and-conditions" target="_blank" rel="noopener">
              תנאי השימוש
            </Link>{' '}
            של האתר <span className="checkout-field__required">*</span>
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
      </div>
    )
  }

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

      {!paymentGateOpen && (
        <output className="checkout-gate-notice" data-testid="payment-gate-notice">
          {PAYMENT_GATE_CLOSED_MESSAGE}
        </output>
      )}

      {/* Its own form: nesting it inside the checkout form is invalid HTML and
          would make the OAuth submit carry the whole address payload. */}
      <form action={googleAction} ref={googleFormRef} hidden>
        <input type="hidden" name="next" value="/checkout?resume=1" />
      </form>

      <form
        action={formAction}
        onSubmit={handleSubmit}
        ref={formRef}
        className="checkout-page__grid"
        data-checkout-variant={checkoutVariant}
        data-payment-gate={paymentGateOpen ? 'open' : 'closed'}
        noValidate
      >
        <input type="hidden" name="client_ref" value={clientRef} />
        <input type="hidden" name="channel" value={channel} />
        <input type="hidden" name="needs_address" value={needsAddress ? 'true' : 'false'} />
        {address.id && <input type="hidden" name="address_id" value={address.id} />}

        <div className="checkout-col-main">
          <section className="checkout-section" aria-label={STEP_TITLES.details}>
            <h2 className="checkout-section__title">
              <span>{STEP_TITLES.details}</span>
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
                        Hebrew page; the form around them stays RTL.
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
              </>
            )}
          </section>

          <section className="checkout-section" aria-label={STEP_TITLES.address}>
            <h2 className="checkout-section__title">
              <span>{STEP_TITLES.address}</span>
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
                    <CityAutocomplete
                      id="co-city"
                      defaultValue={prefill.city}
                      invalid={Boolean(errorFor('city'))}
                      describedBy={errorIdFor('city')}
                      onBlur={handleCityBlur}
                      onPick={(city) => handleCityPick(city.name)}
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
                      onBlur={suggestZip}
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
                      onBlur={suggestZip}
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
                        zipError || errorFor('zip')
                          ? 'co-zip-error'
                          : zipHint
                            ? 'co-zip-hint'
                            : undefined
                      }
                      onBlur={(event) => handleZipBlur(event.currentTarget.value)}
                      onChange={() => setZipHint(null)}
                    />
                    {(zipError || errorFor('zip')) && (
                      <span className="checkout-field__error" id="co-zip-error" role="alert">
                        {zipError ?? errorFor('zip')}
                      </span>
                    )}
                    {/* Advice, announced politely: it never blocks the submit. */}
                    {!zipError && !errorFor('zip') && zipHint && (
                      <span className="checkout-field__hint" id="co-zip-hint" aria-live="polite">
                        {zipHint}
                      </span>
                    )}
                  </div>
                  <div />
                </div>
              </>
            )}

            {/*
              Only for a supplier delivery: a pickup happens when the shopper
              and the supplier agree, and a coupon is redeemed at the counter.
              Rendered for a saved address too, since the slot is about the
              order and not about which address row it ships to.
            */}
            {isSupplierDelivery && deliverySlots.length > 0 && (
              <div className="checkout-fields-row checkout-fields-row--single">
                <DeliverySlotPicker
                  id="co-delivery-slot"
                  slots={deliverySlots}
                  estimate={deliveryEstimate}
                />
              </div>
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
                maxLength={500}
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
                  <div className="checkout-gift">
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
                      אחרי התשלום יישלח למקבל מייל עם קישור אישי לקבלת הקופון. עד שהוא ייאסף הקופון
                      נשאר בחשבון שלכם.
                    </p>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        {/* Beside the billing form the whole way, as live keeps its
            "ההזמנה שלך" panel (refs/live-checkout capture: panel x~120..470
            at 1440 while the form is filled). */}
        <aside>
          <section className="checkout-review" aria-label="ההזמנה שלך">
            <h2 className="checkout-section__title">
              <span>ההזמנה שלך</span>
            </h2>

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
                {cart.shipping && (
                  <tr className="checkout-review__row">
                    <th scope="row">משלוח: {cart.shipping.label}</th>
                    <td>{cart.shipping.cost === 0 ? 'ללא עלות' : shekels(cart.shipping.cost)}</td>
                  </tr>
                )}
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

            <div className="checkout-payment">
              {confirmSections.map((section) => renderConfirmSection(section.id))}

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

              <button
                type="submit"
                className="checkout-pay-btn"
                disabled={busy || !paymentGateOpen}
                aria-describedby={paymentGateOpen ? undefined : 'co-gate-note'}
              >
                {payLabel}
              </button>
              {!paymentGateOpen && (
                <p id="co-gate-note" className="checkout-field__hint">
                  {PAYMENT_GATE_CLOSED_MESSAGE}
                </p>
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
            PaymentFrameBreakout on that page moves the top window to itself,
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
