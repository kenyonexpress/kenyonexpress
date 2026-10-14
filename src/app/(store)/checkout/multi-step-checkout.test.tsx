import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * THE CHECKOUT IS THREE STEPS (UX17, 14.10.2026).
 *
 * Personal details, address, payment, with the order review beside them.
 * Until 30.09.2026 desktop showed a four-step wizard; from then until today
 * every section was open at once, and the pay button sat three screens under
 * the first field on a phone (logs/ux17/before.json: y=3065 at 380). These pin
 * the stepped shape: a rail says where the shopper is, one step's body is
 * open at a time, EVERY field stays in the DOM so the one submit still judges
 * the whole form, "continue" judges its own step only, an error the submit
 * finds opens the step that owns it, a saved address starts the flow on the
 * address step with its two summaries, and a closed payment gate still stops
 * the submit at the button and at the handler.
 *
 * Measured here rather than in a browser because the checkout cannot be
 * reached by one on this machine without a seeded cart; e2e/checkout-steps
 * .spec.ts walks the same flow on a built server.
 */

vi.mock('@/lib/analytics/tracker', () => ({ track: vi.fn() }))
vi.mock('@/lib/analytics/commerce-client', () => ({ trackCommerce: vi.fn() }))
vi.mock('@/lib/analytics/feature-flags', () => ({
  getCheckoutVariant: vi.fn(async () => 'control'),
  getVariant: vi.fn(async (experiment: { control: string }) => experiment.control),
}))
vi.mock('@/server/actions/auth', () => ({ signInWithGoogle: vi.fn() }))
vi.mock('@/server/actions/payments/checkout', () => ({ submitCheckout: vi.fn() }))
vi.mock('@/server/actions/shipping', () => ({
  getShippingQuotes: vi.fn(async () => ({ options: [], degraded: false, zone: null })),
}))

import { track } from '@/lib/analytics/tracker'
import type { CartView } from '@/lib/cart/types'
import { listDeliverySlots } from '@/lib/checkout/delivery-slots'
import { agorot } from '@/lib/money'
import CheckoutForm, { type CheckoutAddressPrefill } from './CheckoutForm'

const PHYSICAL_LINE = {
  product_id: '11111111-1111-4111-8111-111111111111',
  variant_id: null,
  quantity: 1,
  name_he: 'מקרר',
  slug: 'fridge',
  image_url: null,
  unit_price: agorot(250000),
  line_total: agorot(250000),
  type: 'physical' as const,
  available: true,
  platform_fee: agorot(25000),
  supplier_due: agorot(225000),
  customer_pays_now: agorot(250000),
  balance_due_at_business: agorot(0),
  platform_percent_bp: 1000,
  platform_percent_snapshot: 10,
  coupon_price_unit: null,
  cashback: agorot(0),
  max_quantity: null,
  unavailable_reason: null,
}

function cart(shipping: CartView['shipping']): CartView {
  return {
    id: 'cart-1',
    items: [PHYSICAL_LINE],
    item_count: 1,
    subtotal: agorot(250000),
    platform_fee: agorot(25000),
    supplier_due: agorot(225000),
    balance_due_at_business: agorot(0),
    coupon: null,
    discount: agorot(0),
    bundles: [],
    bundle_discount: agorot(0),
    shipping,
    cashback: agorot(0),
    total: agorot(250000),
  }
}

const DELIVERY = cart({ method: 'supplier_delivery', label: 'משלוח עד הבית', cost: agorot(0) })
const PICKUP = cart({ method: 'pickup', label: 'איסוף עצמי מהספק', cost: agorot(0) })

const SAVED_ADDRESS: CheckoutAddressPrefill = {
  id: 'addr-1',
  full_name: 'דנה כהן',
  phone: '0501234567',
  city: 'תל אביב',
  street: 'דיזנגוף',
  street_number: '100',
  apartment: '4',
  floor: '2',
  zip: '6100000',
  email: 'dana@example.com',
}

const EMPTY_ADDRESS: CheckoutAddressPrefill = {
  id: null,
  full_name: '',
  phone: '',
  city: '',
  street: '',
  street_number: '',
  apartment: '',
  floor: '',
  zip: '',
  email: '',
}

const SLOTS = listDeliverySlots({ now: new Date('2026-10-01T12:00:00Z') })

const DETAILS = {
  first_name: 'דנה',
  last_name: 'כהן',
  phone: '0501234567',
  email: 'dana@example.com',
}
const ADDRESS = { city: 'תל אביב', street: 'דיזנגוף', street_number: '100' }

function renderCheckout(overrides: Partial<Parameters<typeof CheckoutForm>[0]> = {}) {
  return render(
    <CheckoutForm
      cart={DELIVERY}
      clientRef="00000000-0000-4000-8000-000000000000"
      needsAddress
      address={EMPTY_ADDRESS}
      walletBalance={0}
      savedCards={[]}
      isAuthenticated
      deliverySlots={SLOTS}
      {...overrides}
    />,
  )
}

/** The checkout form itself, not the hidden Google sign-in form rendered before it. */
function checkoutForm(container: HTMLElement): HTMLFormElement {
  const form = container.querySelector<HTMLFormElement>('form.checkout-page__grid')
  if (!form) throw new Error('checkout form missing')
  return form
}

function fill(container: HTMLElement, values: Record<string, string>) {
  for (const [name, value] of Object.entries(values)) {
    const field = container.querySelector<HTMLInputElement>(`[name="${name}"]`)
    if (!field) throw new Error(`field ${name} missing`)
    fireEvent.change(field, { target: { value } })
  }
}

function section(container: HTMLElement, step: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`.checkout-section[data-step="${step}"]`)
  if (!el) throw new Error(`step ${step} missing`)
  return el
}

function body(container: HTMLElement, step: string): HTMLElement {
  const el = section(container, step).querySelector<HTMLElement>('.checkout-section__body')
  if (!el) throw new Error(`step ${step} body missing`)
  return el
}

function railStates(container: HTMLElement): string[] {
  return [...container.querySelectorAll('.checkout-steps__item')].map(
    (li) => li.getAttribute('data-state') ?? '',
  )
}

function current(container: HTMLElement): string | null {
  return container.querySelector('.checkout-steps__item[aria-current="step"]')?.textContent ?? null
}

function invalidNames(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[aria-invalid="true"]')].map(
    (el) => el.getAttribute('name') ?? '',
  )
}

function clickContinue(container: HTMLElement) {
  const open = container.querySelector<HTMLElement>(
    '.checkout-section[data-step-state="current"] .checkout-nav__next',
  )
  if (!open) throw new Error('no continue button on the open step')
  fireEvent.click(open)
}

describe('the stepped checkout', () => {
  it('opens on the first step, with a rail, one open body and every field in the DOM', () => {
    const { container } = renderCheckout()
    expect(railStates(container)).toEqual(['current', 'upcoming', 'upcoming'])
    expect(current(container)).toContain('פרטים אישיים')
    expect(checkoutForm(container).getAttribute('data-flow-step')).toBe('details')

    expect(body(container, 'details').hidden).toBe(false)
    expect(body(container, 'address').hidden).toBe(true)
    expect(body(container, 'payment').hidden).toBe(true)

    // In the DOM the whole time, so the one submit can read them and a
    // resume can refill them.
    expect(container.querySelector('#co-first-name')).toBeTruthy()
    expect(container.querySelector('#co-city')).toBeTruthy()
    expect(container.querySelector('#co-street')?.getAttribute('role')).toBe('combobox')
    expect(container.querySelector('[name="delivery_slot"]')).toBeTruthy()
    expect(container.querySelector('[name="order_notes"]')).toBeTruthy()
    expect(container.querySelector('[name="accept_terms"]')).toBeTruthy()
    expect(container.querySelector('[name="token_id"]')).toBeTruthy()
    expect(container.querySelector('.checkout-pay-btn')).toBeTruthy()
    // The review panel is open beside the steps from the first one.
    expect(screen.getByRole('table').closest('[aria-label="ההזמנה שלך"]')).toBeTruthy()
  })

  it('"continue" judges its own step only, marks it, and stays put', () => {
    const { container } = renderCheckout()
    clickContinue(container)
    expect(invalidNames(container).sort()).toEqual(['email', 'first_name', 'last_name', 'phone'])
    expect(current(container)).toContain('פרטים אישיים')
    expect(body(container, 'details').hidden).toBe(false)
  })

  it('walks forward on a clear step, remembers a summary, and tracks the step reached', () => {
    const { container } = renderCheckout()
    fill(container, DETAILS)
    clickContinue(container)
    expect(railStates(container)).toEqual(['done', 'current', 'upcoming'])
    expect(current(container)).toContain('כתובת למשלוח')
    expect(body(container, 'details').hidden).toBe(true)
    expect(body(container, 'address').hidden).toBe(false)
    const summary = container.querySelector('[data-testid="step-summary-details"]')
    expect(summary?.textContent).toContain('דנה כהן')
    expect(summary?.textContent).toContain('0501234567')
    expect(summary?.textContent).toContain('dana@example.com')
    expect(track).toHaveBeenCalledWith('checkout_step', { step: 'address' })

    fill(container, ADDRESS)
    clickContinue(container)
    expect(railStates(container)).toEqual(['done', 'done', 'current'])
    expect(current(container)).toContain('תשלום')
    expect(container.querySelector('[data-testid="step-summary-address"]')?.textContent).toBe(
      'דיזנגוף 100, תל אביב',
    )
    expect(track).toHaveBeenCalledWith('checkout_step', { step: 'payment' })
    // The payment step has the pay button and no continue.
    expect(body(container, 'payment').querySelector('.checkout-nav__next')).toBeNull()
    expect(body(container, 'payment').querySelector('.checkout-pay-btn')).toBeTruthy()
  })

  it('goes back by the rail, by the back control, and by "edit" on a done step', () => {
    const { container } = renderCheckout()
    fill(container, DETAILS)
    clickContinue(container)
    fill(container, ADDRESS)
    clickContinue(container)

    fireEvent.click(screen.getByRole('button', { name: 'חזרה' }))
    expect(current(container)).toContain('כתובת למשלוח')
    // The field kept its value: the body was hidden, never unmounted.
    expect(container.querySelector<HTMLInputElement>('[name="street"]')?.value).toBe('דיזנגוף')

    fireEvent.click(screen.getByRole('button', { name: 'ערוך פרטים אישיים' }))
    expect(current(container)).toContain('פרטים אישיים')
    expect(railStates(container)).toEqual(['current', 'upcoming', 'upcoming'])

    fill(container, { first_name: 'רונית' })
    clickContinue(container)
    fill(container, ADDRESS)
    clickContinue(container)
    const [detailsBtn] = container.querySelectorAll<HTMLButtonElement>('.checkout-steps__btn')
    if (!detailsBtn) throw new Error('rail button missing')
    fireEvent.click(detailsBtn)
    expect(current(container)).toContain('פרטים אישיים')
  })

  it('judges the whole form on submit, marks every missing field, and opens the first step that owns one', () => {
    const { container } = renderCheckout()
    fill(container, DETAILS)
    clickContinue(container)
    fill(container, ADDRESS)
    clickContinue(container)
    expect(current(container)).toContain('תשלום')

    // Break the first step from behind: the summary says one thing, the
    // field another. The submit judges the field.
    fill(container, { email: 'broken' })
    const form = checkoutForm(container)
    expect(fireEvent.submit(form)).toBe(false)
    expect(invalidNames(container).sort()).toEqual(['accept_terms', 'email'])
    expect(current(container)).toContain('פרטים אישיים')
    expect(body(container, 'details').hidden).toBe(false)
  })

  it('submits an empty form and lands on the first step with everything marked', () => {
    const { container } = renderCheckout()
    const form = checkoutForm(container)
    expect(fireEvent.submit(form)).toBe(false)
    expect(invalidNames(container)).toEqual(
      expect.arrayContaining([
        'first_name',
        'last_name',
        'phone',
        'email',
        'city',
        'street',
        'street_number',
        'accept_terms',
      ]),
    )
    expect(container.querySelectorAll('.checkout-field__error').length).toBeGreaterThanOrEqual(8)
    expect(current(container)).toContain('פרטים אישיים')
  })

  it('lets a filled form through once the terms are ticked', () => {
    const { container } = renderCheckout()
    fill(container, { ...DETAILS, ...ADDRESS })
    const form = checkoutForm(container)

    // Terms unticked: the one remaining error is on the checkbox, and the
    // payment step opens for it.
    expect(fireEvent.submit(form)).toBe(false)
    expect(invalidNames(container)).toEqual(['accept_terms'])
    expect(current(container)).toContain('תשלום')

    fireEvent.click(container.querySelector('[name="accept_terms"]') as HTMLInputElement)
    // The form's action is a React function action, so React cancels the
    // native submit itself and fireEvent.submit always reports it prevented.
    // "Let through" is therefore: no field marked invalid and no error line.
    fireEvent.submit(form)
    expect(container.querySelectorAll('[aria-invalid="true"]')).toHaveLength(0)
    expect(container.querySelectorAll('.checkout-field__error')).toHaveLength(0)
  })

  it('sends a guest to Google instead, after the same whole-form check', () => {
    const { container } = renderCheckout({ isAuthenticated: false })
    const form = checkoutForm(container)
    const googleForm = container.querySelector<HTMLFormElement>('form[hidden]')
    if (!googleForm) throw new Error('google form missing')
    const requestSubmit = vi.fn()
    googleForm.requestSubmit = requestSubmit

    expect(fireEvent.submit(form)).toBe(false)
    expect(requestSubmit).not.toHaveBeenCalled()

    fill(container, { ...DETAILS, ...ADDRESS })
    fireEvent.click(container.querySelector('[name="accept_terms"]') as HTMLInputElement)
    expect(fireEvent.submit(form)).toBe(false)
    expect(requestSubmit).toHaveBeenCalledTimes(1)
    expect(JSON.parse(window.sessionStorage.getItem('ke.checkout.resume') ?? '{}')).toMatchObject({
      city: 'תל אביב',
      street: 'דיזנגוף',
    })
    window.sessionStorage.removeItem('ke.checkout.resume')
  })

  it('reopens on the payment step after the Google round trip, with the fields refilled', () => {
    window.sessionStorage.setItem(
      'ke.checkout.resume',
      JSON.stringify({ ...DETAILS, ...ADDRESS, order_notes: 'בדלת האחורית' }),
    )
    const { container } = renderCheckout({ resuming: true })
    expect(container.querySelector<HTMLInputElement>('[name="first_name"]')?.value).toBe('דנה')
    expect(container.querySelector<HTMLTextAreaElement>('[name="order_notes"]')?.value).toBe(
      'בדלת האחורית',
    )
    expect(current(container)).toContain('תשלום')
    expect(railStates(container)).toEqual(['done', 'done', 'current'])
    expect(window.sessionStorage.getItem('ke.checkout.resume')).toBeNull()
  })
})

describe('a saved address in the flow', () => {
  it('opens on the address step, with the details done as a summary and no fields for either', () => {
    const { container } = renderCheckout({ address: SAVED_ADDRESS })
    for (const name of ['first_name', 'last_name', 'phone', 'email', 'city', 'street']) {
      expect(container.querySelector(`[name="${name}"]`), name).toBeNull()
    }
    expect(railStates(container)).toEqual(['done', 'current', 'upcoming'])
    expect(screen.getByText('דנה כהן')).toBeTruthy()
    expect(screen.getByText('דיזנגוף 100, תל אביב')).toBeTruthy()
    expect(container.querySelector<HTMLInputElement>('[name="address_id"]')?.value).toBe('addr-1')
    // Nothing to edit on the details, so no way back into them.
    expect(container.querySelector('.checkout-steps__btn')).toBeNull()
    expect(screen.queryByRole('button', { name: 'חזרה' })).toBeNull()
  })

  it('needs only the terms to submit, and shows no error over the summaries', () => {
    const { container } = renderCheckout({ address: SAVED_ADDRESS })
    const form = checkoutForm(container)
    expect(fireEvent.submit(form)).toBe(false)
    expect(invalidNames(container)).toEqual(['accept_terms'])
    expect(current(container)).toContain('תשלום')
    fireEvent.click(container.querySelector('[name="accept_terms"]') as HTMLInputElement)
    fireEvent.submit(form)
    expect(container.querySelectorAll('[aria-invalid="true"]')).toHaveLength(0)
    expect(container.querySelectorAll('.checkout-field__error')).toHaveLength(0)
  })

  it('continues from the address step to payment and keeps the address as a summary', () => {
    const { container } = renderCheckout({ address: SAVED_ADDRESS })
    clickContinue(container)
    expect(current(container)).toContain('תשלום')
    expect(container.querySelector('[data-testid="step-summary-address"]')?.textContent).toBe(
      'דיזנגוף 100, תל אביב',
    )
    expect(screen.getAllByText('דיזנגוף 100, תל אביב')).toHaveLength(1)
  })

  it('still offers the slot picker, narrowed by the saved city', () => {
    // תל אביב is the hub: 3-4 business days, so the first slot is 3 out.
    const { container } = renderCheckout({ address: SAVED_ADDRESS })
    const select = container.querySelector<HTMLSelectElement>('[name="delivery_slot"]')
    expect(select).toBeTruthy()
    expect(container.textContent).toContain('משלוח לתל אביב מגיע תוך 3-4 ימי עסקים')
  })
})

describe('the delivery slot in the flow', () => {
  it('is absent for a pickup, whatever slots were handed in', () => {
    const { container } = renderCheckout({ cart: PICKUP })
    expect(container.querySelector('[name="delivery_slot"]')).toBeNull()
  })

  it('is absent when nothing is delivered, as on a coupon-only cart', () => {
    const { container } = renderCheckout({ cart: cart(null), needsAddress: false })
    expect(container.querySelector('[name="delivery_slot"]')).toBeNull()
  })

  it('follows the typed city: a remote city pushes the first slot out', () => {
    const { container } = renderCheckout()
    const select = () => container.querySelector<HTMLSelectElement>('[name="delivery_slot"]')
    const firstOffered = () => select()?.querySelectorAll('option')[1]?.value
    // No city yet: the registry floor, 3 business days from Thursday the 1st.
    expect(firstOffered()).toBe('2026-10-06|morning')

    const city = container.querySelector<HTMLInputElement>('[name="city"]')
    if (!city) throw new Error('city missing')
    fireEvent.change(city, { target: { value: 'אילת' } })
    fireEvent.blur(city)
    expect(firstOffered()).toBe('2026-10-08|morning')
    expect(container.textContent).toContain('משלוח לאילת')
  })

  it('shows the shipping method in the order review', () => {
    const { container } = renderCheckout()
    expect(container.textContent).toContain('משלוח: משלוח עד הבית')
    expect(container.textContent).toContain('ללא עלות')
  })
})

describe('the payment method in the flow', () => {
  it('offers the hosted page alone to a guest, ticked, as a real radio', () => {
    const { container } = renderCheckout()
    const radios = container.querySelectorAll<HTMLInputElement>('[name="token_id"]')
    expect(radios).toHaveLength(1)
    expect(radios[0]?.value).toBe('new')
    expect(radios[0]?.checked).toBe(true)
    expect(container.querySelector('[data-testid="payment-methods"]')).toBeTruthy()
  })

  it('offers each saved card and "another card", default first and ticked', () => {
    const { container } = renderCheckout({
      savedCards: [
        { id: 'tok-1', last4: '1111', brand: 'visa', isDefault: false },
        { id: 'tok-2', last4: '2222', brand: 'mastercard', isDefault: true },
      ],
    })
    const radios = [...container.querySelectorAll<HTMLInputElement>('[name="token_id"]')]
    expect(radios.map((r) => r.value)).toEqual(['tok-1', 'tok-2', 'new'])
    expect(radios.map((r) => r.checked)).toEqual([false, true, false])
    expect(container.textContent).toContain('מאסטרקארד המסתיים ב-2222')
    expect(container.textContent).toContain('ויזה המסתיים ב-1111')
  })
})

describe('the payment provider gate in the flow', () => {
  it('is invisible while open', () => {
    const { container } = renderCheckout({ paymentGateOpen: true })
    expect(container.querySelector('[data-testid="payment-gate-notice"]')).toBeNull()
    expect(container.querySelector<HTMLButtonElement>('.checkout-pay-btn')?.disabled).toBe(false)
  })

  it('names itself, disables the button, and blocks a submit reached any other way when closed', () => {
    const { container } = renderCheckout({ paymentGateOpen: false, address: SAVED_ADDRESS })
    expect(container.querySelector('[data-testid="payment-gate-notice"]')?.textContent).toContain(
      'עדיין לא פעיל',
    )
    const button = container.querySelector<HTMLButtonElement>('.checkout-pay-btn')
    expect(button?.disabled).toBe(true)
    expect(button?.textContent).toBe('התשלום ייפתח בקרוב')
    expect(checkoutForm(container).getAttribute('data-payment-gate')).toBe('closed')

    // A complete form, submitted programmatically: still refused on the client.
    fireEvent.click(container.querySelector('[name="accept_terms"]') as HTMLInputElement)
    expect(fireEvent.submit(checkoutForm(container))).toBe(false)
  })
})

describe('the notes and terms fields', () => {
  it('bounds the notes at the same 500 characters the schema enforces', () => {
    const { container } = renderCheckout()
    expect(container.querySelector<HTMLTextAreaElement>('[name="order_notes"]')?.maxLength).toBe(
      500,
    )
  })

  it('links the terms label to the terms page in a new tab, so the form is not lost', () => {
    const { container } = renderCheckout()
    const link = container.querySelector<HTMLAnchorElement>('a[href="/terms-and-conditions"]')
    expect(link?.textContent).toBe('תנאי השימוש')
    expect(link?.getAttribute('target')).toBe('_blank')
  })
})
