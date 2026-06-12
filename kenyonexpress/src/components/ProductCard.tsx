import Link from 'next/link'

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

function shekels(value: number): string {
  return `₪${value.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function ProductCard({ product }: { product: Product }) {
  const outOfStock = product.stock_quantity === 0
  const thumb =
    Array.isArray(product.images) && typeof product.images[0] === 'string'
      ? (product.images[0] as string)
      : null

  const price = Number(product.kenyon_price ?? 0)
  const old = product.full_price != null ? Number(product.full_price) : null
  const hasDiscount = old != null && old > price
  const discountPct = hasDiscount ? Math.round((1 - price / old) * 100) : 0

  return (
    <div className="group bg-white rounded-xl border border-gray-100 overflow-hidden hover:border-brand-primary hover:shadow-md transition-all">
      <Link
        href={`/product/${product.slug}`}
        className="block aspect-square bg-gray-50 flex items-center justify-center relative overflow-hidden"
      >
        {thumb ? (
          <img
            src={thumb}
            alt={product.name_he}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <span className="text-5xl">📦</span>
        )}
        {hasDiscount && (
          <span className="absolute top-2 start-2 bg-price text-white text-[11px] font-bold px-1.5 py-0.5 rounded">
            {discountPct}%-
          </span>
        )}
        {outOfStock && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
            <span className="text-xs font-semibold text-gray-500 bg-white px-2 py-1 rounded-full border">
              אזל המלאי
            </span>
          </div>
        )}
      </Link>

      <div className="p-3 space-y-1.5">
        {product.category && (
          <Link
            href={`/category/${product.category.slug}`}
            className="block text-xs text-gray-400 hover:text-brand-dark line-clamp-1"
          >
            {product.category.name_he}
          </Link>
        )}

        <Link
          href={`/product/${product.slug}`}
          className="block text-sm font-bold text-link line-clamp-2 leading-snug hover:underline"
        >
          {product.name_he}
        </Link>

        <div className="flex items-baseline gap-2">
          <span className="text-xl font-normal text-heading">{shekels(price)}</span>
          {hasDiscount && old != null && (
            <span className="text-xs text-price-strike line-through">{shekels(old)}</span>
          )}
        </div>

        <Link
          href={`/product/${product.slug}`}
          className="block w-full text-center text-xs font-bold py-1.5 rounded-lg bg-brand-primary text-brand-dark group-hover:bg-brand-primary-hover transition-colors"
        >
          הוסף לעגלה
        </Link>
      </div>
    </div>
  )
}
