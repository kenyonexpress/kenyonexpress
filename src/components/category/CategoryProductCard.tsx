'use client'

import AddToCartButton from '@/components/cart/AddToCartButton'
import { cityByName } from '@/lib/geo/cities'
import { formatDistance } from '@/lib/geo/distance'
import { MapPin } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

/**
 * 186px is the CAP, not the width, and the two are only the same above 497px.
 *
 * `.category-card__thumb img` is `max-width: min(--cat-thumb-max, 100%)`. Above
 * 576px the card is a fixed 234 with a 186 content box, so the cap binds and
 * the slot is a flat 186. Below 576 the column is half the row and the content
 * box is what binds; measured at four widths, exactly `50vw - 63px`:
 *
 *   360 -> 117   412 -> 143   480 -> 177   575 -> 225 (capped back to 186)
 *
 * so the two meet at 497px, which is the breakpoint below.
 *
 * This used to be a flat `186px` at every width, which over-ordered by 59% on a
 * 360px phone AND described a box the image was painting outside of. Measured
 * before any of this existed: /products handed a phone 604KB of 600x600
 * originals to paint 186px boxes, because the card rendered a raw <img> and
 * never touched the optimizer at all.
 *
 * `--cat-thumb-max` lives in category-page.css and a `sizes` attribute cannot
 * read a custom property, so this is the one place the two are kept in step by
 * hand. `calc()` also keeps the whole candidate ramp reachable: next only
 * matches a bare `NNvw` after whitespace or the string start
 * (get-img-props.js:54), so `calc(50vw - 63px)` matches nothing and 256 and 384
 * both stay available - which is the point, since 186 at dpr 1.75 wants 326.
 */
const THUMB_MAX_PX = 186
const THUMB_SIZES = `(max-width: 497px) calc(50vw - 63px), ${THUMB_MAX_PX}px`

export type CategoryProduct = {
  id: string
  slug: string
  name_he: string
  kenyon_price: number | null
  full_price?: number | null
  images: unknown
  stock_quantity?: number | null
  categories?: { name_he: string; slug: string }[]
  /** Normalised supplier join. Present once the query selects it. */
  supplier?: { city?: string | null } | null
  /** Set by sortByDistance when the customer asked for "near me". */
  distanceKm?: number | null
}

function formatPrice(value: number): string {
  return `₪${Math.round(value)}`
}

function discountPercent(price: number, old: number): number {
  return Math.round((1 - price / old) * 100)
}

function CartPlusIcon() {
  return (
    <svg
      className="category-card__atc-icon"
      aria-hidden="true"
      viewBox="0 0 576 512"
      xmlns="http://www.w3.org/2000/svg"
      width={18}
      height={18}
      fill="currentColor"
    >
      <path d="M504.717 320H211.572l6.545 32h268.418c15.401 0 26.816 14.301 23.403 29.319l-5.517 24.276C523.112 414.668 536 433.828 536 456c0 31.202-25.519 56.444-56.824 55.994-29.823-.429-54.35-24.631-55.155-54.447-.44-16.287 6.085-31.049 16.803-41.548H231.176C241.553 426.165 248 440.326 248 456c0 31.813-26.528 57.431-58.67 55.938-28.54-1.325-51.751-24.385-53.251-52.917-1.158-22.034 10.436-41.455 28.051-51.586L93.883 64H24C10.745 64 0 53.255 0 40V24C0 10.745 10.745 0 24 0h102.529c11.401 0 21.228 8.021 23.513 19.19L159.208 64H551.99c15.401 0 26.816 14.301 23.403 29.319l-47.273 208C525.637 312.246 515.923 320 504.717 320zM408 168h-48v-40c0-8.837-7.163-16-16-16h-16c-8.837 0-16 7.163-16 16v40h-48c-8.837 0-16 7.163-16 16v16c0 8.837 7.163 16 16 16h48v40c0 8.837 7.163 16 16 16h16c8.837 0 16-7.163 16-16v-40h48c8.837 0 16-7.163 16-16v-16c0-8.837-7.163-16-16-16z" />
    </svg>
  )
}

/**
 * How eagerly this card's thumbnail is fetched, decided by the GRID from the
 * card's position and never by the card itself.
 *
 * `lazy` is right for the 10 cards below the fold and wrong for the ones above
 * it: an in-viewport image that is lazily loaded is discovered only after the
 * preload scanner has finished, which on a category page delays the very image
 * that is most likely to be the LCP element. Lighthouse audits this by name
 * ("Largest Contentful Paint image was lazily loaded"), and every card on this
 * grid carried a hard-coded `loading="lazy"` until now.
 *
 * THE THREE VALUES, and why there are three rather than two:
 *
 *   'lcp'    -> next/image `priority`: eager + fetchPriority=high + a <link
 *               rel=preload> in the head. Reserved for the cards that are above
 *               the fold on a PHONE, which is two: the grid is two columns
 *               under 576px. Preloading more than that on a phone spends the
 *               connection on images nobody has scrolled to yet, which is the
 *               cost the lazy attribute was there to avoid.
 *   'eager'  -> eager, no preload, no priority hint. The rest of the desktop
 *               first row (a 4-up grid above 1023px). They are in the viewport
 *               so they should not wait for the scanner, but they are not LCP
 *               candidates on the device that decides the mobile score.
 *   'lazy'   -> everything else, unchanged.
 */
export type ThumbLoading = 'lcp' | 'eager' | 'lazy'

/** The first two cards on a phone, the first four on a desktop. See ThumbLoading. */
export function thumbLoadingForIndex(index: number): ThumbLoading {
  if (index < 2) return 'lcp'
  if (index < 4) return 'eager'
  return 'lazy'
}

export default function CategoryProductCard({
  product,
  thumbLoading = 'lazy',
}: {
  product: CategoryProduct
  /**
   * Defaults to `lazy`, so a grid that has not been taught about position keeps
   * exactly the behaviour every card had before this prop existed.
   */
  thumbLoading?: ThumbLoading
}) {
  const thumb =
    Array.isArray(product.images) && typeof product.images[0] === 'string'
      ? (product.images[0] as string)
      : null

  const price = product.kenyon_price != null ? Number(product.kenyon_price) : null
  const old = product.full_price != null ? Number(product.full_price) : null
  const hasDiscount = price != null && old != null && old > price
  const pct = hasDiscount && old != null && price != null ? discountPercent(price, old) : 0
  const outOfStock = product.stock_quantity === 0
  const canAdd = price != null && !outOfStock

  const categoryTags = product.categories ?? []
  const cityLabel = cityByName(product.supplier?.city)?.name ?? null
  const distanceLabel =
    typeof product.distanceKm === 'number' ? formatDistance(product.distanceKm) : null

  const priceBlock =
    price == null ? null : hasDiscount && old != null ? (
      <>
        <del>{formatPrice(old)}</del>
        <ins>{formatPrice(price)}</ins>
      </>
    ) : (
      <span>{formatPrice(price)}</span>
    )

  return (
    <article className="category-card">
      <div className="category-card__header">
        {categoryTags.length > 0 && (
          <span className="category-card__categories">
            {categoryTags.map((cat, i) => (
              <span key={cat.slug}>
                {i > 0 && ', '}
                <Link href={`/category/${cat.slug}`}>{cat.name_he}</Link>
              </span>
            ))}
          </span>
        )}

        {/* Where the business is. Shown only when the city is one this
            project knows - cityByName returns null rather than guessing, so a
            business is never labelled with a city it is not in. The distance
            appears only after the customer asked for "near me". */}
        {cityLabel && (
          <span className="category-card__city">
            <MapPin size={11} aria-hidden="true" />
            {cityLabel}
            {distanceLabel && <span className="category-card__distance"> · {distanceLabel}</span>}
          </span>
        )}

        {priceBlock && <span className="category-card__price">{priceBlock}</span>}

        <Link href={`/product/${product.slug}`} className="category-card__link">
          <h2 className="category-card__title">{product.name_he}</h2>
          <span className="category-card__thumb">
            {hasDiscount && (
              <span className="category-card__badge">
                -<span className="percentage">{pct}%</span>
              </span>
            )}
            {thumb ? (
              // width/height stay the 186 square the raw <img> declared: they are
              // the pre-load reservation, and the CSS is width:auto/height:auto
              // under a 186 max on both axes, so the real aspect takes over the
              // moment the file lands. `fill` is what collapsed the deal cards on
              // the homepage - it writes position:absolute inline and the wrapper
              // that takes its height from the image drops to 0.
              <Image
                src={thumb}
                alt={product.name_he}
                width={186}
                height={186}
                sizes={THUMB_SIZES}
                // `priority` and `loading` are mutually exclusive in next/image
                // - passing both logs a warning and the priority wins - so this
                // sets exactly one of them.
                {...(thumbLoading === 'lcp'
                  ? { priority: true }
                  : { loading: thumbLoading === 'eager' ? ('eager' as const) : ('lazy' as const) })}
              />
            ) : null}
          </span>
        </Link>
      </div>

      {/* Measured live .product-loop-footer > .price-add-to-cart: the price is
          repeated under the image with the round add-to-cart on the inline end. */}
      <div className="category-card__footer">
        {priceBlock && <span className="category-card__price">{priceBlock}</span>}
        {canAdd && (
          <AddToCartButton
            productId={product.id}
            productName={product.name_he}
            priceAgorot={Math.round(Number(product.kenyon_price ?? 0) * 100)}
            variant="icon"
            className="category-card__atc"
          >
            <CartPlusIcon />
          </AddToCartButton>
        )}
      </div>
    </article>
  )
}
