'use server'

import { siteUrl } from '@/lib/site-url'
import { wishlistShareUrl } from '@/lib/wishlist/share'
import { getMyWishlist } from '@/server/queries/wishlist'

export async function mintMyWishlistShareLink(): Promise<
  { ok: true; url: string } | { ok: false; error: string }
> {
  const entries = await getMyWishlist()
  if (entries.length === 0) return { ok: false, error: 'אין מוצרים לשתף.' }
  const url = wishlistShareUrl(
    siteUrl(),
    entries.map((entry) => entry.product_id),
  )
  if (!url) return { ok: false, error: 'לא ניתן ליצור קישור כרגע.' }
  return { ok: true, url }
}
