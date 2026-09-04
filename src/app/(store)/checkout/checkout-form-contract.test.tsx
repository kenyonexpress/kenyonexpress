import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * QA checklist section 6, the rows that are claims about this form.
 *
 * Measured here rather than in a browser because the checkout cannot be
 * reached by one on this machine: the guest cart, the address read and the
 * wallet balance all go through the admin client, and the local
 * `SUPABASE_SECRET_KEY` is the stock `iss=supabase-demo` key the hosted
 * project rejects. `/checkout` therefore answers with the NEXT_REDIRECT to
 * /cart that an empty cart earns, which is itself the first row below.
 *
 * The payment MODULES are another session's (`src/lib/payments/`,
 * `src/server/actions/payments/`), so nothing here reaches past the form.
 */

vi.mock('@/lib/analytics/tracker', () => ({ track: vi.fn() }))
vi.mock('@/lib/analytics/commerce-client', () => ({ trackCommerce: vi.fn() }))
vi.mock('@/server/actions/auth', () => ({ signInWithGoogle: vi.fn() }))
vi.mock('@/server/actions/payments/checkout', () => ({ submitCheckout: vi.fn() }))

import type { CartView } from '@/lib/cart/types'
import { agorot } from '@/lib/money'
import CheckoutForm, { type CheckoutAddressPrefill } from './CheckoutForm'

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

/** ₪150 face value, ₪40 paid here and ₪110 collected at the business. */
const COUPON_LINE = {
  product_id: '22222222-2222-4222-8222-222222222222',
  variant_id: null,
  quantity: 1,
  name_he: 'ארוחה זוגית',
  slug: 'meal',
  image_url: null,
  unit_price: agorot(15000),
  line_total: agorot(15000),
  type: 'coupon' as const,
  available: true,
  platform_fee: agorot(4000),
  supplier_due: agorot(0),
  customer_pays_now: agorot(4000),
  balance_due_at_business: agorot(11000),
  platform_percent_bp: 10000,
  platform_percent_snapshot: null,
  coupon_price_unit: agorot(4000),
}

/** A coupon with nothing left to collect: the balance row must disappear. */
const FULLY_PREPAID_COUPON = {
  ...COUPON_LINE,
  product_id: '33333333-3333-4333-8333-333333333333',
  name_he: 'כרטיס קולנוע',
  slug: 'cinema',
  customer_pays_now: agorot(15000),
  balance_due_at_business: agorot(0),
  coupon_price_unit: agorot(15000),
}

function cartOf(items: unknown[], balanceAtBusiness: number, subtotal: number): CartView {
  return {
    id: 'cart-1',
    items,
    item_count: items.length,
    subtotal: agorot(subtotal),
    platform_fee: agorot(0),
    supplier_due: agorot(0),
    balance_due_at_business: agorot(balanceAtBusiness),
    coupon: null,
    discount: agorot(0),
    total: agorot(subtotal),
  } as unknown as CartView
}

function renderCheckout(overrides: Partial<Parameters<typeof CheckoutForm>[0]> = {}) {
  return render(
    <CheckoutForm
      cart={cartOf([COUPON_LINE], 11000, 4000)}
      clientRef="00000000-0000-4000-8000-000000000000"
      needsAddress={false}
      address={EMPTY_ADDRESS}
      walletBalance={0}
      savedCards={[]}
      isAuthenticated
      {...overrides}
    />,
  )
}

describe('the checkout order review', () => {
  it('splits a coupon line into what is paid here and what is paid there', () => {
    renderCheckout()
    // The price is digits-then-sign inside an LTR isolate now, so the regex
    // matches the number and the glyph in render order. See money-format.ts.
    expect(screen.getByText(/תשלום באתר: .*40\.00.*₪/)).toBeTruthy()
    expect(screen.getByText(/יתרה בעסק: .*110\.00.*₪/)).toBeTruthy()
    expect(screen.getByText('יתרה לתשלום בעסק (בקופון)')).toBeTruthy()
  })

  it('hides the balance line for a coupon with nothing left to collect', () => {
    const { container } = render(
      <CheckoutForm
        cart={cartOf([FULLY_PREPAID_COUPON], 0, 15000)}
        clientRef="00000000-0000-4000-8000-000000000000"
        needsAddress={false}
        address={EMPTY_ADDRESS}
        walletBalance={0}
        savedCards={[]}
        isAuthenticated
      />,
    )
    expect(container.textContent).not.toContain('יתרה לתשלום בעסק')
    expect(container.textContent).not.toContain('יתרה בעסק:')
  })
})

describe('the checkout wallet box', () => {
  const walletField = (container: HTMLElement) =>
    container.querySelector<HTMLInputElement>('[name="apply_wallet_ils"]')

  it('is absent with an empty wallet', () => {
    const { container } = renderCheckout({ walletBalance: 0 })
    expect(walletField(container)).toBeNull()
  })

  it('offers no more than the on-site charge, even on a fat balance', () => {
    // ₪40 is paid here; the other ₪110 of this coupon is collected at the
    // business and no wallet money can go towards it.
    const { container } = renderCheckout({ walletBalance: 500 })
    expect(walletField(container)?.max).toBe('40')
  })

  it('offers no more than the balance when the balance is the smaller of the two', () => {
    const { container } = renderCheckout({ walletBalance: 12.5 })
    expect(walletField(container)?.max).toBe('12.5')
  })

  it('holds the shopper to that ceiling, which max alone does not', () => {
    // The form is `noValidate`, so min/max/step announce and enforce nothing.
    const { container } = renderCheckout({ walletBalance: 500 })
    const field = walletField(container)
    if (!field) throw new Error('wallet field missing')

    fireEvent.change(field, { target: { value: '500' } })
    // Mid-edit the typed value stands: clamping per keystroke would fight the
    // cursor of anyone typing 40 into a field that starts at 0.
    expect(field.value).toBe('500')

    fireEvent.blur(field)
    expect(field.value).toBe('40')
  })

  it('floors a negative at zero on the way out of the field', () => {
    const { container } = renderCheckout({ walletBalance: 500 })
    const field = walletField(container)
    if (!field) throw new Error('wallet field missing')
    fireEvent.change(field, { target: { value: '-50' } })
    fireEvent.blur(field)
    expect(field.value).toBe('0')
  })
})

describe('the checkout confirm step', () => {
  it('leaves the terms unticked and the card-saving ticked', () => {
    // Both defaults are deliberate and opposite: consent is never pre-given,
    // and the convenience the shopper can undo is.
    const { container } = renderCheckout()
    expect(container.querySelector<HTMLInputElement>('[name="accept_terms"]')?.checked).toBe(false)
    expect(container.querySelector<HTMLInputElement>('[name="save_card"]')?.checked).toBe(true)
  })

  it('does not offer to save a card it is only charging', () => {
    // Saving happens on Cardcom's hosted page. Charging a token that already
    // exists cannot mint another one, so the tickbox would be a promise the
    // server drops - `submitCheckout` forces save_card false on that path.
    const { container } = renderCheckout({
      savedCards: [{ id: 'tok-1', last4: '4242', brand: 'visa', isDefault: true }],
    })
    expect(container.querySelector('[name="save_card"]')).toBeNull()
  })

  it('carries the client_ref it was handed, once', () => {
    // A fresh uuid per page load is minted by the server component; what this
    // guards is that the form posts exactly that one, since it is the
    // idempotency key the settlement engine dedupes on.
    const { container } = renderCheckout()
    const refs = container.querySelectorAll<HTMLInputElement>('[name="client_ref"]')
    expect(refs).toHaveLength(1)
    expect(refs[0]?.value).toBe('00000000-0000-4000-8000-000000000000')
  })

  it('names the button for the order and the wait for the payment page', () => {
    // The checklist called this button "מעבר לתשלום מאובטח". That string is
    // the PENDING label; the resting one is "שליחת הזמנה". Recorded here so
    // the checklist can be corrected against the code rather than the reverse.
    //
    // Read off the DOM and not by role: the confirm step is `hidden` until the
    // shopper reaches it, and an accessibility query rightly refuses to see it.
    const { container } = renderCheckout()
    expect(container.querySelector('.checkout-pay-btn')?.textContent).toBe('שליחת הזמנה')
  })
})
