import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * THE META ROW UNDER THE TITLE STAYS RTL. It used to flip the whole row to
 * `ltr` whenever a product had no SKU, which was right while the row held only
 * the English name. Once the star rating joined it, a reviewed product without
 * a SKU rendered its Hebrew review link and its star fill order left-to-right.
 * Only the Latin run is isolated now, the same way the SKU already was.
 */

vi.mock('@/components/cart/CartProvider', () => ({
  useCart: () => ({ addToCart: vi.fn(), isPending: false }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import ProductInfo from './ProductInfo'

const BASE = {
  productId: '11111111-1111-4111-8111-111111111111',
  name: 'תיק גב',
  nameEn: null,
  basePrice: 199,
  oldPrice: null,
  baseStock: 50,
  sku: null,
  reviewsHref: '/product/tik-gav/reviews',
  categoryName: null,
  city: null,
  attributes: [],
  isCoupon: false,
  couponOffer: null,
  variants: [],
}

const meta = (container: HTMLElement) =>
  container.querySelector('.pdp-summary__meta') as HTMLElement

describe('the product meta row direction', () => {
  it('keeps a reviewed product without a SKU right-to-left', () => {
    const { container } = render(
      <ProductInfo {...BASE} ratingSummary={{ count: 3, averageTenths: 45 }} />,
    )
    expect(meta(container).getAttribute('dir')).toBe('rtl')
    expect(meta(container).querySelector('a')).not.toBeNull()
  })

  it('isolates the English name instead of flipping the row', () => {
    const { container } = render(<ProductInfo {...BASE} nameEn="Backpack" />)
    expect(meta(container).getAttribute('dir')).toBe('rtl')
    const latin = meta(container).querySelector('span[dir="ltr"]')
    expect(latin?.textContent).toBe('Backpack')
  })

  it('isolates the SKU the same way', () => {
    const { container } = render(<ProductInfo {...BASE} sku="KE-123" />)
    expect(meta(container).getAttribute('dir')).toBe('rtl')
    expect(meta(container).querySelector('span[dir="ltr"]')?.textContent).toBe('KE-123')
  })
})
