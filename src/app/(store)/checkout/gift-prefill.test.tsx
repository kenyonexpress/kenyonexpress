import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * S22: /gift/[product] hands its fields to checkout through a cookie, and the
 * page passes them here as `giftPrefill`. The box must open ticked and filled,
 * and with no prefill it must stay exactly as it was: unticked, fields absent.
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

function renderCheckout(giftPrefill?: Parameters<typeof CheckoutForm>[0]['giftPrefill']) {
  return render(
    <CheckoutForm
      cart={COUPON_CART}
      clientRef="00000000-0000-4000-8000-000000000000"
      needsAddress={false}
      address={NO_SAVED_ADDRESS}
      walletBalance={0}
      savedCards={[]}
      isAuthenticated
      giftPrefill={giftPrefill}
    />,
  )
}

const value = (container: HTMLElement, name: string) =>
  container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`)?.value

describe('checkout gift prefill (S22)', () => {
  it('opens the gift block ticked and filled from the draft', () => {
    const { container } = renderCheckout({
      gift_recipient_email: 'friend@example.com',
      gift_recipient_name: 'דנה',
      gift_message: 'יום הולדת שמח',
      gift_deliver_at: '2026-12-01',
      gift_wrap: true,
    })
    expect(container.querySelector<HTMLInputElement>('[name="gift"]')?.checked).toBe(true)
    expect(value(container, 'gift_recipient_email')).toBe('friend@example.com')
    expect(value(container, 'gift_recipient_name')).toBe('דנה')
    expect(value(container, 'gift_message')).toBe('יום הולדת שמח')
    expect(value(container, 'gift_deliver_at')).toBe('2026-12-01')
    expect(container.querySelector<HTMLInputElement>('[name="gift_wrap"]')?.checked).toBe(true)
  })

  it('leaves the box unticked and the fields unmounted with no draft', () => {
    const { container } = renderCheckout(null)
    expect(container.querySelector<HTMLInputElement>('[name="gift"]')?.checked).toBe(false)
    expect(container.querySelector('[name="gift_recipient_email"]')).toBeNull()
  })
})
