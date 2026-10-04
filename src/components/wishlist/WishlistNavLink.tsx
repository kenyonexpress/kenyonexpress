'use client'

import Favorites from '@/components/icons/electro/Favorites'
import { useWishlist } from '@/components/wishlist/WishlistProvider'
import { t } from '@/lib/i18n/messages'
import Link from 'next/link'

/**
 * The header's wishlist icon: Electro header-v8's `.header-icon` with
 * `ec-favorites`, in the 22.7 x 40.45 box src/styles/header-icons.css draws.
 *
 * NO COUNTER. Electro's header-v8 puts a counter on compare and on the cart and
 * not on the wishlist, and the row is held to Electro exactly (W01). The count
 * is still announced: it is in the link's accessible name, where a screen
 * reader gets it without a decorative duplicate.
 */
export default function WishlistNavLink() {
  const wishlist = useWishlist()
  const count = wishlist?.count ?? 0
  const label = count > 0 ? `${t('account.wishlist')}, ${count}` : t('account.wishlist')

  return (
    <div className="header-icon header-icon--wishlist">
      <Link href="/account/wishlist" aria-label={label} className="header-icon__trigger">
        <span className="header-icon__glyph">
          <Favorites />
        </span>
      </Link>
    </div>
  )
}
