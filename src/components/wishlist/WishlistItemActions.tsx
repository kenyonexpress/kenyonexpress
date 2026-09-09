'use client'

import { useWishlist } from '@/components/wishlist/WishlistProvider'
import { moveWishlistItemToCart } from '@/server/actions/wishlist'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

/**
 * The two things a saved product is for: buy it, or stop saving it.
 *
 * MOVE-TO-CART IS ONE SERVER ROUND TRIP, not an add followed by a remove from
 * here. Splitting it across two actions would mean a customer who navigates
 * between them ends up with the product in both places or in neither, and the
 * component would have to decide which half to retry. `moveWishlistItemToCart`
 * adds first and removes second inside one action, so a refused add (out of
 * stock, delisted) is a clean no-op that keeps the save.
 *
 * THE REMOVE IS OPTIMISTIC, THE MOVE IS NOT, and the difference is what each
 * one can fail on. A remove can only fail on the network -- the row is the
 * caller's own -- so painting it gone immediately is almost always right and
 * the provider puts it back if the server refuses. A move can fail on stock,
 * price or availability, which are the answers the customer actually needs; a
 * card that vanishes and reappears with an error is worse than a spinner.
 */
export default function WishlistItemActions({
  productId,
  productName,
  canAddToCart,
}: {
  productId: string
  productName: string
  /** False for a product with no price or no stock: the move would be refused. */
  canAddToCart: boolean
}) {
  const wishlist = useWishlist()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function onMove() {
    setError(null)
    startTransition(async () => {
      const result = await moveWishlistItemToCart(productId)
      if (!result.ok) {
        setError(result.error ?? 'הפעולה נכשלה. נסו שוב.')
        return
      }
      // The provider holds the count the header badge reads; the row itself is
      // server-rendered, so the list needs the refresh to drop it.
      void wishlist?.remove(productId)
      router.refresh()
    })
  }

  function onRemove() {
    setError(null)
    startTransition(async () => {
      const result = await wishlist?.remove(productId)
      if (result && !result.ok) {
        setError(result.error ?? 'ההסרה נכשלה. נסו שוב.')
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onMove}
        disabled={isPending || !canAddToCart}
        aria-label={`העבר לעגלה: ${productName}`}
        className="rounded-lg bg-brand-primary px-3 py-2 text-sm font-semibold text-brand-dark transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {canAddToCart ? 'העבר לעגלה' : 'אזל מהמלאי'}
      </button>
      <button
        type="button"
        onClick={onRemove}
        disabled={isPending}
        aria-label={`הסר ממועדפים: ${productName}`}
        className="rounded-lg border border-border-alt px-3 py-2 text-sm text-muted transition-colors hover:text-heading disabled:opacity-50"
      >
        הסר
      </button>
      <output aria-live="polite" className={error ? 'text-xs text-price' : 'sr-only'}>
        {error ?? ''}
      </output>
    </div>
  )
}
