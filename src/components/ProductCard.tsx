import Link from 'next/link'
import '@/styles/product-card-deals.css'

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

/* live singlefile format: "₪3900" — no decimals, no thousands separator */
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
        <Link href={`/product/${product.slug}`} className="p_con__image-link">
          {thumb ? (
            <img src={thumb} alt={product.name_he} className="p_con__image" loading="lazy" />
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
            {/* live renders an empty price area when the product has no price (e.g. restaurants-meat-2) */}
            {product.kenyon_price != null && (
              <span className="p_con__single-price">{shekels(price)}</span>
            )}
          </div>
        )}

        <div className="atc shrink-0">
          <Link href={`/product/${product.slug}`} aria-label="הוסף לעגלה">
            <CartPlusIcon />
          </Link>
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

  return (
    <div className="overflow-hidden rounded-xl border border-gray-100 bg-white">
      <div className="space-y-2 p-3">
        {product.category && (
          <Link
            href={`/category/${product.category.slug}`}
            className="block text-[12px] text-[#768b9e] hover:text-[#333e48] line-clamp-1"
          >
            {product.category.name_he}
          </Link>
        )}

        <Link
          href={`/product/${product.slug}`}
          className="line-clamp-2 text-[22px] text-[#0062bd] leading-snug hover:underline"
        >
          {product.name_he}
        </Link>

        <Link
          href={`/product/${product.slug}`}
          className="relative flex aspect-square items-center justify-center overflow-hidden bg-gray-50"
        >
          {thumb ? (
            <img src={thumb} alt={product.name_he} className="h-full w-full object-cover" />
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

        <div className="flex flex-wrap items-baseline gap-2">
          {hasDiscount && old != null && (
            <span className="text-[14px] text-[#2d2d2d] line-through">{shekels(old)}</span>
          )}
          <span
            className={
              hasDiscount
                ? 'text-[16px] font-bold text-[#c93636]'
                : 'text-[16px] font-bold text-[#2d2d2d]'
            }
          >
            {shekels(price)}
          </span>
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
