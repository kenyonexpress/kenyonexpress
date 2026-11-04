import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * S07, GUEST CHECKOUT, the form half.
 *
 * Before S07 the pay button was the sign-in: a guest who pressed it had the
 * form stashed in sessionStorage and was sent to Google, and only came back to
 * the card after an account existed. Now the press goes to submitCheckout,
 * which gives the guest an anonymous session; Google is offered after payment.
 * The "already bought here?" notice is still the returning customer's way in.
 */

vi.mock('@/lib/analytics/tracker', () => ({ track: vi.fn() }))
vi.mock('@/lib/analytics/commerce-client', () => ({ trackCommerce: vi.fn() }))
const signInWithGoogle = vi.hoisted(() => vi.fn(async () => null))
vi.mock('@/server/actions/auth', () => ({ signInWithGoogle }))
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

function currentStep(container: HTMLElement): string | null {
  return container.querySelector('form.checkout-page__grid')?.getAttribute('data-step') ?? null
}

function renderCheckout(needsAddress: boolean) {
  return render(
    <CheckoutForm
      cart={COUPON_CART}
      clientRef="00000000-0000-4000-8000-000000000000"
      needsAddress={needsAddress}
      address={NO_SAVED_ADDRESS}
      walletBalance={0}
      savedCards={[]}
      isAuthenticated={false}
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

const RESUME_KEY = 'ke.checkout.resume'

beforeEach(() => {
  signInWithGoogle.mockClear()
  window.sessionStorage.clear()
})

describe('a guest at the pay button', () => {
  it('is not sent to Google when the order is submitted', () => {
    const { container } = renderCheckout(false)
    fillDetails(container)
    fireEvent.click(container.querySelector('[name="accept_terms"]') as HTMLInputElement)
    const form = container.querySelector('form.checkout-page__grid') as HTMLFormElement
    fireEvent.submit(form)
    expect(signInWithGoogle).not.toHaveBeenCalled()
    expect(window.sessionStorage.getItem(RESUME_KEY)).toBeNull()
    // No step bounced the guest back: the submission was let through.
    expect(container.querySelectorAll('.checkout-field__error')).toHaveLength(0)
  })

  it('is stopped on the details step without an email', () => {
    const { container } = renderCheckout(false)
    fillDetails(container)
    fireEvent.change(container.querySelector('[name="email"]') as HTMLInputElement, {
      target: { value: '' },
    })
    fireEvent.submit(container.querySelector('form.checkout-page__grid') as HTMLFormElement)
    expect(currentStep(container)).toBe('details')
    expect(container.querySelector('#co-err-email')).not.toBeNull()
  })

  it('still offers the returning customer a sign-in, and keeps what they typed', () => {
    const { container } = renderCheckout(false)
    fillDetails(container)
    fireEvent.click(screen.getByRole('button', { name: 'יש ללחוץ כאן כדי להתחבר' }))
    const stash = JSON.parse(window.sessionStorage.getItem(RESUME_KEY) ?? '{}')
    expect(stash.email).toBe('buyer@example.com')
  })

  it('asks a guest for the shipping address only when the cart has a physical product', () => {
    expect(renderCheckout(false).container.querySelector('[name="city"]')).toBeNull()
    expect(renderCheckout(true).container.querySelector('[name="city"]')).not.toBeNull()
  })
})
