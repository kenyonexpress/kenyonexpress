import AddToCartButton from '@/components/cart/AddToCartButton'
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

export default function ProductDealCard({ product }: { product: Product }) {
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

      {/*
        `prefetch={false}` on every product link in this card, and it is a fix
        with a number behind it.

        This card renders ONLY `KE_LIVE_DEALS` (via `DealsOfTheDay`, its single
        caller), which is a verbatim mirror of the live site's 32 deal hrefs -
        the file says so at the top, "including live's own mismatched slugs".
        Measured against this catalogue: **8 of those 32 slugs have no product
        here at all** (`reverse-withdrawal-payment`, `קופון-טסט`,
        `צימר-מאסטר-copy-copy`, `מלון-4-כוכבים-פלוס-ארוחת-בוקר`,
        `מלון-5-כוכבים-בטבריה`, `ארוחת-בוקר-זוגית-בקפה-קפה`,
        `עוזרת-אישית-שירותי-משרד`,
        `תספורת-לגבר-ילד-או-סידור-זקן-בפתח-תקווה`), and all 8 answer 404.

        Next prefetches a Link when it scrolls into view, so a quarter of this
        grid fired a full server render that came back 404 on every homepage
        view. That was invisible while the product page was a PPR shell: a
        prefetch got the static frame with a 200 and never ran the body that
        calls `notFound()`. Now that the page is fully static per slug ([46]),
        the prefetch resolves the real thing and the 404 surfaces - which is
        how `home.spec.ts` "reaching the footer costs no 404s" caught it.

        The links stay, because the cards are pixel-matched to live and this is
        a DATA gap (those products are not imported yet - recorded in
        GO-LIVE.md), not a markup one. Same shape as the `built: false` footer
        links from [21]: the href remains, the speculative fetch does not.
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
