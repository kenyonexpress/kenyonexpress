'use client'

import { useWishlist } from '@/components/wishlist/WishlistProvider'
import { Heart } from 'lucide-react'
import { useEffect, useState } from 'react'

/**
 * The heart, in the two shapes live uses it in.
 *
 *   card  a small round overlay in the product card's image corner
 *   link  the PDP's link-style row, measured on live at ~13px with the label
 *         `הוסף למועדפים` (docs/coupon-page-measured.md via ARCHITECTURE-WISHLIST)
 *
 * BOTH SHAPES ARE ONE COMPONENT because the behaviour is the whole component:
 * optimistic toggle, a rolled-back failure, an accessible pressed state and a
 * live region for the refusal. Two copies would drift on exactly those.
 *
 * `variant="card"` IS AN OVERLAY AND TAKES NO LAYOUT SPACE, deliberately. The
 * card's geometry is measured against the live site and the pixel gate has
 * about a third of a percent of headroom at 380 -- and, since the live
 * reference was lost, cannot currently be re-measured at all
 * (docs/PARITY-REFERENCE.md). An absolutely positioned control cannot move any
 * other element, so it is the only addition to this card that is safe to make
 * without the gate to check it.
 */

type Variant = 'card' | 'link'

export default function WishlistHeart({
  productId,
  productName,
  variant = 'card',
  className = '',
}: {
  productId: string
  /** Named in the aria-label: a page of hearts otherwise reads as one control. */
  productName?: string
  variant?: Variant
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

  if (variant === 'link') {
    return (
      <span className={`inline-flex flex-col items-start gap-1 ${className}`}>
        <button
          type="button"
          onClick={onToggle}
          disabled={busy}
          aria-pressed={saved}
          aria-label={ariaLabel}
          className="inline-flex items-center gap-2 text-xs text-heading underline-offset-4 transition-opacity hover:underline disabled:opacity-50"
        >
          <Heart
            size={16}
            strokeWidth={1.8}
            aria-hidden="true"
            className={saved ? 'fill-current text-price' : ''}
          />
          {label}
        </button>
        <Message error={error} />
      </span>
    )
  }

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
