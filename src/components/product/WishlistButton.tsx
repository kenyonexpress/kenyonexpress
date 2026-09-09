'use client'

import WishlistHeart from '@/components/wishlist/WishlistHeart'

/**
 * SUPERSEDED BY `components/wishlist/WishlistHeart.tsx` on 2026-09-09. Kept as
 * a delegating shim rather than removed, because this is the import path the
 * product page carried and a stale import failing at build time is a worse
 * outcome than one extra file.
 *
 * What changed, and why the old shape could not stay:
 *
 *  - It fetched its own saved/unsaved answer per instance. Putting a heart on
 *    the product CARD made that one server action per card, so a category page
 *    fired 24 to paint 24 hearts. `WishlistProvider` reads the set once.
 *  - It was not optimistic: the heart only moved after the round trip.
 *  - It had no signed-out behaviour at all -- it showed an empty heart and
 *    answered a press with "צריך להתחבר". The guest list now lives in
 *    `localStorage` and is merged at login.
 */
export default function WishlistButton({ productId }: { productId: string }) {
  return <WishlistHeart productId={productId} variant="link" />
}
