import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import ProductCard, { type Product } from './ProductCard'
import ProductDealCard from './ProductDealCard'

// The islands need providers and a router; the slot markup does not.
vi.mock('@/components/cart/AddToCartButton', () => ({ default: () => null }))
vi.mock('@/components/product/WishlistButton', () => ({ default: () => null }))
vi.mock('@/components/compare/CompareButton', () => ({ default: () => null }))

const full: Product = {
  id: 'p-full',
  slug: 'full',
  name_he: 'מוצר עם הכל',
  kenyon_price: 100,
  full_price: 200,
  images: ['/images/products/ke-live-deal-0.avif'],
  stock_quantity: 3,
  category: { name_he: 'בעלי מקצוע', slug: 'professionals' },
}

const bare: Product = {
  id: 'p-bare',
  slug: 'bare',
  name_he: 'מוצר בלי מחלקה ובלי תמונה',
  kenyon_price: 100,
  full_price: null,
  images: [],
  stock_quantity: 3,
  category: null,
}

/**
 * UX09 (14.10.2026): EVERY DEALS CARD HAS THE SAME SLOTS, FILLED OR NOT.
 *
 * The grid gives every row one height (`grid-auto-rows: 1fr`), and the card
 * keeps that height honest by reserving its two conditional rows instead of
 * dropping them: a card with no department renders an empty, hidden
 * `.p_con__category` (24px through the stylesheet's min-height), and the
 * photograph's wrap is always in the markup (245px min-height) whether or
 * not an <img> sits inside it. Measured before: a card without a category was
 * 40px shorter than its neighbours and one without a thumbnail 245px shorter.
 *
 * Both deals cards are covered: the server one the home page renders
 * (ProductDealCard) and the client variant the landing and store grids use.
 */
describe.each([
  ['ProductDealCard', (p: Product) => <ProductDealCard product={p} />],
  ['ProductCard variant=deals', (p: Product) => <ProductCard product={p} variant="deals" />],
])('%s slot reservation', (_name, render) => {
  it('prints the department as a link when the product has one', () => {
    const html = renderToStaticMarkup(render(full))
    expect(html).toMatch(/<a[^>]*class="p_con__category"[^>]*>בעלי מקצוע<\/a>/)
    expect(html).not.toMatch(/data-empty-slot/)
    expect(html).toMatch(/class="p_con__image-wrap/)
    expect(html).toMatch(/<img[^>]*class="p_con__image"/)
  })

  it('keeps an empty, hidden department row and the photograph wrap without data', () => {
    const html = renderToStaticMarkup(render(bare))
    // The slot is there, empty, and not announced.
    expect(html).toMatch(
      /<span class="p_con__category" aria-hidden="true" data-empty-slot="category"><\/span>/,
    )
    expect(html).not.toMatch(/<a[^>]*class="p_con__category"/)
    // The wrap stays in the markup with no <img> inside it; the stylesheet's
    // min-height holds the 245px.
    expect(html).toMatch(/class="p_con__image-wrap/)
    expect(html).not.toMatch(/<img/)
    // Same order of slots as the full card, so the grid rows line up.
    const order = (h: string) =>
      ['p_con__category', 'p_con__title-wrap', 'p_con__image-wrap', 'p_con__footer'].map((c) =>
        h.indexOf(c),
      )
    const bareOrder = order(html)
    expect(bareOrder.every((i) => i >= 0)).toBe(true)
    expect([...bareOrder].sort((a, b) => a - b)).toEqual(bareOrder)
  })
})
