'use client'

import { useCart } from '@/components/cart/CartProvider'
import SmartImage from '@/components/ui/SmartImage'
import { lineQuantityCeiling, unavailableMessage } from '@/lib/cart/format'
import type { CartViewItem } from '@/lib/cart/types'
import { t } from '@/lib/i18n/messages'
import { shekelsRounded } from '@/lib/money-format'
import { Minus, Plus, X } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

/**
 * One row of Electro's `table.shop_table.cart`, in its column order: remove,
 * thumbnail, product, price, quantity, subtotal. In RTL the table runs right
 * to left, so remove is the far-right cell, as Electro's is the far-left one.
 *
 * Below 768 the same cells stack, the WooCommerce small-screen pattern Electro
 * ships: thead hidden, each cell a full-width row labelled from `data-title`,
 * thumbnail hidden. That is why the labels live on the cells and not in the
 * markup.
 *
 * Prices are whole shekels (`shekelsRounded`). The agorot stay integer in the
 * store; only the display rounds.
 */
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
    <tr className="cart-row">
      <td className="cart-row__remove">
        <button
          type="button"
          aria-label={`הסר ${item.name_he} מהעגלה`}
          onClick={remove}
          disabled={isPending}
          className="cart-row__remove-btn"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </td>

      <td className="cart-row__thumb">
        <Link href={`/product/${item.slug}`} tabIndex={-1} aria-hidden="true">
          {item.image_url ? (
            <SmartImage
              src={item.image_url}
              alt=""
              width={92}
              height={92}
              className="h-full w-full object-contain"
              fallbackClassName="h-full w-full"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center bg-surface-hover text-icon-empty text-xs">
              אין תמונה
            </span>
          )}
        </Link>
      </td>

      <td className="cart-row__name" data-title={t('cartPage.colProduct')}>
        <Link href={`/product/${item.slug}`} className="cart-row__name-link">
          {item.name_he}
        </Link>

        {/* <output>, not a <p role="status">: it carries the same implicit
            role, and it is what this actually is -- a message produced in
            response to the shopper's own action, announced when a quantity
            change turns a line unavailable rather than only read on load. */}
        {warning && <output className="cart-row__warning">{warning}</output>}

        {item.type === 'coupon' && item.balance_due_at_business > 0 && (
          <p className="cart-row__coupon-note">
            תשלום באתר: {shekelsRounded(item.customer_pays_now)} · יתרה בחנות:{' '}
            {shekelsRounded(item.balance_due_at_business)}
          </p>
        )}
      </td>

      <td className="cart-row__price tabular-nums" data-title={t('cartPage.colPrice')}>
        {shekelsRounded(item.unit_price)}
      </td>

      <td className="cart-row__qty" data-title={t('cartPage.colQuantity')}>
        <div className="cart-qty">
          {/* Minus first: in RTL that puts it on the right, the mirror of
              the LTR stepper where minus sits on the left. */}
          <button
            type="button"
            aria-label="הפחת כמות"
            onClick={dec}
            disabled={localQty <= 1 || isPending}
            className="cart-qty__btn"
          >
            <Minus size={14} aria-hidden="true" />
          </button>
          <span className="cart-qty__value tabular-nums">{localQty}</span>
          <button
            type="button"
            aria-label="הוסף כמות"
            onClick={inc}
            disabled={localQty >= maxQty || isPending}
            className="cart-qty__btn"
          >
            <Plus size={14} aria-hidden="true" />
          </button>
        </div>
      </td>

      <td className="cart-row__subtotal tabular-nums" data-title={t('cartPage.colSubtotal')}>
        {shekelsRounded(item.line_total)}
      </td>
    </tr>
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
