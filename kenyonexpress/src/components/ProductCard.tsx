import Link from 'next/link'

export type Product = {
  id: string
  name: string
  description: string | null
  price_ils: number
  image_url: string | null
  stock_quantity: number
}

export default function ProductCard({ product }: { product: Product }) {
  const outOfStock = product.stock_quantity === 0

  return (
    <Link
      href={`/products/${product.id}`}
      className="block bg-white rounded-xl border border-gray-100 overflow-hidden hover:shadow-md transition-shadow"
    >
      <div className="aspect-square bg-gray-50 flex items-center justify-center relative">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full h-full object-cover"
          />
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
          {product.name}
        </p>
        <p className="text-brand font-bold mt-1.5">
          ₪{Number(product.price_ils).toFixed(2)}
        </p>
      </div>
    </Link>
  )
}
