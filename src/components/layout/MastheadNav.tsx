import HeaderCart from '@/components/cart/HeaderCart'
import { EcFavorites } from '@/components/icons/electro-icons'
import MegaMenu from '@/components/layout/MegaMenu'
import Link from 'next/link'

const ICON = { size: 22, color: 'var(--color-icon)', strokeWidth: 1.8 } as const

/**
 * The masthead's navigation structure (RTL): mega menu on the left, icons on the right.
 *
 * Geometry from refs/ke_live_computed.json at 1440, 2026-09-02, x from left:
 *
 *   cart 135  user 223  heart 284  "בחר אזור" 360..456  search 456..990
 *
 * C137: three icons now (wishlist, account, cart), 20px apart. At the old
 * 38px nav-gap the third icon pushed the cart 4px past the 1440 viewport
 * edge (scrollWidth 1452), so the cluster closes up to fit beside the menu.
 *
 * The mega menu displays category items with hover-based dropdowns showing
 * featured content, subcategories, and promo banners. Yellow background per Electro v7.
 */
export default function MastheadNav() {
  return (
    <div className="flex min-w-0 flex-1 items-center justify-between">
      <MegaMenu />

      <nav className="flex shrink-0 items-center gap-5 ps-6" aria-label="פעולות חשבון">
        <Link
          href="/account/wishlist"
          prefetch={false}
          aria-label="המועדפים שלי"
          className="hit-44 -m-1 p-1 transition-opacity hover:opacity-70"
          style={{ color: ICON.color }}
        >
          <EcFavorites size={ICON.size} aria-hidden="true" />
        </Link>

        {/* C137: HeaderCart renders the account icon and then the cart, so
            this cluster reads wishlist / account / cart (RTL, right to left). */}
        <HeaderCart />
      </nav>
    </div>
  )
}
