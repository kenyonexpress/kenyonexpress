'use client'

import { useCart } from '@/components/cart/CartProvider'
import { Check, LoaderCircle } from '@/components/icons'
import { trackCommerce } from '@/lib/analytics/commerce-client'
import { track } from '@/lib/analytics/tracker'
import { useEffect, useRef, useState } from 'react'

/**
 * How long `addedLabel` stays in the button before it reads its children
 * again. Long enough to be read, short enough that a second add does not
 * look ignored.
 */
export const ADDED_CONFIRMATION_MS = 1800

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
  /**
   * Confirmation copy shown in place of `children` for ADDED_CONFIRMATION_MS
   * after the server ACCEPTED the item (UX08, the deal of the day). While it
   * shows, the button carries `data-added` so the caller can restyle it with
   * `data-added:` variants, and `addedClassName` is appended for a keyframe.
   * A refusal never shows it: the store's error toast is the only feedback
   * there, and an "added" that was not is the same lie as the analytics bug
   * below. Without this prop the button is unchanged.
   */
  addedLabel?: string
  /** Classes appended while `data-added` is set (the pop keyframe). */
  addedClassName?: string
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
  addedLabel,
  addedClassName,
  children,
}: Props) {
  const { addToCart, isPending } = useCart()
  const [busy, setBusy] = useState(false)
  const [added, setAdded] = useState(false)
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // The confirmation outlives the click; the timer must not outlive the button.
  useEffect(
    () => () => {
      if (addedTimer.current) clearTimeout(addedTimer.current)
    },
    [],
  )

  const confirm = () => {
    if (!addedLabel) return
    if (addedTimer.current) clearTimeout(addedTimer.current)
    setAdded(true)
    addedTimer.current = setTimeout(() => setAdded(false), ADDED_CONFIRMATION_MS)
  }

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (disabled || busy || isPending) return
    setBusy(true)
    try {
      // Emitted after the server ACCEPTED the item, not merely after the round
      // trip returned: an intent that failed is not an add_to_cart. The early
      // return is what makes that comment true — the store resolves for a
      // refusal too, so awaiting it alone counted every rejected id as a sale's
      // worth of intent. The deals grid on the home page refuses all 32.
      const accepted = await addToCart(productId, variantId, quantity, productName)
      if (!accepted) return
      confirm()
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

  const showAdded = added && !!addedLabel
  const classes = showAdded && addedClassName ? `${className} ${addedClassName}` : className
  const stateProps = { 'data-added': showAdded ? '' : undefined, className: classes }

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={(e) => void handleClick(e)}
        disabled={disabled || busy || isPending}
        aria-label={`הוסף ${productName} לעגלה`}
        {...stateProps}
      >
        {busy || isPending ? (
          <LoaderCircle size={16} className="animate-spin" />
        ) : showAdded ? (
          <Check size={16} aria-hidden="true" />
        ) : (
          children
        )}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={(e) => void handleClick(e)}
      disabled={disabled || busy || isPending}
      {...stateProps}
    >
      {busy || isPending ? (
        <>
          <LoaderCircle size={18} className="animate-spin" />
          מוסיף...
        </>
      ) : showAdded ? (
        <>
          <Check size={18} aria-hidden="true" />
          {addedLabel}
        </>
      ) : (
        children
      )}
    </button>
  )
}
