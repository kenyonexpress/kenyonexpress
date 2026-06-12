import Link from 'next/link'
import { ShoppingCart } from 'lucide-react'

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

/** Values from refs/ke_live_singlefile.html (elementor-9175 jet-listing grid) */
const PRODUCT_NAME = { fontSize: '22px', color: '#0062bd' } as const
const SALE_PRICE = { fontSize: '16px', fontWeight: 700, color: '#C93636' } as const
const STRIKE_PRICE = { fontSize: '14px', fontWeight: 400, color: '#2d2d2d' } as const
const DISCOUNT_BADGE = {
  backgroundColor: '#e00',
  color: '#fff',
  fontSize: '0.857em',
  lineHeight: '2em',
  fontWeight: 700,
  padding: '2px 10px',
  borderRadius: '4px',
} as const
const CART_BTN = {
  width: '40px',
  backgroundColor: '#eaeaea',
  hoverBackgroundColor: '#fed700',
  borderRadius: '200px',
  padding: '10px 11px 10px 10px',
  iconSize: 20,
  iconColor: '#fff',
} as const

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
      <div className="p-3 space-y-1.5">
        {product.category && (
          <Link
            href={`/category/${product.category.slug}`}
            className="block text-[12px] font-normal text-[#768b9e] hover:text-[#333e48] line-clamp-1"
          >
            {product.category.name_he}
          </Link>
        )}

        <Link
          href={`/product/${product.slug}`}
          className="block line-clamp-2 leading-snug hover:underline"
          style={{ fontSize: PRODUCT_NAME.fontSize, color: PRODUCT_NAME.color }}
        >
          {product.name_he}
        </Link>

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
            <span
              className="absolute top-0 start-0 z-[2] flex justify-center text-center"
              dir="ltr"
              style={DISCOUNT_BADGE}
            >
              -{discountPct}%
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

        <div className="flex items-baseline gap-2 flex-wrap">
          {hasDiscount && old != null && (
            <span className="line-through" style={STRIKE_PRICE}>
              {shekels(old)}
            </span>
          )}
          <span style={SALE_PRICE}>{shekels(price)}</span>
        </div>

        <Link
          href={`/product/${product.slug}`}
          className="atc inline-flex items-center justify-center shrink-0 transition-colors group-hover:!bg-[#fed700]"
          style={{
            width: CART_BTN.width,
            backgroundColor: CART_BTN.backgroundColor,
            borderRadius: CART_BTN.borderRadius,
            padding: CART_BTN.padding,
          }}
          aria-label="הוסף לעגלה"
        >
          <ShoppingCart size={CART_BTN.iconSize} color={CART_BTN.iconColor} strokeWidth={2} />
        </Link>
      </div>
    </div>
  )
}
