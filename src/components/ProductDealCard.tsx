import AddToCartButton from '@/components/cart/AddToCartButton'
import { type DealTarget, UNKNOWN_DEAL_TARGET } from '@/lib/deal-targets'
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
}

/**
 * Deals-grid card as a Server Component ([25]).
 *
 * The homepage used to import the Client `ProductCard` for every tile, which
 * pulled the whole card module (both variants) into the home client graph.
 * Only `AddToCartButton` needs the island; the rest is static markup + Image.
 *
 * `sizes` provenance: measured at eighteen viewport/dpr pairs
 * (scripts/_deal-card-paint.mjs). Same string as ProductCard's deals variant.
 */
const DEAL_SIZE_STOPS = {
  narrow: 430,
  handheld: 640,
  wide: 1023,
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

export default function ProductDealCard({
  product,
  target = UNKNOWN_DEAL_TARGET,
}: {
  product: Product
  /** Measured reachability of this card's links; see lib/deal-targets.ts. */
  target?: DealTarget
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
  // The uuid is the gate, not the fixture id: `addToCartSchema` rejects
  // `ke-deal-9132` before the action runs, so a button without a resolved
  // product id is a button that can only fail.
  const addableId =
    product.kenyon_price != null && !outOfStock && target.productId !== null
      ? target.productId
      : null

  const thumbImage = thumb ? (
    <Image
      src={thumb}
      alt={product.name_he}
      width={400}
      height={245}
      sizes={DEAL_IMAGE_SIZES}
      quality={50}
      // `.p_con__image` pins the height to 245px and leaves the width auto,
      // which is live's aspect. No inline style: see the note in
      // ProductCard.tsx - an inline `height:auto` beats the class and took all
      // 31 homepage thumbs off the pin.
      className="p_con__image"
    />
  ) : null

  return (
    <article className="p_con">
      {product.category &&
        (target.categoryReachable ? (
          <Link href={`/category/${product.category.slug}`} className="p_con__category">
            {product.category.name_he}
          </Link>
        ) : (
          // Four cards say `general` and there is no such category, so this
          // link landed on the not-found page - at HTTP 200, because the
          // category route's `notFound()` fires inside a Suspense boundary.
          // The label is live's and stays; only the href goes. Same element
          // box: `.p_con__category` sets every rule that paints it, and
          // neither <a> nor <span> brings a box of its own.
          <span className="p_con__category">{product.category.name_he}</span>
        ))}

      {/*
        A DEAD SLUG NOW LOSES ITS LINK, AND KEEPS EVERYTHING ELSE.

        This card renders ONLY `KE_LIVE_DEALS` (via `DealsOfTheDay`, its single
        caller), which is a verbatim mirror of the live site's 32 deal hrefs -
        the file says so at the top, "including live's own mismatched slugs".
        Measured against this catalogue, 8 of those 32 slugs have no reachable
        product and answered 404 to anyone who clicked. The earlier fix set
        `prefetch={false}` so the grid stopped firing 404 server renders on
        scroll; that addressed the COST of the dead links and left them dead.

        `target` (lib/deal-targets.ts) is the measurement, taken from the
        catalogue rather than assumed, and an unreachable slug renders as plain
        markup: no href to follow, no 404 to land on. The card itself is
        untouched, because the grid is pixel-matched to `refs/` under a project
        rule - dropping 8 cards would take the homepage from 8 rows to 6 and
        blow the 11% gate. `<span>` and `<a>` measure identically here: every
        rule that paints this card is on `.p_con__*`, and `.p_con__image-link`
        carries its own `display:flex`.

        `prefetch={false}` stays on the links that remain. Its first reason is
        gone with the 404s, but the second stands: this is 24 links in one
        viewport-height grid, and prefetching all of them on scroll buys a
        speculative render each for a page a visitor opens one of.
      */}
      <div className="p_con__title-wrap">
        {target.productReachable ? (
          <Link href={`/product/${product.slug}`} className="hover:underline" prefetch={false}>
            <h2 className="p_con__title">{product.name_he}</h2>
          </Link>
        ) : (
          <span className="hover:underline">
            <h2 className="p_con__title">{product.name_he}</h2>
          </span>
        )}
      </div>

      <div className="p_con__image-wrap relative">
        {target.productReachable ? (
          <Link
            href={`/product/${product.slug}`}
            className="p_con__image-link"
            aria-label={product.name_he}
            prefetch={false}
          >
            {thumbImage}
          </Link>
        ) : (
          <span className="p_con__image-link">{thumbImage}</span>
        )}

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

        {/*
          Three states, and the middle one is why `canAdd` moved.

          `product.id` here is the FIXTURE id (`ke-deal-9132`), not a uuid, and
          `addToCartSchema` validates `product_id` as a uuid - so every one of
          these 32 buttons failed validation before it reached the cart. The
          button now carries `target.productId`, the real row, and works.

          Without a resolved uuid the control falls back to the link it always
          used for unbuyable cards, and when the slug itself is dead there is
          nowhere left to send anyone: a disabled button, which the CSS paints
          as the same grey circle (`.p_con .atc a, .p_con .atc button`), so the
          card measures the same as the other 31.
        */}
        <div className="atc shrink-0">
          {addableId !== null ? (
            <AddToCartButton
              productId={addableId}
              productName={product.name_he}
              priceAgorot={Math.round(Number(product.kenyon_price ?? 0) * 100)}
              disabled={outOfStock}
              variant="icon"
              className="flex h-full w-full items-center justify-center"
            >
              <CartPlusIcon />
            </AddToCartButton>
          ) : target.productReachable ? (
            <Link href={`/product/${product.slug}`} aria-label="צפה במוצר" prefetch={false}>
              <CartPlusIcon />
            </Link>
          ) : (
            <button
              type="button"
              disabled
              aria-label={`${product.name_he} אינו זמין כעת`}
              className="flex h-full w-full items-center justify-center"
            >
              <CartPlusIcon />
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
