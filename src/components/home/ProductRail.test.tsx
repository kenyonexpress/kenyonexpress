import { CartProvider } from '@/components/cart/CartProvider'
import ProductRail from '@/components/home/ProductRail'
import type { RailProduct } from '@/lib/homepage/rails'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

/**
 * `ProductCard` renders an add-to-cart button, which reads the cart store from
 * context and throws without a provider. The provider is the smallest thing
 * that makes the card renderable at all, so it wraps every case here EXCEPT the
 * empty one - which must return the empty string, and would not if a provider
 * were emitting markup around it.
 */
const render = (element: ReactElement) =>
  renderToStaticMarkup(<CartProvider>{element}</CartProvider>)

const product: RailProduct = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'deal',
  name_he: 'דיל לדוגמה',
  kenyon_price: 50,
  full_price: 100,
  images: [],
  stock_quantity: 3,
  created_at: '2026-01-01T00:00:00.000Z',
  offer_valid_until: null,
  supplier_id: null,
  category_id: null,
}

describe('ProductRail', () => {
  it('renders nothing at all when the rule matched no products', () => {
    // Not an empty grid and not a "no products" message. A heading over blank
    // space is a defect a visitor sees and an operator does not, and this is
    // the LIVE case: `ending_soon` matches zero of the 44 active products.
    expect(renderToStaticMarkup(<ProductRail title="דילים" products={[]} />)).toBe('')
  })

  it('renders the heading and the cards when it has products', () => {
    const out = render(<ProductRail title="דילים" products={[product]} />)
    expect(out).toContain('דילים')
    expect(out).toContain('דיל לדוגמה')
  })

  it('sits on the same frame as the product grid already on the page', () => {
    // `max-w-deals` is what DealsOfTheDay uses. A new rhythm on the home page
    // is what the comparison gate existed to catch.
    const out = render(<ProductRail title="דילים" products={[product]} />)
    expect(out).toContain('max-w-deals')
  })

  it('renders the more link only when one is given', () => {
    expect(render(<ProductRail title="דילים" products={[product]} />)).not.toContain('לכל המוצרים')
    expect(
      render(<ProductRail title="דילים" products={[product]} moreHref="/products" />),
    ).toContain('לכל המוצרים')
  })

  it('carries a rail product rating summary through to its card', () => {
    // Same star row as the PDP "מומלצים" strip (`lib/related-products.ts`),
    // now fed by `lib/homepage/rails.ts`'s own `withRatings`. No summary on
    // the fixture above renders no stars; this asserts the row appears once
    // a rail product carries one.
    const rated: RailProduct = { ...product, ratingSummary: { count: 3, averageTenths: 45 } }
    const out = render(<ProductRail title="דילים" products={[rated]} />)
    expect(out).toContain('/product/deal/reviews')
  })

  it('renders no stars when a rail product carries no rating summary', () => {
    const out = render(<ProductRail title="דילים" products={[product]} />)
    expect(out).not.toContain('/product/deal/reviews')
  })
})
