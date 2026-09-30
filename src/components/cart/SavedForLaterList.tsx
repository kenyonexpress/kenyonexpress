'use client'

import { useCart } from '@/components/cart/CartProvider'
import { useSavedForLater } from '@/components/cart/SavedForLaterProvider'
import SmartImage from '@/components/ui/SmartImage'
import type { SavedItem } from '@/lib/cart/saved-for-later'
import { shekels } from '@/lib/money-format'
import { Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

/**
 * The rows a shopper has parked, under the cart's own lines.
 *
 * "החזר לעגלה" goes through the real `addToCart`: the product is re-read,
 * re-priced and refused if it is gone, exactly like any other add. The row
 * leaves the list only when the server took the item (`addToCart` resolves
 * to whether it did), so a product that has since been delisted stays parked
 * with the error toast beside it rather than vanishing from both places.
 *
 * Renders nothing before hydration and nothing when empty. An empty heading
 * with no rows under it is a promise of a feature the shopper has not used.
 */
export default function SavedForLaterList() {
  const { items, hydrated, discard } = useSavedForLater()
  if (!hydrated || items.length === 0) return null

  return (
    <section className="cart-saved" aria-labelledby="cart-saved-heading" data-testid="cart-saved">
      <h2 id="cart-saved-heading" className="cart-saved__title">
        נשמר לאחר כך ({items.length})
      </h2>
      <ul className="cart-saved__list">
        {items.map((item) => (
          <SavedRow
            key={`${item.product_id}::${item.variant_id ?? 'null'}`}
            item={item}
            onDiscard={() => discard(item.product_id, item.variant_id)}
          />
        ))}
      </ul>
    </section>
  )
}

function SavedRow({ item, onDiscard }: { item: SavedItem; onDiscard: () => void }) {
  const { addToCart, isPending } = useCart()
  const { discard } = useSavedForLater()
  const [busy, setBusy] = useState(false)

  const restore = async () => {
    setBusy(true)
    try {
      const taken = await addToCart(item.product_id, item.variant_id, item.quantity, item.name_he)
      if (taken) discard(item.product_id, item.variant_id)
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="cart-saved__row">
      <Link href={`/product/${item.slug}`} className="cart-saved__thumb">
        {item.image_url ? (
          <SmartImage
            src={item.image_url}
            alt={item.name_he}
            width={64}
            height={64}
            className="h-full w-full object-contain"
            fallbackClassName="h-full w-full"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-surface-hover text-icon-empty text-xs">
            אין תמונה
          </div>
        )}
      </Link>
      <div className="cart-saved__body">
        <Link href={`/product/${item.slug}`} className="cart-saved__name">
          {item.name_he}
        </Link>
        <span className="cart-saved__meta tabular-nums">
          {item.quantity > 1 ? `${item.quantity} × ` : ''}
          {shekels(item.unit_price)}
        </span>
      </div>
      <div className="cart-saved__actions">
        <button
          type="button"
          className="cart-saved__restore"
          onClick={() => void restore()}
          disabled={busy || isPending}
        >
          {busy ? 'מוסיף...' : 'החזר לעגלה'}
        </button>
        <button
          type="button"
          className="cart-saved__discard"
          onClick={onDiscard}
          disabled={busy}
          aria-label={`הסר ${item.name_he} מהרשימה`}
        >
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </div>
    </li>
  )
}
