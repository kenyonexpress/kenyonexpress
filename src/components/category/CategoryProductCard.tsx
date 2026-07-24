'use client'

import AddToCartButton from '@/components/cart/AddToCartButton'
import Link from 'next/link'

export type CategoryProduct = {
  id: string
  slug: string
  name_he: string
  kenyon_price: number | null
  full_price?: number | null
  images: unknown
  stock_quantity?: number | null
  categories?: { name_he: string; slug: string }[]
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

export default function CategoryProductCard({
  product,
  showCustomPrice = true,
}: {
  product: CategoryProduct
  /** Live /shop/ cards keep the 72px slot empty; category archives fill it. */
  showCustomPrice?: boolean
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
              <img src={thumb} alt={product.name_he} loading="lazy" width={186} height={186} />
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
            variant="icon"
            className="category-card__atc"
          >
            <CartPlusIcon />
          </AddToCartButton>
        )}
      </div>

      {/* Measured live .custom-price-wrapper (h 72): two plain ink 14px lines,
          full price then discounted, separated by a <br>. Live WooCommerce
          numbers are a separate manual field; we reproduce geometry from
          full_price / kenyon_price. See docs/CATEGORY-1TO1-FINDINGS.md.
          Live /shop/ keeps this slot blank (no wrapper text) while the card
          stays 438px tall, so shop mode reserves the height without ink. */}
      {price != null && (
        <div
          className="category-card__custom-price"
          aria-hidden={showCustomPrice ? undefined : true}
        >
          {showCustomPrice ? (
            <>
              <div className="full-price">{formatPrice(old ?? price)}</div>
              <br />
              <div className="discount-price">{formatPrice(price)}</div>
            </>
          ) : null}
        </div>
      )}
    </article>
  )
}
