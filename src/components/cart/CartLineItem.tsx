'use client'

import { useCart } from '@/components/cart/CartProvider'
import SmartImage from '@/components/ui/SmartImage'
import { lineQuantityCeiling, shekels, unavailableMessage } from '@/lib/cart/format'
import type { CartViewItem } from '@/lib/cart/types'
import { Minus, Plus, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

export default function CartLineItem({ item }: { item: CartViewItem }) {
  const { updateQuantity, removeItem, isPending } = useCart()
  const [localQty, setLocalQty] = useState(item.quantity)

  useEffect(() => {
    setLocalQty(item.quantity)
  }, [item.quantity])

  // Before this, `+` ran to 99 against any stock level, so the only way to
  // discover there were three left was to press it a fourth time and read the
  // error toast the server sent back.
  const maxQty = lineQuantityCeiling(item)
  const warning = unavailableMessage(item)

  const dec = () => {
    const next = Math.max(1, localQty - 1)
    if (next === localQty) return
    setLocalQty(next)
    void updateQuantity(item.product_id, item.variant_id, next)
  }

  const inc = () => {
    const next = Math.min(maxQty, localQty + 1)
    // At the ceiling `next` equals `localQty`, and firing the write anyway
    // would spend a round trip to be told the quantity it already has.
    if (next === localQty) return
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

        {/* <output>, not a <p role="status">: it carries the same implicit
            role, and it is what this actually is -- a message produced in
            response to the shopper's own action, announced when a quantity
            change turns a line unavailable rather than only read on load. */}
        {warning && <output className="cart-line__warning">{warning}</output>}

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

/**
 * The empty cart, rebuilt to the live page rather than invented.
 *
 * Measured off kenyonexpress.co.il/cart/ with an empty basket: a full-width
 * brand-yellow banner, 49px/300 centred text reading "סל הקניות שלך ריק כרגע.",
 * then a 157x45 grey pill at radius 50 saying "חזור לחנות". What was here
 * before was a bordered white card with an icon and a yellow CTA, which is a
 * perfectly reasonable empty state and is not the one this site has.
 *
 * The colours live in `.cart-empty` and `.cart-empty__cta` in cart-page.css.
 * Naming them here as literals is what the raw-hex gate in tokens.test.ts
 * exists to stop, even in a comment: a hex written down in two places is a hex
 * that will disagree with itself.
 */
export function CartEmptyState() {
  return (
    <>
      <div className="cart-empty">סל הקניות שלך ריק כרגע.</div>
      <p className="cart-empty__actions">
        <Link href="/products" className="cart-empty__cta">
          חזור לחנות
        </Link>
      </p>
    </>
  )
}
