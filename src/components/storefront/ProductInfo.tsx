'use client'

import { useCart } from '@/components/cart/CartProvider'
import WhatsAppShareButton from '@/components/shared/WhatsAppShareButton'
import { Check, Minus, Plus, ShoppingCart } from 'lucide-react'
import { useState } from 'react'

interface Variant {
  id: string
  name_he: string
  price: number | null
  price_modifier: number
  stock_quantity: number | null
  sku: string
}

interface Attribute {
  label: string
  value: string
}

interface Props {
  productId: string
  name: string
  nameEn: string | null
  basePrice: number
  oldPrice: number | null
  baseStock: number | null
  sku: string | null
  description: string | null
  attributes: Attribute[]
  variants: Variant[]
  isCoupon: boolean
}

function shekels(value: number): string {
  return `₪${value.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function ProductInfo({
  productId,
  name,
  nameEn,
  basePrice,
  oldPrice,
  baseStock,
  sku,
  description,
  attributes,
  variants,
  isCoupon,
}: Props) {
  const { addToCart, isPending } = useCart()
  const [selected, setSelected] = useState<string | null>(
    variants.length === 1 ? (variants[0]?.id ?? null) : null,
  )
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)

  const variant = variants.find((v) => v.id === selected) ?? null
  const price = variant != null ? (variant.price ?? basePrice + variant.price_modifier) : basePrice
  const stock = variant?.stock_quantity ?? baseStock
  const outOfStock = stock === 0
  const effectiveSku = variant?.sku ?? sku
  const needsVariant = variants.length > 0 && !selected

  const hasDiscount = oldPrice != null && oldPrice > price
  const discountPct = hasDiscount ? Math.round((1 - price / oldPrice) * 100) : 0
  const maxQty = stock != null && stock > 0 ? stock : 99

  const dec = () => setQty((q) => Math.max(1, q - 1))
  const inc = () => setQty((q) => Math.min(maxQty, q + 1))

  const handleAddToCart = async () => {
    if (outOfStock || needsVariant) return
    await addToCart(productId, selected, qty, name)
    setAdded(true)
    setTimeout(() => setAdded(false), 2000)
  }

  return (
    <div className="space-y-5">
      <p
        className={`inline-flex items-center gap-1.5 text-sm font-semibold ${
          outOfStock ? 'text-gray-500' : 'text-success'
        }`}
      >
        <span
          className={`w-2 h-2 rounded-full ${outOfStock ? 'bg-gray-400' : 'bg-success'}`}
          aria-hidden="true"
        />
        {outOfStock ? 'אזל מהמלאי' : 'במלאי'}
      </p>

      <div>
        <h1 className="text-2xl font-black text-brand-dark leading-snug">{name}</h1>
        {nameEn && (
          <p className="text-sm text-gray-400 mt-1" dir="ltr">
            {nameEn}
          </p>
        )}
      </div>

      <div className="flex items-end gap-3 flex-wrap">
        <span className="text-3xl font-black text-price">{shekels(price)}</span>
        {hasDiscount && (
          <>
            <span className="text-lg text-price-strike line-through font-medium">
              {shekels(oldPrice)}
            </span>
            <span className="text-sm font-bold text-white bg-price px-2 py-0.5 rounded-md">
              {discountPct}%-
            </span>
          </>
        )}
      </div>

      {isCoupon && (
        <div className="bg-brand-accent border border-brand-primary/40 rounded-lg p-3 text-sm">
          <p className="font-bold text-brand-dark">ניתן לרכישה כקופון</p>
          <p className="text-gray-600 mt-0.5">
            שלם {shekels(price * 0.1)} עכשיו (10%) ואת השאר בחנות
          </p>
        </div>
      )}

      {attributes.length > 0 && (
        <ul className="text-sm text-gray-600 space-y-1.5 border-y border-gray-100 py-4">
          {attributes.map((attr) => (
            <li key={attr.label} className="flex gap-2">
              <span className="text-gray-400 min-w-24">{attr.label}:</span>
              <span className="font-medium text-gray-800">{attr.value}</span>
            </li>
          ))}
        </ul>
      )}

      {description && (
        <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{description}</p>
      )}

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
                className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
                  selected === v.id
                    ? 'bg-brand-dark text-white border-brand-dark'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-brand-dark'
                } ${v.stock_quantity === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                {v.name_he}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-stretch gap-3 pt-1">
        <div className="flex items-center border border-gray-300 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={dec}
            disabled={qty <= 1 || outOfStock}
            aria-label="הפחת כמות"
            className="w-11 h-12 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-30"
          >
            <Minus size={16} aria-hidden="true" />
          </button>
          <span
            className="w-12 text-center font-bold text-brand-dark tabular-nums"
            aria-live="polite"
          >
            {qty}
          </span>
          <button
            type="button"
            onClick={inc}
            disabled={qty >= maxQty || outOfStock}
            aria-label="הוסף כמות"
            className="w-11 h-12 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-30"
          >
            <Plus size={16} aria-hidden="true" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => void handleAddToCart()}
          disabled={outOfStock || needsVariant || isPending}
          aria-label={
            outOfStock ? 'אזל מהמלאי' : isCoupon ? `רכוש קופון ${name}` : `הוסף ${name} לסל`
          }
          className="flex-1 flex items-center justify-center gap-2 bg-brand-primary hover:bg-brand-primary-hover text-brand-dark font-bold rounded-xl h-12 text-base transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {added ? (
            <>
              <Check size={20} aria-hidden="true" />
              נוסף לסל
            </>
          ) : (
            <>
              <ShoppingCart size={20} aria-hidden="true" />
              {outOfStock ? 'אזל מהמלאי' : isCoupon ? 'רכוש קופון' : 'הוסף לסל'}
            </>
          )}
        </button>
      </div>

      <div className="flex items-center justify-between gap-3">
        {effectiveSku ? (
          <p className="text-xs text-gray-400">
            מק"ט: <span dir="ltr">{effectiveSku}</span>
          </p>
        ) : (
          <span />
        )}
        <WhatsAppShareButton
          message={`מצאתי משהו שווה ב-KenyonExpress: ${name} ב-${shekels(price)}`}
          appendCurrentUrl
        />
      </div>
    </div>
  )
}
