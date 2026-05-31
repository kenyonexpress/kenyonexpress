import Link from 'next/link'

export type Product = {
  id: string
  slug: string
  name_he: string
  kenyon_price: number | null
  images: unknown
  stock_quantity: number | null
}

export default function ProductCard({ product }: { product: Product }) {
  const outOfStock = product.stock_quantity === 0
  const thumb =
    Array.isArray(product.images) && typeof product.images[0] === 'string'
      ? (product.images[0] as string)
      : null

  return (
    <Link
      href={`/products/${product.slug}`}
      className="block bg-white rounded-xl border border-gray-100 overflow-hidden hover:shadow-md transition-shadow"
    >
      <div className="aspect-square bg-gray-50 flex items-center justify-center relative">
        {thumb ? (
          <img src={thumb} alt={product.name_he} className="w-full h-full object-cover" />
        ) : (
          <span className="text-5xl">📦</span>
        )}
        {outOfStock && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
            <span className="text-xs font-semibold text-gray-500 bg-white px-2 py-1 rounded-full border">
              אזל המלאי
            </span>
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="text-sm font-medium text-gray-800 line-clamp-2 leading-snug">
          {product.name_he}
        </p>
        <p className="text-brand font-bold mt-1.5">
          ₪{Number(product.kenyon_price ?? 0).toFixed(2)}
        </p>
      </div>
    </Link>
  )
}
