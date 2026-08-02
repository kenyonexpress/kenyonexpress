'use client'

import { useCart } from '@/components/cart/CartProvider'
import SmartImage from '@/components/ui/SmartImage'
import type { CartViewItem } from '@/lib/cart/types'
import { Check, Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

function shekels(value: number): string {
  return `₪${value.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function CartLineItem({ item }: { item: CartViewItem }) {
  const { updateQuantity, removeItem, isPending } = useCart()
  const [localQty, setLocalQty] = useState(item.quantity)

  useEffect(() => {
    setLocalQty(item.quantity)
  }, [item.quantity])
  const maxQty = 99

  const dec = () => {
    const next = Math.max(1, localQty - 1)
    setLocalQty(next)
    void updateQuantity(item.product_id, item.variant_id, next)
  }

  const inc = () => {
    const next = Math.min(maxQty, localQty + 1)
    setLocalQty(next)
    void updateQuantity(item.product_id, item.variant_id, next)
  }

  const remove = () => {
    void removeItem(item.product_id, item.variant_id)
  }

  return (
    <article className="cart-line">
      <Link href={`/product/${item.slug}`} className="cart-line__thumb">
        {item.image_url ? (
          <SmartImage
            src={item.image_url}
            alt={item.name_he}
            width={100}
            height={100}
            className="h-full w-full object-contain"
            fallbackClassName="h-full w-full"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-400 text-xs">
            אין תמונה
          </div>
        )}
      </Link>

      <div className="cart-line__body">
        <Link href={`/product/${item.slug}`} className="cart-line__name">
          {item.name_he}
        </Link>

        {!item.available && (
          <p className="cart-line__warning">המוצר אינו זמין — הסירו מהעגלה לפני התשלום</p>
        )}

        {item.type === 'coupon' && item.balance_due_at_business > 0 && (
          <p className="cart-line__coupon-note">
            תשלום באתר: {shekels(item.customer_pays_now)} · יתרה בחנות:{' '}
            {shekels(item.balance_due_at_business)}
          </p>
        )}

        <div className="cart-line__footer">
          <div className="cart-line__qty">
            <button
              type="button"
              onClick={dec}
              disabled={localQty <= 1 || isPending}
              aria-label="הפחת כמות"
              className="cart-line__qty-btn"
            >
              <Minus size={14} />
            </button>
            <span className="cart-line__qty-value tabular-nums">{localQty}</span>
            <button
              type="button"
              onClick={inc}
              disabled={localQty >= maxQty || isPending}
              aria-label="הוסף כמות"
              className="cart-line__qty-btn"
            >
              <Plus size={14} />
            </button>
          </div>

          <span className="cart-line__price">{shekels(item.line_total)}</span>

          <button
            type="button"
            onClick={remove}
            disabled={isPending}
            aria-label={`הסר ${item.name_he} מהעגלה`}
            className="cart-line__remove"
          >
            <Trash2 size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </article>
  )
}

export function CartEmptyState() {
  return (
    <div className="cart-empty">
      <ShoppingCart size={48} className="cart-empty__icon" aria-hidden="true" />
      <h2 className="cart-empty__title">העגלה שלך ריקה</h2>
      <p className="cart-empty__text">עדיין לא הוספת מוצרים. גלה את המבצעים שלנו!</p>
      <Link href="/" className="cart-empty__cta">
        <Check size={18} aria-hidden="true" />
        המשך לקניות
      </Link>
    </div>
  )
}
