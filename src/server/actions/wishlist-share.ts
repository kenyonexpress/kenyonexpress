'use server'

import { t } from '@/lib/i18n/messages'
import { withActionContext } from '@/lib/observability/action-context'
import { siteUrl } from '@/lib/site-url'
import { createClient } from '@/lib/supabase/server'
import { wishlistShareUrl } from '@/lib/wishlist/share'
import { getMyWishlist } from '@/server/queries/wishlist'

export type WishlistShareResult = { ok: true; url: string } | { ok: false; error: string }

/**
 * A signed-in customer's own wishlist, as a share link.
 *
 * The session is checked HERE and not left to `getMyWishlist`, which answers an
 * empty list for a signed-out visitor: that would report "nothing to share" to
 * somebody who is simply not signed in, and it would leave this action with no
 * guard of its own for the authorization inventory to see.
 */
async function runMintMyWishlistShareLink(): Promise<WishlistShareResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: t('wishlistShare.signIn') }

  const entries = await getMyWishlist()
  if (entries.length === 0) return { ok: false, error: t('wishlistShare.empty') }
  const url = wishlistShareUrl(
    siteUrl(),
    entries.map((entry) => entry.product_id),
  )
  if (!url) return { ok: false, error: t('wishlistShare.failed') }
  return { ok: true, url }
}

export async function mintMyWishlistShareLink(): Promise<WishlistShareResult> {
  return withActionContext('wishlist.mint_share_link', () => runMintMyWishlistShareLink())
}
