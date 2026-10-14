'use client'

import { useWishlist } from '@/components/wishlist/WishlistProvider'
import { Heart } from 'lucide-react'
import { useEffect, useState } from 'react'

/**
 * The heart on a product card: a small round overlay in the image corner.
 *
 * Ported from the production branch (closeout L10, row 6). Only the card
 * shape came across; the product page keeps its own `WishlistButton`.
 *
 * AN OVERLAY THAT TAKES NO LAYOUT SPACE, deliberately. The card's geometry is
 * measured against a reference, so the heart is positioned over the image and
 * moves nothing. It is a button, never a link: saving is a state change, and
 * a signed-out press saves to this browser instead of sending the shopper to
 * a login page.
 */
export default function WishlistHeart({
  productId,
  productName,
  className = '',
}: {
  productId: string
  /** Named in the aria-label: a page of hearts otherwise reads as one control. */
  productName?: string
  className?: string
}) {
  const wishlist = useWishlist()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const saved = wishlist?.isSaved(productId) ?? false

  // The refusal clears itself. It is announced in a live region, and a message
  // that stays put reads as the control's permanent state to a screen reader.
  useEffect(() => {
    if (!error) return
    const id = setTimeout(() => setError(null), 6000)
    return () => clearTimeout(id)
  }, [error])

  // A card rendered outside the storefront layout has no provider above it.
  // A heart that cannot save is worse than no heart.
  if (!wishlist) return null

  async function onToggle() {
    if (!wishlist || busy) return
    setError(null)
    setBusy(true)
    try {
      const result = await wishlist.toggle(productId)
      if (!result.ok) setError(result.error ?? 'הפעולה נכשלה. נסו שוב.')
    } finally {
      setBusy(false)
    }
  }

  const label = saved ? 'הסר ממועדפים' : 'הוסף למועדפים'
  const ariaLabel = productName ? `${label}: ${productName}` : label

  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        disabled={busy}
        aria-pressed={saved}
        aria-label={ariaLabel}
        // z-10 clears the image link beneath it. Without it the overlay is
        // inside the card's image <Link> hit area and a press navigates. It
        // also has to clear `.p_con__badge` (z-index 2), which sits at the
        // OPPOSITE inline edge -- `start` here, `inset-inline-end` there -- so
        // the discount percentage and the heart never overlap in either
        // direction.
        className={`absolute top-1 start-1 z-10 grid size-touch-min place-items-center rounded-full text-icon transition-opacity hover:opacity-70 disabled:opacity-50 ${className}`}
      >
        <Heart
          size={18}
          strokeWidth={1.8}
          aria-hidden="true"
          className={saved ? 'fill-current text-price' : ''}
        />
      </button>
      <Message error={error} />
    </>
  )
}

function Message({ error }: { error: string | null }) {
  return (
    <output aria-live="polite" className={error ? 'text-nano text-price' : 'sr-only'}>
      {error ?? ''}
    </output>
  )
}
