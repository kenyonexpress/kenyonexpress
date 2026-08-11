import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import ProductDealCard from './ProductDealCard'

/**
 * The cart island is stubbed, and only because of its import chain: the real
 * one reaches `CartProvider` -> `lib/growth/client` -> `server-only`, which
 * vitest cannot resolve. The stub renders the same `<button>` the icon variant
 * renders, plus the product id as an attribute - the id is a PROP on the real
 * component and therefore invisible in static markup, and the id is exactly
 * what this file has to prove.
 */
vi.mock('@/components/cart/AddToCartButton', () => ({
  default: ({
    productId,
    productName,
    children,
  }: {
    productId: string
    productName: string
    children?: React.ReactNode
  }) => (
    <button type="button" data-product-id={productId} aria-label={`הוסף ${productName} לעגלה`}>
      {children}
    </button>
  ),
}))

/**
 * A dead target loses its href and NOTHING else.
 *
 * Both halves are the test. The first is the NO-GO: eight of the thirty-two
 * cards in `KE_LIVE_DEALS` pointed at products this catalogue does not serve,
 * and four more at a category that does not exist. The second is the project
 * rule that constrains the fix - the grid is pixel-matched to `refs/`, so a
 * card that cannot be clicked still has to MEASURE the same. Every element and
 * every class stays; only the `href` goes, and the cart button becomes one that
 * says so instead of one that fails validation.
 *
 * `renderToStaticMarkup` and not a DOM query, deliberately: what shipped the
 * 404 was an `href` in the HTML, so the assertion is on the HTML.
 */

const PRODUCT = {
  id: 'ke-deal-9132',
  slug: 'עוזרת-אישית-שירותי-משרד',
  name_he: 'עוזרת אישית - שירותי משרד',
  kenyon_price: 949,
  full_price: 1500,
  images: ['/images/products/ke-live-deal-0.avif'],
  stock_quantity: 1,
  category: { name_he: 'בעלי מקצוע', slug: 'professionals' },
}

const UUID = 'afe56c5f-4012-4b02-b696-4f7f7733bd33'

function render(target: {
  productId: string | null
  productReachable: boolean
  categoryReachable: boolean
}) {
  return renderToStaticMarkup(<ProductDealCard product={PRODUCT} target={target} />)
}

const LIVE = render({ productId: UUID, productReachable: true, categoryReachable: true })
const DEAD = render({ productId: null, productReachable: false, categoryReachable: false })

describe('ProductDealCard', () => {
  it('links a resolved card to its product and its category', () => {
    expect(LIVE).toContain(`href="/product/${PRODUCT.slug}"`)
    expect(LIVE).toContain('href="/category/professionals"')
  })

  it('carries the real uuid into the cart button, never the fixture id', () => {
    // `addToCartSchema` validates `product_id` as a uuid, so `ke-deal-9132`
    // could only ever fail - which is what all 32 of these buttons did.
    expect(LIVE).toContain(`data-product-id="${UUID}"`)
    expect(LIVE).not.toContain('ke-deal-9132')
  })

  it('emits no href at all for an unreachable product', () => {
    // Not `href="/product/<slug>"`: the whole path, so a relative or partially
    // built href cannot slip through.
    expect(DEAD).not.toContain('/product/')
  })

  it('emits no href for an unreachable category, and keeps the label', () => {
    expect(DEAD).not.toContain('/category/')
    expect(DEAD).toContain(PRODUCT.category.name_he)
  })

  it('keeps every painted class, so the dead card measures the same', () => {
    for (const cls of [
      'p_con',
      'p_con__category',
      'p_con__title-wrap',
      'p_con__title',
      'p_con__image-wrap',
      'p_con__image-link',
      'p_con__image',
      'p_con__badge',
      'p_con__footer',
      'p_con__prices',
      'atc',
    ]) {
      expect(DEAD, cls).toContain(cls)
    }
    // The image, the price and the discount badge all survive.
    expect(DEAD).toContain('₪949')
    expect(DEAD).toContain('₪1500')
    expect(DEAD).toContain('-37%')
  })

  it('replaces the cart button with a disabled one, not with nothing', () => {
    // `.p_con .atc a, .p_con .atc button` paints the grey circle. A <span>
    // there would match neither and leave a 0x0 hole where live has 40px.
    expect(DEAD).toContain('<button')
    expect(DEAD).toContain('disabled=""')
    expect(DEAD).toContain(`aria-label="${PRODUCT.name_he} אינו זמין כעת"`)
  })

  it('falls back to the product link when the slug lives but the id is unknown', () => {
    // The degraded read: catalogue unreachable, so nothing is withdrawn and
    // nothing is claimed to be addable.
    const unknown = render({ productId: null, productReachable: true, categoryReachable: true })

    expect(unknown).toContain(`href="/product/${PRODUCT.slug}"`)
    expect(unknown).toContain('aria-label="צפה במוצר"')
    expect(unknown).not.toContain('disabled=""')
  })
})
