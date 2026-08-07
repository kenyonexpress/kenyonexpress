'use client'

import AddToCartButton from '@/components/cart/AddToCartButton'
import Image from 'next/image'
import Link from 'next/link'
// product-card-deals.css is imported by the root layout. See the note there.

export type Product = {
  id: string
  slug: string
  name_he: string
  kenyon_price: number | null
  images: unknown
  stock_quantity: number | null
  full_price?: number | null
  category?: { name_he: string; slug: string } | null
}

/**
 * What a deal card image paints, measured at eighteen viewport/dpr pairs on a
 * running build (scripts/_deal-card-paint.mjs). Each branch states the WIDEST
 * card the branch can produce, not the average one.
 *
 *   320  112px  35.0vw    575  240px  41.7vw    1024  208px  20.3vw
 *   360  132px  36.7vw    640  272px  42.5vw    1280  240px  18.8vw
 *   412  158px  38.3vw    768  335px  43.6vw    1440  240px  16.7vw
 *   440  172px  39.1vw    900  401px  44.6vw    1920  240px  12.5vw
 *   480  192px  40.0vw   1023  463px  45.3vw
 *
 * Below 1024 that is exactly `50vw - 48px` at every width measured, which is
 * the row's fixed gutter. It is NOT written as `calc(50vw - 48px)`, even though
 * `sizes` accepts calc: next/image reads the vw out with a regex and filters
 * its candidate ramp to `>= deviceSizes[0] * smallestRatio`, so a literal 50vw
 * would cut everything below 320 off the ramp and the exact-fit rung would
 * become unreachable. Discrete branches keep the ramp open.
 *
 * The old string said `50vw / 33vw / 400px` and was wrong in BOTH directions:
 *
 *   OVER, on desktop. At 1440 dpr 1 the widest card paints 240px and asked for
 *   a 640px file - the `400px` branch is 2.67x what any card there renders.
 *
 *   UNDER, between 641 and 1023, which is the half nobody looks for. One card
 *   in the row grows to 45vw there, so at 900 dpr 2 it needs 802 device pixels
 *   and `33vw` asked for 594. It was served a 640 and quietly upscaled. A
 *   `sizes` that is too small does not error, it just renders soft.
 *
 * 430 is where `39vw` stops covering `50vw - 48px` (0.11 * W = 48). It exists
 * because 39vw is what puts a 412px phone on the 288 rung - 158 painted, 277
 * device pixels at dpr 1.75 - and 43vw, which the 640 end of the range needs,
 * declares 177 there and rounds it up to a 384. That one rung across 32 cards
 * is the 400KiB Lighthouse reports on this page.
 *
 * The top breakpoint is 1023 and not 1024 because the layout switches AT 1024
 * (`min-width: 1024px`), and the old `(max-width: 1024px)` put that one pixel
 * in the wrong branch.
 */
const DEAL_SIZE_STOPS = {
  /** where 39vw stops covering `50vw - 48px`: 0.11 * W = 48 */
  narrow: 430,
  /** the row's own two-up boundary */
  handheld: 640,
  /** one below the `min-width: 1024px` the layout switches at */
  wide: 1023,
  /** the widest card any viewport >= 1024 paints */
  desktopPaint: 240,
} as const

const DEAL_IMAGE_SIZES = [
  `(max-width: ${DEAL_SIZE_STOPS.narrow}px) 39vw`,
  `(max-width: ${DEAL_SIZE_STOPS.handheld}px) 43vw`,
  `(max-width: ${DEAL_SIZE_STOPS.wide}px) 46vw`,
  `${DEAL_SIZE_STOPS.desktopPaint}px`,
].join(', ')

function shekels(value: number): string {
  return `₪${Math.round(value)}`
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

function DealsProductCard({ product }: { product: Product }) {
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

  return (
    <article className="p_con">
      {product.category && (
        <Link href={`/category/${product.category.slug}`} className="p_con__category">
          {product.category.name_he}
        </Link>
      )}

      <div className="p_con__title-wrap">
        <Link href={`/product/${product.slug}`} className="hover:underline">
          <h2 className="p_con__title">{product.name_he}</h2>
        </Link>
      </div>

      <div className="p_con__image-wrap relative">
        {/* aria-label, not just the img alt: a product with no thumbnail renders
            this link with NO children at all, and an empty link has no
            accessible name. Lighthouse flags exactly one on the homepage today,
            and the offender is the imageless Dokan bookkeeping row. The label
            has to survive a missing image, so it lives on the link. */}
        <Link
          href={`/product/${product.slug}`}
          className="p_con__image-link"
          aria-label={product.name_he}
        >
          {/* IN FLOW, not `fill`, and the distinction is the whole card.
              `.p_con__image-wrap` sets no height of its own - it is a bare flex
              box that takes the height of the image inside it, which
              `.p_con__image` fixes at live's 245px. `fill` makes next/image
              write `position:absolute` as an INLINE style, which beats the
              class: the image leaves the flow, the wrap has nothing in-flow
              left to measure, and it collapses. Then `height:100%` of a zero
              box is zero.

              That is not a theory. It shipped: every one of the 32 deal cards
              on the homepage rendered with NO IMAGE, measured at 239x0 with a
              naturalWidth of 459, so the bytes were fetched and thrown away.
              The homepage came out 3504px tall against live's 5492px and the
              pixel gate read 22.4% instead of 10.92%. Nothing errored, and the
              Lighthouse score it was traded for went UP, which is why it
              survived two rounds of measurement.

              The optimizer is still doing its job here - that was the point of
              the change that introduced `fill`, and it is worth keeping. It
              needs `sizes`, not `fill`. Width and height are next/image's
              required intrinsic hint and nothing renders at them: `.p_con__image`
              pins the height to 245 and leaves the width auto, which is how
              live keeps a narrow image narrow instead of stretching it.

              DO NOT add `style={{ width: 'auto', height: 'auto' }}` back here.
              It was added in [35] to silence next/image's "width or height
              modified, but not the other" console line, and it is the same
              inline-beats-class mistake as `fill` above: an inline `height:auto`
              overrides `.p_con__image`'s 245px, so every card rendered at its
              source aspect instead. Measured on the homepage: 31 of 31 images
              off the pin, heights spread from 124px to 361px, and the pixel gate
              at 24.16% against 11.26-11.62% on record. The warning it bought is
              guarded by `process.env.NODE_ENV !== 'production'`
              (next/dist/client/image-component.js:84) and is unavoidable by
              design here - rendering at live's aspect means the rendered width
              cannot equal the declared 400. A dev-only console line is not worth
              a production layout. */}
          {thumb ? (
            <Image
              src={thumb}
              alt={product.name_he}
              width={400}
              height={245}
              sizes={DEAL_IMAGE_SIZES}
              quality={50}
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
            <span className="p_con__strike">{shekels(old)}</span>
            <span className="p_con__sale">{shekels(price)}</span>
          </div>
        ) : (
          <div className="p_con__prices">
            {product.kenyon_price != null && (
              <span className="p_con__single-price">{shekels(price)}</span>
            )}
          </div>
        )}

        <div className="atc shrink-0">
          {canAdd ? (
            <AddToCartButton
              productId={product.id}
              productName={product.name_he}
              disabled={outOfStock}
              variant="icon"
              className="flex h-full w-full items-center justify-center"
            >
              <CartPlusIcon />
            </AddToCartButton>
          ) : (
            <Link href={`/product/${product.slug}`} aria-label="צפה במוצר">
              <CartPlusIcon />
            </Link>
          )}
        </div>
      </div>
    </article>
  )
}

function DefaultProductCard({ product }: { product: Product }) {
  const thumb =
    Array.isArray(product.images) && typeof product.images[0] === 'string'
      ? (product.images[0] as string)
      : null

  const price = Number(product.kenyon_price ?? 0)
  const old = product.full_price != null ? Number(product.full_price) : null
  const hasDiscount = old != null && old > price
  const outOfStock = product.stock_quantity === 0
  const canAdd = product.kenyon_price != null && !outOfStock

  return (
    <div className="overflow-hidden rounded-xl border border-gray-100 bg-white">
      <div className="space-y-2 p-3">
        {product.category && (
          <Link
            href={`/category/${product.category.slug}`}
            className="block text-xs text-muted-2 hover:text-heading line-clamp-1"
          >
            {product.category.name_he}
          </Link>
        )}

        <Link
          href={`/product/${product.slug}`}
          className="line-clamp-2 text-section-title text-link leading-snug hover:underline"
        >
          {product.name_he}
        </Link>

        <Link
          href={`/product/${product.slug}`}
          className="relative flex aspect-square items-center justify-center overflow-hidden bg-gray-50"
        >
          {/* next/image here and not on the deals card: this wrapper reserves
              the box itself with aspect-square, so `fill` cannot shift the
              layout. `sizes` is what stops the browser fetching a full-width
              image for a card that is at most a third of the row. */}
          {thumb ? (
            <Image
              src={thumb}
              alt={product.name_he}
              fill
              /**
               * MEASURED, not declared. The only live consumer of this variant
               * is `RelatedProducts` on the product page, whose grid is
               * `.pdp-related__grid`: 2 columns below 640, 3 below 1024, then 5
               * fixed 230px cards. The painted image width was read at 14
               * viewport widths and each branch is an exact linear fit on 5 or
               * more of them, residual 0:
               *
               *   360 -> 133   390 -> 148   412 -> 159   480 -> 193   600 -> 253
               *   640 -> 169.33   768 -> 212   900 -> 256   1023 -> 297
               *   1024 and up -> 204, fixed
               *
               * The old value claimed 50vw / 33vw / 25vw, which is the GRID
               * COLUMN and not the image: it ignored the page gutter, the 12px
               * grid gap and the card's own 12px padding. At 412/dpr1.75 that
               * asked for 384 where 288 covers the 278 device pixels the box
               * actually has (11028 bytes against 7530 on a 600x600 source),
               * and at 1440 it asked for 384 to paint 204.
               *
               * `calc()` is deliberate, and it also widens the srcset: next only
               * matches a bare `NNvw` token when it follows whitespace or the
               * start of the string (get-img-props.js:54), so `calc(50vw - 47px)`
               * matches nothing and the whole size ramp stays available instead
               * of being floored at 640 * smallest-ratio.
               */
              sizes="(max-width: 639px) calc(50vw - 47px), (max-width: 1023px) calc(33.33vw - 44px), 204px"
              className="object-cover"
            />
          ) : (
            <span className="text-5xl">📦</span>
          )}
          {outOfStock && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/70">
              <span className="rounded-full border bg-white px-2 py-1 text-xs font-semibold text-gray-500">
                אזל המלאי
              </span>
            </div>
          )}
        </Link>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-baseline gap-2">
            {hasDiscount && old != null && (
              <span className="text-sm text-deal-price line-through">{shekels(old)}</span>
            )}
            <span
              className={
                hasDiscount
                  ? 'text-base font-bold text-price'
                  : 'text-base font-bold text-deal-price'
              }
            >
              {shekels(price)}
            </span>
          </div>

          {canAdd && (
            <AddToCartButton
              productId={product.id}
              productName={product.name_he}
              className="rounded-lg bg-brand-primary px-3 py-1.5 text-xs font-bold text-brand-dark hover:bg-brand-primary-hover transition-colors"
            >
              הוסף לסל
            </AddToCartButton>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ProductCard({
  product,
  variant = 'default',
}: {
  product: Product
  variant?: 'default' | 'deals'
}) {
  if (variant === 'deals') {
    return <DealsProductCard product={product} />
  }
  return <DefaultProductCard product={product} />
}
