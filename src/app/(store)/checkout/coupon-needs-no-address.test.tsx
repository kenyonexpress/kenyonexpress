import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * A FIRST-TIME COUPON BUYER COULD NOT LEAVE STEP 2.
 *
 * `validateAddressStep` demands city, street and street number from every
 * shopper, unconditionally, and the address step renders for everyone whose
 * account carries no saved address. A coupon is delivered by email. So the
 * customer this catalogue is mostly built for - buying the product type this
 * catalogue is mostly made of, on their first order - reached the second step
 * and could not move: "המשך" answered שדה חובה on three fields for a delivery
 * that does not exist.
 *
 * Measured 2026-09-10 against the production build on a coupon-only cart,
 * before the fix. It is the sibling of the saved-address trap in
 * `saved-address-step-gate.test.tsx`: the same gate, asking for fields the
 * submission does not want, on the other half of the customer base. That one
 * broke returning shoppers; this one broke new ones.
 *
 * THE SERVER ALWAYS KNEW. `validateCartView` computes
 * `requiresAddress: hasPhysical`, the form posts it as `needs_address`, and
 * `submitCheckout` reads the address fields only inside
 * `if (needsAddress && !addressId)`. Whatever the shopper was forced to type
 * was then thrown away. Only the client-side gate was asking for it.
 *
 * The step is kept rather than dropped from the four: the order notes and the
 * entire gift block live inside it, and a gift is a coupon feature. What
 * changes is that the address fields are not rendered, the gate has nothing to
 * demand, and the stepper names the step for what it actually holds.
 */

vi.mock('@/lib/analytics/tracker', () => ({ track: vi.fn() }))
vi.mock('@/lib/analytics/commerce-client', () => ({ trackCommerce: vi.fn() }))
vi.mock('@/server/actions/auth', () => ({ signInWithGoogle: vi.fn() }))
vi.mock('@/server/actions/payments/checkout', () => ({ submitCheckout: vi.fn() }))

import type { CartView } from '@/lib/cart/types'
import { agorot } from '@/lib/money'
import CheckoutForm, { type CheckoutAddressPrefill } from './CheckoutForm'

const COUPON_LINE = {
  product_id: '22222222-2222-4222-8222-222222222222',
  variant_id: null,
  quantity: 1,
  name_he: 'קופון בדיקות אוטומטיות',
  slug: 'e2e-test-coupon',
  image_url: null,
  unit_price: agorot(4000),
  line_total: agorot(4000),
  type: 'coupon' as const,
  available: true,
  platform_fee: agorot(400),
  supplier_due: agorot(3600),
  customer_pays_now: agorot(4000),
  balance_due_at_business: agorot(36000),
  platform_percent_bp: 1000,
  platform_percent_snapshot: 10,
  coupon_price_unit: agorot(4000),
}

const COUPON_CART = {
  id: 'cart-coupon',
  items: [COUPON_LINE],
  item_count: 1,
  subtotal: agorot(4000),
  platform_fee: agorot(400),
  supplier_due: agorot(3600),
  balance_due_at_business: agorot(36000),
  coupon: null,
  discount: agorot(0),
  total: agorot(4000),
} as unknown as CartView

const NO_SAVED_ADDRESS: CheckoutAddressPrefill = {
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

/** The press of pay, with the terms ticked so only the address rules can refuse it. */
function pressPay(container: HTMLElement) {
  fireEvent.click(container.querySelector('[name="accept_terms"]') as HTMLInputElement)
  fireEvent.submit(container.querySelector('form.checkout-page__grid') as HTMLFormElement)
}

const summary = (container: HTMLElement) =>
  container.querySelector('[data-testid="checkout-error-summary"]')

function renderCheckout(needsAddress: boolean) {
  return render(
    <CheckoutForm
      cart={COUPON_CART}
      clientRef="00000000-0000-4000-8000-000000000000"
      needsAddress={needsAddress}
      address={NO_SAVED_ADDRESS}
      walletBalance={0}
      savedCards={[]}
      isAuthenticated
    />,
  )
}

/** Fills the four details-step fields so the gate's first step is satisfied. */
function fillDetails(container: HTMLElement) {
  const set = (name: string, value: string) => {
    const field = container.querySelector<HTMLInputElement>(`[name="${name}"]`)
    if (!field) throw new Error(`details field ${name} is not rendered`)
    fireEvent.change(field, { target: { value } })
  }
  set('first_name', 'בדיקה')
  set('last_name', 'אוטומטית')
  set('phone', '0501234567')
  set('email', 'buyer@example.com')
}

describe('a coupon-only cart at the checkout gate', () => {
  it('renders no address fields at all', () => {
    const { container } = renderCheckout(false)
    for (const name of ['city', 'street', 'street_number', 'zip', 'apartment', 'floor']) {
      expect(container.querySelector(`[name="${name}"]`), name).toBeNull()
    }
  })

  it('pays with the details filled and no address at all', () => {
    // The press that used to be a dead end for this shopper (V02: one page,
    // so it is the pay button now and not the second "המשך").
    const { container } = renderCheckout(false)
    fillDetails(container)
    pressPay(container)
    expect(summary(container)).toBeNull()
    expect(container.querySelectorAll('.checkout-field__error')).toHaveLength(0)
  })

  it('keeps the order notes and the gift offer on that step', () => {
    // The reason the step survives instead of being dropped from the four.
    const { container } = renderCheckout(false)
    expect(container.querySelector('[name="order_notes"]')).not.toBeNull()
    expect(container.querySelector('[name="gift"]')).not.toBeNull()
  })

  it('shows no shipping section to a coupon-only cart', () => {
    // V02: Electro's shipping block is for things that ship. "מידע נוסף" is
    // what is left, and it is the heading of the extras section itself.
    const { container } = renderCheckout(false)
    expect(screen.queryByText('כתובת למשלוח')).toBeNull()
    expect(screen.getByText('מידע נוסף')).toBeTruthy()
    expect(container.querySelector('.checkout-steps')).toBeNull()
  })

  /**
   * The other half, and the reason this is keyed on the cart rather than on
   * the step. Without it the fix would be a hole through which a fridge is
   * ordered to nowhere.
   */
  it('still demands an address from a physical cart', () => {
    const { container } = renderCheckout(true)
    fillDetails(container)
    pressPay(container)
    expect(summary(container)).not.toBeNull()
    for (const id of ['#co-err-city', '#co-err-street', '#co-err-street-number']) {
      expect(container.querySelector(id), id).not.toBeNull()
    }
  })
})
