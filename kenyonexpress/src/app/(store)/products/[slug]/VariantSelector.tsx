'use client'

import { ShoppingCart } from 'lucide-react'
import { useState } from 'react'

interface Variant {
  id: string
  name_he: string
  price: number | null
  price_modifier: number
  stock_quantity: number | null
  is_active: boolean
  sku: string
}

interface Props {
  basePrice: number | null
  variants: Variant[]
  stock: number | null
  isCoupon: boolean
}

export default function VariantSelector({ basePrice, variants, stock, isCoupon }: Props) {
  const [selected, setSelected] = useState<string | null>(
    variants.length === 1 ? (variants[0]?.id ?? null) : null,
  )

  const variant = variants.find((v) => v.id === selected)
  const effectivePrice =
    variant != null
      ? (variant.price ?? (basePrice ?? 0) + variant.price_modifier)
      : (basePrice ?? 0)
  const effectiveStock = variant?.stock_quantity ?? stock
  const outOfStock = effectiveStock === 0

  return (
    <div className="space-y-4">
      {variants.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2">בחר גרסה</p>
          <div className="flex flex-wrap gap-2">
            {variants.map((v) => (
              <button
                type="button"
                key={v.id}
                onClick={() => setSelected(v.id)}
                disabled={v.stock_quantity === 0}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                  selected === v.id
                    ? 'bg-brand text-white border-brand'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                } ${v.stock_quantity === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                {v.name_he}
                {v.price != null && v.price !== basePrice && (
                  <span className="mr-1 text-xs opacity-80">₪{Number(v.price).toFixed(2)}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {outOfStock ? (
        <div className="text-center py-3 bg-gray-50 rounded-lg text-sm text-gray-500 font-medium border border-gray-200">
          אזל המלאי
        </div>
      ) : (
        <button
          type="button"
          disabled={variants.length > 0 && !selected}
          className="w-full flex items-center justify-center gap-2 bg-brand hover:bg-brand-dark disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-3 text-base transition-colors"
        >
          <ShoppingCart size={18} />
          {isCoupon ? 'רכוש קופון' : 'הוסף לסל'}
          {(variant != null || variants.length === 0) && (
            <span className="text-sm font-normal opacity-90">
              — ₪{Number(effectivePrice).toFixed(2)}
            </span>
          )}
        </button>
      )}
    </div>
  )
}
