import AddToCartButton from '@/components/cart/AddToCartButton'
import { cityByName } from '@/lib/geo/cities'
import { shekelsFromIlsRounded } from '@/lib/money-format'
import Image from 'next/image'
import Link from 'next/link'

/** Same shape as `Product` on ProductCard; kept local so this file never
 *  imports the Client Component module (which would pull it into the server
 *  graph and defeat the split). */
type Product = {
  id: string
  slug: string
  name_he: string
  kenyon_price: number | null
  images: unknown
  stock_quantity: number | null
  full_price?: number | null
  category?: { name_he: string; slug: string } | null
  /** The meta line under the category: where the deal is. Null paints nothing. */
  city?: string | null
}

/**
 * Deals-grid card as a Server Component ([25]).
 *
 * The homepage used to import the Client `ProductCard` for every tile, which
 * pulled the whole card module (both variants) into the home client graph.
 * Only `AddToCartButton` needs the island; the rest is static markup + Image.
 *
 * `sizes` MATCHES THE GRID THIS CARD IS IN, `.jet-listing-grid-deals`, which
 * is one card per row below 768, two to 1199 and four from 1200
 * (product-card-deals.css). The previous string (`39vw` below 430, `43vw`
 * to 640, `46vw` to 1023) described the two-up phone grid that the parity
 * work replaced, and it was measured wrong on 2026-09-25 at eleven viewports:
 * a 412px phone paints this image 314px wide (100vw minus the 49px side
 * margins) and `39vw` declared 160, so Chrome fetched the 288 rung for a
 * 550-device-pixel slot at dpr 1.75. Two consequences, both measured:
 *
 *  - every phone thumbnail was upscaled 1.9x, which is a soft picture;
 *  - Chrome's LCP caps an upscaled image at its intrinsic size, so the shell's
 *    capture card (painted at ~150ms) scored 56k and lost the LCP to the
 *    catalogue card that replaced it at 700-1200ms, whose AVIF source the
 *    optimizer serves unresized. Lighthouse then charged the whole page's
 *    load to the LCP. With the declared width honest, the capture card is
 *    the LCP and the swap is invisible to the metric, as it is to the eye.
 *
 * Below 430 the image is column-bound: `100vw - 98px` (262 at 360, 282 at
 * 380, 314 at 412). From 431 to 1199 it is aspect-bound at 245px tall: 319
 * for live's 1.30 captures, 353 for a 600x417 photo, 245 for a square; 360
 * covers those, and a 16:9 photo (436) is the one shape that still upscales,
 * by 1.2. From 1200 the widest card paints 239 (measured at 1440).
 */
const DEAL_SIZE_STOPS = {
  /** below this the image is column-bound, 100vw minus the two 49px margins */
  narrow: 430,
  /** one below the `min-width: 1200px` the four-up grid switches at */
  wide: 1199,
  /** the widest image any viewport >= 1200 paints */
  desktopPaint: 240,
} as const

const DEAL_IMAGE_SIZES = [
  `(max-width: ${DEAL_SIZE_STOPS.narrow}px) calc(100vw - 98px)`,
  `(max-width: ${DEAL_SIZE_STOPS.wide}px) 360px`,
  `${DEAL_SIZE_STOPS.desktopPaint}px`,
].join(', ')

function shekelsFromIls(value: number): string {
  return shekelsFromIlsRounded(value)
}

function CartPlusIcon() {
  return (
    <svg
      className="e-font-icon-svg e-fas-cart-plus"
      aria-hidden="true"
      viewBox="0 0 576 512"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M504.717 320H211.572l6.545 32h268.418c15.401 0 26.816 14.301 23.403 29.319l-5.517 24.276C523.112 414.668 536 433.828 536 456c0 31.202-25.519 56.444-56.824 55.994-29.823-.429-54.35-24.631-55.155-54.447-.44-16.287 6.085-31.049 16.803-41.548H231.176C241.553 426.165 248 440.326 248 456c0 31.813-26.528 57.431-58.67 55.938-28.54-1.325-51.751-24.385-53.251-52.917-1.158-22.034 10.436-41.455 28.051-51.586L93.883 64H24C10.745 64 0 53.255 0 40V24C0 10.745 10.745 0 24 0h102.529c11.401 0 21.228 8.021 23.513 19.19L159.208 64H551.99c15.401 0 26.816 14.301 23.403 29.319l-47.273 208C525.637 312.246 515.923 320 504.717 320zM408 168h-48v-40c0-8.837-7.163-16-16-16h-16c-8.837 0-16 7.163-16 16v40h-48c-8.837 0-16 7.163-16 16v16c0 8.837 7.163 16 16 16h48v40c0 8.837 7.163 16 16 16h16c8.837 0 16-7.163 16-16v-40h48c8.837 0 16-7.163 16-16v-16c0-8.837-7.163-16-16-16z" />
    </svg>
  )
}

/**
 * LIVE'S CATCH-ALL CATEGORY HAS NO ROW HERE, SO ITS LINK WENT NOWHERE.
 *
 * Four of the 32 cards - the two hotels, the AirPods and the café breakfast -
 * are labelled "כללי" and carry `slug: 'general'`, copied verbatim from live
 * along with everything else in the fixture. This catalogue has twelve
 * categories and none of them is `general`, so `/category/general` was a page
 * that did not exist. It was invisible while the route answered a soft 200;
 * once it started answering a real 404 it became a dead link on the home page.
 *
 * The LABEL is not touched, because the label is measured: "כללי" is what live
 * prints and what the comparison gate expects in that box. Only the
 * destination changes, and "everything we sell" is the honest reading of a
 * category called general. The anchor, its class and its text are identical,
 * so this costs nothing in pixels.
 *
 * Deliberately NOT the same treatment as the eight dead PRODUCT slugs above:
 * those are products this catalogue has not imported yet, so their hrefs are
 * right and merely early. `general` is not early - there is no such category
 * and no plan for one.
 */
const LIVE_CATCH_ALL_CATEGORY = 'general'

function categoryHref(slug: string): string {
  return slug === LIVE_CATCH_ALL_CATEGORY ? '/products' : `/category/${slug}`
}

/**
 * `priority` is the LCP hint for the first cards of the REAL grid only.
 *
 * Measured with Lighthouse mobile on 2026-09-25 against the production build:
 * the LCP element on the home page is the first deal card's photo, and it is
 * the photo from the streamed catalogue grid, not the fixture in the static
 * shell. The discovery checklist failed on all three lines (no fetchpriority,
 * not discoverable in the initial document, loading=lazy) and the breakdown
 * charged 525-634ms of resource load delay to it: the request only left after
 * the boundary swapped and layout ran. `priority` on next/image emits
 * fetchpriority="high", drops loading="lazy" and preloads from the stream.
 *
 * The fallback grid stays lazy on purpose. Its cards are replaced the moment
 * the catalogue segment lands, so preloading its photos would spend the
 * phone's first round trips on pictures the visitor never keeps.
 */
export default function ProductDealCard({
  product,
  priority = false,
}: {
  product: Product
  priority?: boolean
}) {
  const thumb =
    Array.isArray(product.images) && typeof product.images[0] === 'string'
      ? (product.images[0] as string)
      : null

  const price = Number(product.kenyon_price ?? 0)
  const old = product.full_price != null ? Number(product.full_price) : null
  const hasDiscount = old != null && old > price
  const discountPct = hasDiscount ? Math.round((1 - price / old) * 100) : 0
  const outOfStock = product.stock_quantity === 0
  const canAdd = product.kenyon_price != null && !outOfStock
  // The canonical spelling when the value names a city this project knows
  // ("תל אביב יפו" -> "תל אביב"), the operator's own text otherwise. The
  // category card shows known cities only because it also sorts by their
  // coordinates; the meta line here only labels, so hiding a real value the
  // table has not learned yet would hide the fact the card exists to show.
  const city = cityByName(product.city)?.name ?? product.city?.trim() ?? null

  return (
    <article className="p_con">
      {/*
        ONE LINE, 24px, WHATEVER IT HOLDS. The category alone was a 24px row
        in the capture (product-card-deals.css pins the line height). The city
        joins it on the same row rather than under it, and the row clips with
        an ellipsis rather than wrapping, because a second 24px line on one
        card in a row moves every card below it and the diff is banded.
      */}
      {(product.category || city) && (
        <div className="p_con__meta">
          {product.category && (
            <Link href={categoryHref(product.category.slug)} className="p_con__category">
              {product.category.name_he}
            </Link>
          )}
          {city && (
            <span className="p_con__city">
              {product.category ? ' · ' : ''}
              {city}
            </span>
          )}
        </div>
      )}

      {/*
        `prefetch={false}` on every product link in this card, and it is a fix
        with a number behind it.

        Until 2026-09-25 this card rendered ONLY `KE_LIVE_DEALS`, a verbatim
        mirror of the live site's 32 deal hrefs, and 8 of those slugs had no
        product here, so Next's in-view prefetch fired a full server render that
        came back 404 on every homepage view - which is how `home.spec.ts`
        "reaching the footer costs no 404s" caught it. The grid now renders
        catalogue rows (`lib/homepage/deals.ts`), so every href resolves; the
        capture is only the fallback when the catalogue does not answer.

        `prefetch={false}` stays. 32 cards on the busiest page are 32
        speculative product renders per visit whether or not they 404, and the
        fallback still carries the capture's hrefs. Same shape as the
        `built: false` footer links from [21]: the href remains, the
        speculative fetch does not.
      */}
      <div className="p_con__title-wrap">
        <Link href={`/product/${product.slug}`} className="hover:underline" prefetch={false}>
          <h2 className="p_con__title">{product.name_he}</h2>
        </Link>
      </div>

      <div className="p_con__image-wrap relative">
        <Link
          href={`/product/${product.slug}`}
          className="p_con__image-link"
          aria-label={product.name_he}
          prefetch={false}
        >
          {thumb ? (
            <Image
              src={thumb}
              alt={product.name_he}
              width={400}
              height={245}
              sizes={DEAL_IMAGE_SIZES}
              quality={50}
              priority={priority}
              // `.p_con__image` pins the height to 245px and leaves the width
              // auto, which is live's aspect. No inline style: see the note in
              // ProductCard.tsx - an inline `height:auto` beats the class and
              // took all 31 homepage thumbs off the pin.
              className="p_con__image"
            />
          ) : null}
        </Link>

        {hasDiscount && (
          <div className="p_con__badge">
            <span className="discount_per">-{discountPct}%</span>
          </div>
        )}

        {outOfStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70">
            <span className="rounded-full border bg-white px-2 py-1 text-xs font-semibold text-gray-500">
              אזל המלאי
            </span>
          </div>
        )}
      </div>

      <div className="p_con__footer">
        {hasDiscount && old != null ? (
          <div className="p_con__prices">
            <span className="p_con__strike">{shekelsFromIls(old)}</span>
            <span className="p_con__sale">{shekelsFromIls(price)}</span>
          </div>
        ) : (
          <div className="p_con__prices">
            {product.kenyon_price != null && (
              <span className="p_con__single-price">{shekelsFromIls(price)}</span>
            )}
          </div>
        )}

        <div className="atc shrink-0">
          {canAdd ? (
            <AddToCartButton
              productId={product.id}
              productName={product.name_he}
              priceAgorot={Math.round(Number(product.kenyon_price ?? 0) * 100)}
              disabled={outOfStock}
              variant="icon"
              className="flex h-full w-full items-center justify-center"
            >
              <CartPlusIcon />
            </AddToCartButton>
          ) : (
            <Link href={`/product/${product.slug}`} aria-label="צפה במוצר" prefetch={false}>
              <CartPlusIcon />
            </Link>
          )}
        </div>
      </div>
    </article>
  )
}
