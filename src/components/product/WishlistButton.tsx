'use client'

import { getWishlistSaved, toggleWishlist } from '@/server/actions/reviews'
import { useEffect, useState, useTransition } from 'react'

/**
 * The heart on a product. Client-only state on purpose: the product page is
 * cached for every visitor, so the saved/unsaved answer -- which is per
 * session -- is fetched after paint and never renders on the server.
 */
export default function WishlistButton({ productId }: { productId: string }) {
  const [saved, setSaved] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false
    getWishlistSaved(productId).then((value) => {
      if (!cancelled) setSaved(value)
    })
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
        aria-label={saved ? 'הסר מרשימת המשאלות' : 'הוסף לרשימת המשאלות'}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-xl transition-colors hover:border-price disabled:opacity-50"
      >
        <span aria-hidden="true" className={saved ? 'text-price' : 'text-gray-400'}>
          {saved ? '♥' : '♡'}
        </span>
      </button>
      {message ? (
        <output aria-live="polite" className="text-xs text-price">
          {message}
        </output>
      ) : null}
    </span>
  )
}
