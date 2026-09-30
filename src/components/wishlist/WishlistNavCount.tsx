'use client'

import { useWishlistCount, useWishlistStore } from '@/lib/wishlist/client-store'
import { useEffect } from 'react'

/**
 * The count on the masthead heart, from the same store every heart on the
 * page writes to, so saving on a card and the badge agree with no second
 * read. Renders NOTHING until the store has a non-zero answer: the server
 * HTML carries no badge (the count is per session and the shell is cached),
 * a signed-out visitor never sees one, and the pixel gate, which shoots
 * signed out, sees the same masthead as before.
 */
export default function WishlistNavCount() {
  const count = useWishlistCount()
  const load = useWishlistStore((s) => s.load)

  useEffect(() => {
    void load()
  }, [load])

  if (count === 0) return null
  return (
    <span
      className="absolute -top-1.5 -start-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-primary px-1 text-nano font-bold text-brand-dark"
      aria-hidden="true"
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}
