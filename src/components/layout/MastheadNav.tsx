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
 * so RTL, reading right to left after the search: region selector, heart,
 * cart -- with 38px edge-to-edge between the icons at lg (the measured
 * breakpoint; phones get gap-4 so 320px keeps zero sideways scroll). gap-nav-gap is that
 * measurement, not a taste.
 *
 * The mega menu displays category items with hover-based dropdowns showing
 * featured content, subcategories, and promo banners. Yellow background per Electro v7.
 */
export default function MastheadNav() {
  return (
    <div className="flex min-w-0 flex-1 items-center justify-between">
      <MegaMenu />

      <nav
        className="flex shrink-0 items-center gap-4 lg:gap-nav-gap ps-6"
        aria-label="פעולות חשבון"
      >
        <Link
          href="/account/wishlist"
          prefetch={false}
          aria-label="המועדפים שלי"
          className="hit-44 -m-1 p-1 transition-opacity hover:opacity-70"
          style={{ color: ICON.color }}
        >
          <EcFavorites size={ICON.size} aria-hidden="true" />
        </Link>

        {/* THE ACCOUNT ICON IS NOT HERE, AND ITS ABSENCE IS THE RULE.
            The cluster is exactly two icons at every breakpoint -- heart then
            cart -- and the account entry point lives in the shell's top-left,
            in exactly one place: TopBar's התחברות. This slot used to hold a
            third <User> link to /login, which made three icons here, two more
            account entry points than the rule allows (this one and the
            handheld one in Header.tsx), and three places to keep in sync.
            Live's own x at 1440 was cart 135, user 223, heart 284; dropping
            the middle one closes to cart 135, heart 223. */}
        <HeaderCart />
      </nav>
    </div>
  )
}
