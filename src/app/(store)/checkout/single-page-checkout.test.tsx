import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * THE CHECKOUT IS ONE PAGE.
 *
 * Until 30.09.2026 desktop showed a four-step wizard and the phone showed the
 * same form as one long column, because live's WooCommerce checkout is one
 * page at every width. These pin the single-page shape: every section is in
 * the DOM and none is hidden behind a step, one submit judges the whole form,
 * a saved address still switches its two sections off, the slot picker
 * appears only for a delivery, and a closed payment gate stops the submit at
 * the button and at the handler.
 *
 * Measured here rather than in a browser because the checkout cannot be
 * reached by one on this machine: the guest cart, the address read and the
 * wallet all go through the admin client, and the local service key is the
 * stock demo key the hosted project rejects.
 */

vi.mock('@/lib/analytics/tracker', () => ({ track: vi.fn() }))
vi.mock('@/lib/analytics/commerce-client', () => ({ trackCommerce: vi.fn() }))
vi.mock('@/lib/analytics/feature-flags', () => ({
  getCheckoutVariant: vi.fn(async () => 'control'),
}))
vi.mock('@/server/actions/auth', () => ({ signInWithGoogle: vi.fn() }))
vi.mock('@/server/actions/payments/checkout', () => ({ submitCheckout: vi.fn() }))

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

describe('the single-page checkout', () => {
  it('shows every section at once, with no stepper and no per-step navigation', () => {
    const { container } = renderCheckout()
    expect(container.querySelector('.checkout-steps')).toBeNull()
    expect(container.querySelector('[data-step]')).toBeNull()
    expect(container.querySelector('[data-inactive]')).toBeNull()
    expect(screen.queryByRole('button', { name: 'המשך' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'המשך לאישור' })).toBeNull()

    // The four things the goal names, all reachable by role on one page.
    expect(screen.getByRole('combobox', { name: /עיר/ })).toBeTruthy()
    expect(screen.getByLabelText(/מועד מסירה מועדף/)).toBeTruthy()
    expect(screen.getByLabelText(/הערות להזמנה/)).toBeTruthy()
    expect(
      screen.getByRole('table', { name: '' }).closest('[aria-label="ההזמנה שלך"]'),
    ).toBeTruthy()
    expect(container.querySelector('[name="accept_terms"]')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'שליחת הזמנה' })).toBeTruthy()
  })

  it('judges the whole form on submit, marks every missing field, and does not submit', () => {
    const { container } = renderCheckout()
    const form = checkoutForm(container)
    const submitted = vi.fn((event: Event) => event.preventDefault())
    form.addEventListener('submit', submitted)

    const allowed = fireEvent.submit(form)
    expect(allowed).toBe(false)
    const invalid = [...container.querySelectorAll('[aria-invalid="true"]')].map((el) =>
      el.getAttribute('name'),
    )
    expect(invalid).toEqual(
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
  })

  it('lets a filled form through once the terms are ticked', () => {
    const { container } = renderCheckout()
    fill(container, {
      first_name: 'דנה',
      last_name: 'כהן',
      phone: '0501234567',
      email: 'dana@example.com',
      city: 'תל אביב',
      street: 'דיזנגוף',
      street_number: '100',
    })
    const form = checkoutForm(container)

    // Terms unticked: the one remaining error is on the checkbox.
    expect(fireEvent.submit(form)).toBe(false)
    const invalid = [...container.querySelectorAll('[aria-invalid="true"]')].map((el) =>
      el.getAttribute('name'),
    )
    expect(invalid).toEqual(['accept_terms'])

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

    fill(container, {
      first_name: 'דנה',
      last_name: 'כהן',
      phone: '0501234567',
      email: 'dana@example.com',
      city: 'תל אביב',
      street: 'דיזנגוף',
      street_number: '100',
    })
    fireEvent.click(container.querySelector('[name="accept_terms"]') as HTMLInputElement)
    expect(fireEvent.submit(form)).toBe(false)
    expect(requestSubmit).toHaveBeenCalledTimes(1)
    expect(JSON.parse(window.sessionStorage.getItem('ke.checkout.resume') ?? '{}')).toMatchObject({
      city: 'תל אביב',
      street: 'דיזנגוף',
    })
    window.sessionStorage.removeItem('ke.checkout.resume')
  })
})

describe('a saved address on the single page', () => {
  it('collapses both sections to summaries and renders none of their fields', () => {
    const { container } = renderCheckout({ address: SAVED_ADDRESS })
    for (const name of ['first_name', 'last_name', 'phone', 'email', 'city', 'street']) {
      expect(container.querySelector(`[name="${name}"]`), name).toBeNull()
    }
    expect(screen.getByText('דנה כהן')).toBeTruthy()
    expect(screen.getByText('דיזנגוף 100, תל אביב')).toBeTruthy()
    expect(container.querySelector<HTMLInputElement>('[name="address_id"]')?.value).toBe('addr-1')
  })

  it('needs only the terms to submit, and shows no error over the summary', () => {
    const { container } = renderCheckout({ address: SAVED_ADDRESS })
    const form = checkoutForm(container)
    expect(fireEvent.submit(form)).toBe(false)
    expect(
      [...container.querySelectorAll('[aria-invalid="true"]')].map((el) => el.getAttribute('name')),
    ).toEqual(['accept_terms'])
    fireEvent.click(container.querySelector('[name="accept_terms"]') as HTMLInputElement)
    fireEvent.submit(form)
    expect(container.querySelectorAll('[aria-invalid="true"]')).toHaveLength(0)
    expect(container.querySelectorAll('.checkout-field__error')).toHaveLength(0)
  })

  it('still offers the slot picker, narrowed by the saved city', () => {
    // תל אביב is the hub: 3-4 business days, so the first slot is 3 out.
    const { container } = renderCheckout({ address: SAVED_ADDRESS })
    const select = container.querySelector<HTMLSelectElement>('[name="delivery_slot"]')
    expect(select).toBeTruthy()
    expect(container.textContent).toContain('משלוח לתל אביב מגיע תוך 3-4 ימי עסקים')
  })
})

describe('the delivery slot on the page', () => {
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

describe('the payment provider gate on the page', () => {
  it('is invisible while open', () => {
    const { container } = renderCheckout({ paymentGateOpen: true })
    expect(container.querySelector('[data-testid="payment-gate-notice"]')).toBeNull()
    expect(screen.getByRole('button', { name: 'שליחת הזמנה' }).hasAttribute('disabled')).toBe(false)
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
    renderCheckout()
    const link = screen.getByRole('link', { name: 'תנאי השימוש' })
    expect(link.getAttribute('href')).toBe('/terms-and-conditions')
    expect(link.getAttribute('target')).toBe('_blank')
  })
})
