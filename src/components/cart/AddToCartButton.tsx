'use client'

import { useCart } from '@/components/cart/CartProvider'
import { trackCommerce } from '@/lib/analytics/commerce-client'
import { track } from '@/lib/analytics/tracker'
import { LoaderCircle } from 'lucide-react'
import { useState } from 'react'

type Props = {
  productId: string
  productName: string
  variantId?: string | null
  quantity?: number
  disabled?: boolean
  className?: string
  /**
   * Unit price in AGOROT, for the ad platforms. Optional because several call
   * sites (the deals card's icon button) do not hold it; without it the
   * first-party event still fires and the vendor event is skipped rather than
   * sent with a zero value, which would drag every reported cart average down.
   */
  priceAgorot?: number | null
  /** 'button' = full CTA, 'icon' = circular deals card */
  variant?: 'button' | 'icon'
  children?: React.ReactNode
}

export default function AddToCartButton({
  productId,
  productName,
  variantId = null,
  quantity = 1,
  priceAgorot = null,
  disabled = false,
  className = '',
  variant = 'button',
  children,
}: Props) {
  const { addToCart, isPending } = useCart()
  const [busy, setBusy] = useState(false)

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (disabled || busy || isPending) return
    setBusy(true)
    try {
      await addToCart(productId, variantId, quantity, productName)
      // Emitted after the server accepted the item, not on click: an intent
      // that failed is not an add_to_cart.
      track('add_to_cart', { product_id: productId, quantity, variant_id: variantId })
      // Same moment, same condition. A no-op without consent, because
      // `ThirdPartyTags` has not put either vendor global on the window.
      if (priceAgorot !== null && priceAgorot > 0) {
        trackCommerce('add_to_cart', {
          items: [{ id: productId, name: productName, priceAgorot, quantity }],
          valueAgorot: priceAgorot * quantity,
        })
      }
    } finally {
      setBusy(false)
    }
  }

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={(e) => void handleClick(e)}
        disabled={disabled || busy || isPending}
        aria-label={`הוסף ${productName} לעגלה`}
        className={className}
      >
        {busy || isPending ? <LoaderCircle size={16} className="animate-spin" /> : children}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={(e) => void handleClick(e)}
      disabled={disabled || busy || isPending}
      className={className}
    >
      {busy || isPending ? (
        <>
          <LoaderCircle size={18} className="animate-spin" />
          מוסיף...
        </>
      ) : (
        children
      )}
    </button>
  )
}
