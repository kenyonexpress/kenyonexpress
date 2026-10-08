/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The `cta_copy` experiment (STEP 66) changes the three buy-row strings and
 * nothing else. Control is the live wording; the arm is read through the
 * generic hook, mocked here so the test owns the decision.
 */

const variant = vi.hoisted(() => ({ value: 'control' }))
vi.mock('@/lib/analytics/use-experiment-variant', () => ({
  useExperimentVariant: () => variant.value,
}))
vi.mock('@/components/cart/CartProvider', () => ({
  useCart: () => ({ addToCart: vi.fn(async () => true), isPending: false }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/server/actions/reviews', () => ({
  getWishlistSaved: async () => false,
  toggleWishlist: async () => ({ ok: true, saved: true }),
}))
vi.mock('@/server/actions/stock-alerts', () => ({ joinStockWaitlist: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => {
    throw new Error('no socket in this suite')
  },
}))

import ProductInfo from './ProductInfo'

const BASE = {
  productId: '11111111-1111-4111-8111-111111111111',
  name: 'תיק גב',
  nameEn: null,
  basePrice: 199,
  oldPrice: null,
  baseStock: 50,
  sku: null,
  categoryName: null,
  city: null,
  attributes: [],
  variants: [],
  isCoupon: false,
  couponOffer: null,
}

beforeEach(() => {
  variant.value = 'control'
})

describe('cta_copy on the product page', () => {
  it('control renders the live wording with no experiment attribute', () => {
    const { container } = render(<ProductInfo {...BASE} />)
    expect(screen.getByRole('button', { name: /הוסף לסל/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'קנה עכשיו' })).toBeTruthy()
    expect(container.querySelector('[data-pdp="summary"]')?.hasAttribute('data-cta-variant')).toBe(
      false,
    )
  })

  it('invite renders the plural wording and stamps the arm on the summary', () => {
    variant.value = 'invite'
    const { container } = render(<ProductInfo {...BASE} />)
    expect(screen.getByRole('button', { name: /הוסיפו לסל/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'קנו עכשיו' })).toBeTruthy()
    expect(screen.queryByText('הוסף לסל')).toBeNull()
    expect(container.querySelector('[data-pdp="summary"]')?.getAttribute('data-cta-variant')).toBe(
      'invite',
    )
  })

  it('invite names the coupon on a coupon product', () => {
    variant.value = 'invite'
    render(<ProductInfo {...BASE} isCoupon />)
    expect(screen.getByRole('button', { name: /קבלו את הקופון/ })).toBeTruthy()
  })
})
