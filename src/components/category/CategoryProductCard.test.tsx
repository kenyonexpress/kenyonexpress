import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import CategoryProductCard, { type CategoryProduct } from './CategoryProductCard'
import { ABOVE_FOLD_CARD_COUNT } from './above-fold'

// Client islands the loading hints do not need: the cart button wants the
// cart provider and the wishlist heart wants useRouter().
vi.mock('@/components/cart/AddToCartButton', () => ({ default: () => null }))
vi.mock('@/components/product/WishlistButton', () => ({ default: () => null }))
vi.mock('@/components/compare/CompareButton', () => ({ default: () => null }))

const product = (n: number): CategoryProduct => ({
  id: `p${n}`,
  slug: `slug-${n}`,
  name_he: `מוצר ${n}`,
  kenyon_price: 100,
  full_price: 200,
  images: [`/images/products/p${n}.webp`],
  stock_quantity: 5,
})

const BLUR = 'data:image/webp;base64,UklGRkIAAABXRUJQVlA4IDYAAADwAQCdASoKAAgAA4BaJYwCdAA='

function renderGrid(count: number, blur?: string) {
  return renderToStaticMarkup(
    <ul>
      {Array.from({ length: count }, (_, index) => product(index)).map((item, index) => (
        <li key={item.id}>
          <CategoryProductCard
            product={item}
            priority={index === 0}
            eager={index < ABOVE_FOLD_CARD_COUNT}
            blurDataURL={blur}
            dimensions={blur ? { w: 600, h: 417 } : undefined}
          />
        </li>
      ))}
    </ul>,
  )
}

const imgsOf = (html: string) => html.match(/<img[^>]*>/g) ?? []

/**
 * THE GRID'S FIRST ROW IS EAGER, ITS FIRST CARD IS THE LCP IMAGE, AND THE
 * REST STAY LAZY. Every card on /category, /products and /search was
 * `loading="lazy"` with no fetch priority, so the largest raster in the
 * first viewport could not be requested until layout. The contract is one
 * `priority` card (preload + `fetchpriority="high"`), ABOVE_FOLD_CARD_COUNT
 * eager cards, and lazy for everything below the fold, so nobody "helps" by
 * marking the whole page eager and hands the phone forty offscreen fetches.
 */
describe('CategoryProductCard image loading hints', () => {
  it('marks exactly the first card as priority and the first row as eager', () => {
    const imgs = imgsOf(renderGrid(ABOVE_FOLD_CARD_COUNT + 3))
    expect(imgs).toHaveLength(ABOVE_FOLD_CARD_COUNT + 3)

    const [first, ...rest] = imgs
    expect(first).toMatch(/fetchpriority="high"/i)
    expect(first).not.toMatch(/loading="lazy"/)

    const eager = rest.slice(0, ABOVE_FOLD_CARD_COUNT - 1)
    const lazy = rest.slice(ABOVE_FOLD_CARD_COUNT - 1)
    expect(eager).toHaveLength(ABOVE_FOLD_CARD_COUNT - 1)
    for (const img of eager) {
      expect(img).toMatch(/loading="eager"/)
      expect(img).not.toMatch(/fetchpriority/i)
    }
    expect(lazy).toHaveLength(3)
    for (const img of lazy) {
      expect(img).toMatch(/loading="lazy"/)
      expect(img).not.toMatch(/fetchpriority/i)
    }
  })

  it('is lazy with no priority when the caller passes nothing (the old default)', () => {
    const [img] = imgsOf(renderToStaticMarkup(<CategoryProductCard product={product(9)} />))
    expect(img).toMatch(/loading="lazy"/)
    expect(img).not.toMatch(/fetchpriority/i)
    expect(img).toMatch(/ width="186"/)
    expect(img).toMatch(/ height="186"/)
    expect(img).not.toMatch(/background-image/)
  })

  it('paints the blur placeholder and reserves the real ratio when given both', () => {
    const [img] = imgsOf(renderGrid(1, BLUR))
    // next/image wraps the data URL in an inline SVG with a Gaussian blur and
    // sets it as the background until the real bytes paint.
    expect(img).toMatch(/background-image:url\(&quot;data:image\/svg\+xml/)
    // The data URL itself sits raw inside the SVG's <image href>.
    expect(img).toContain(BLUR)
    expect(img).toMatch(/ width="600"/)
    expect(img).toMatch(/ height="417"/)
  })
})
