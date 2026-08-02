'use client'

import { useCart } from '@/components/cart/CartProvider'
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
  /** 'button' = full CTA, 'icon' = circular deals card */
  variant?: 'button' | 'icon'
  children?: React.ReactNode
}

export default function AddToCartButton({
  productId,
  productName,
  variantId = null,
  quantity = 1,
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
