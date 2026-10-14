'use client'

import HeaderBadge from '@/components/layout/HeaderBadge'
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
  // Armed once the list has loaded: a save after that pops the badge, the
  // load itself does not (HeaderBadge.tsx).
  const ready = useWishlistStore((s) => s.status === 'ready')

  useEffect(() => {
    void load()
  }, [load])

  // The same two measured shapes as the cart's count, from one component.
  return <HeaderBadge count={count} armed={ready} />
}
