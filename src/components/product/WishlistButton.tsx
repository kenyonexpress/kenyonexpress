'use client'

import { getWishlistSaved, toggleWishlist } from '@/server/actions/reviews'
import { useEffect, useState, useTransition } from 'react'

/**
 * The heart on a product. Client-only state on purpose: the product page is
 * cached for every visitor, so the saved/unsaved answer -- which is per
 * session -- is fetched after paint and never renders on the server.
 */
export default function WishlistButton({
  productId,
  variant = 'icon',
}: {
  productId: string
  /**
   * `icon`: the 44px round heart for cards and grids. `inline`: heart plus a
   * word, sized to sit in the product page's tag line without changing its
   * measured height.
   */
  variant?: 'icon' | 'inline'
}) {
  const [saved, setSaved] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false
    // A failed read (offline, action error) leaves the heart unsaved rather
    // than surfacing as an unhandled rejection.
    getWishlistSaved(productId)
      .then((value) => {
        if (!cancelled) setSaved(value)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [productId])

  function onToggle() {
    setMessage(null)
    startTransition(async () => {
      const result = await toggleWishlist(productId)
      if (result.ok) {
        setSaved(result.saved === true)
      } else {
        setMessage(result.error ?? 'הפעולה נכשלה.')
      }
    })
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={onToggle}
        disabled={isPending}
        aria-pressed={saved}
        aria-label={
          // The inline variant shows a word, and its accessible name has to
          // start with that word (WCAG 2.5.3, axe label-content-name-mismatch).
          variant === 'inline'
            ? saved
              ? 'נשמר, הסר מרשימת המשאלות'
              : 'שמירה, הוסף לרשימת המשאלות'
            : saved
              ? 'הסר מרשימת המשאלות'
              : 'הוסף לרשימת המשאלות'
        }
        className={
          variant === 'inline'
            ? 'inline-flex items-center gap-1.5 text-sm font-semibold text-heading transition-colors hover:text-price disabled:opacity-50'
            : 'inline-flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-xl transition-colors hover:border-price disabled:opacity-50'
        }
      >
        <span aria-hidden="true" className={saved ? 'text-price' : 'text-gray-400'}>
          {saved ? '♥' : '♡'}
        </span>
        {variant === 'inline' && <span aria-hidden="true">{saved ? 'נשמר' : 'שמירה'}</span>}
      </button>
      {message ? (
        <output aria-live="polite" className="text-xs text-price">
          {message}
        </output>
      ) : null}
    </span>
  )
}
