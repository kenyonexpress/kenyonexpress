import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import DealsOfTheDay from './DealsOfTheDay'

// The island needs the cart provider; the grid's image hints do not.
vi.mock('@/components/cart/AddToCartButton', () => ({ default: () => null }))
// Same for the wishlist heart (STEP 12): a client island on useRouter().
vi.mock('@/components/product/WishlistButton', () => ({ default: () => null }))
// And the compare control beside it (STEP 56), a client island on useRouter() too.
vi.mock('@/components/compare/CompareButton', () => ({ default: () => null }))

/**
 * THE PHONE'S LCP IMAGE IS EAGER AND HIGH PRIORITY, AND ONLY THAT ONE.
 *
 * At phone widths the hero paints no photograph, so the first deal card's
 * image is the largest raster in the first viewport. Measured 30.09.2026
 * (Lighthouse mobile, devtools throttling): as a lazy image it could not be
 * requested until layout, 1783ms after the first byte, and LCP was 3.2s.
 * The fix is one `priority` on one card. This pins both halves: the first
 * card is eager with `fetchpriority="high"`, and the other 31 stay lazy, so
 * nobody "helps" by marking the whole first row and hands the phone three
 * offscreen rasters competing with the one that matters.
 */
describe('DealsOfTheDay image loading hints', () => {
  it('marks exactly the first card image as the priority (LCP) image', async () => {
    const html = renderToStaticMarkup(await DealsOfTheDay())
    const imgs = html.match(/<img[^>]*class="p_con__image"[^>]*>/g) ?? []
    expect(imgs.length).toBeGreaterThanOrEqual(30)

    const [first, ...rest] = imgs
    expect(first).toMatch(/fetchpriority="high"/i)
    expect(first).not.toMatch(/loading="lazy"/)

    for (const img of rest) {
      expect(img).toMatch(/loading="lazy"/)
      expect(img).not.toMatch(/fetchpriority="high"/i)
    }
  })

  it('keeps width and height on every card image so the grid reserves its rows', async () => {
    const html = renderToStaticMarkup(await DealsOfTheDay())
    const imgs = html.match(/<img[^>]*class="p_con__image"[^>]*>/g) ?? []
    for (const img of imgs) {
      expect(img).toMatch(/ width="\d+"/)
      expect(img).toMatch(/ height="\d+"/)
    }
  })
})

/**
 * EVERY CARD WITH A FILE IN THE MANIFEST PAINTS A BLUR AND RESERVES ITS REAL
 * RATIO. The lookup is the server component's job (the card is a client
 * island and the manifest must not enter a client bundle), so this renders
 * the grid, not the card: it is the wiring that was missing, not the prop.
 * 31 of the 32 live deal thumbs are in `public/images/products`; the 32nd
 * (`ke-live-deal-31`) was never captured and has no file, so it is the one
 * card that may render without a placeholder.
 */
describe('DealsOfTheDay blur placeholders', () => {
  it('passes a blur placeholder and the real dimensions from the manifest', async () => {
    const html = renderToStaticMarkup(await DealsOfTheDay())
    const imgs = html.match(/<img[^>]*class="p_con__image"[^>]*>/g) ?? []
    const withBlur = imgs.filter((img) =>
      /background-image:url\(&quot;data:image\/svg\+xml/.test(img),
    )
    expect(withBlur.length).toBeGreaterThanOrEqual(imgs.length - 1)
    // The reservation is the file's own size, not the 400x245 default: a
    // 600x600 thumb declared as 400x245 is a box that changes shape on load.
    const defaults = imgs.filter((img) => / width="400"/.test(img) && / height="245"/.test(img))
    expect(defaults.length).toBeLessThanOrEqual(1)
  })
})
