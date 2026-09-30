import HeaderCart from '@/components/cart/HeaderCart'
import RegionMenu from '@/components/layout/RegionMenu'
import SiteSearch from '@/components/search/SiteSearch'
import WishlistNavCount from '@/components/wishlist/WishlistNavCount'
import { Heart } from 'lucide-react'
import Link from 'next/link'

const ICON = { size: 22, color: 'var(--color-icon)', strokeWidth: 1.8 } as const

/**
 * The masthead's left-hand group (RTL): the region selector and the two-icon
 * cluster -- favorites then cart, which is the whole cluster.
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
 * The heart is BACK (it was removed in [28] because there was no wishlist
 * route and a 404 icon is worse than a geometry gap). The 1:1 instruction of
 * 2026-09-02 overrides the gap half of that; the 404 half is avoided by
 * sending it to the wishlist, which exists now (154 + /account/wishlist).
 *
 * The region selector matches live's secondary-nav (96x45, 14px/500 with a
 * chevron). It is now a real dropdown -- see RegionMenu.tsx. It used to be a
 * flat link to /suppliers, which is the join-us-as-a-supplier marketing page:
 * a control labelled "choose a region" whose target has no regions on it. The
 * seventeen regions it now opens are live's own, read off the rendered page.
 *
 * THE SEARCH FIELD IS BACK IN ITS MEASURED SLOT. Live's masthead carries a
 * 534x41 search pill at x456..x990, right after the logo in reading order. From
 * 04.09 to 30.09 the slot was gone under the no-search-UI rule and
 * `justify-end` closed the gap; STEP 08 (30.09) restored it with
 * `<SiteSearch id="masthead-search">`, the instant-results combobox
 * (components/search/SiteSearch.tsx), first in the DOM so RTL paints it
 * rightmost, next to the logo, with the region selector and the icon cluster
 * following as live has them. `layout/search-ui.test.ts` pins the mount.
 */
export default function MastheadNav() {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-6 ps-4">
      <SiteSearch id="masthead-search" variant="masthead" />

      <RegionMenu />

      <nav
        className="flex shrink-0 items-center gap-4 lg:gap-nav-gap"
        aria-label="פעולות חשבון ועגלה"
      >
        <Link
          href="/wishlist"
          aria-label="המועדפים שלי"
          className="-m-1 p-1 transition-opacity hover:opacity-70"
          style={{ color: ICON.color }}
        >
          <span className="relative block">
            <Heart size={ICON.size} strokeWidth={ICON.strokeWidth} aria-hidden="true" />
            <WishlistNavCount />
          </span>
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
