import HeaderCart from '@/components/cart/HeaderCart'
import RegionMenu from '@/components/layout/RegionMenu'
import { Heart, User } from 'lucide-react'
import Link from 'next/link'

const ICON = { size: 22, color: 'var(--color-icon)', strokeWidth: 1.8 } as const

/**
 * The masthead's left-hand group (RTL): search, the region selector, and the
 * favorites / account / cart icons, in the live masthead's order.
 *
 * Geometry from refs/ke_live_computed.json at 1440, 2026-09-02, x from left:
 *
 *   cart 135  user 223  heart 284  "בחר אזור" 360..456  search 456..990
 *
 * so RTL, reading right to left after the search: region selector, heart,
 * user, cart -- with 38px edge-to-edge between the icons at lg (the measured
 * breakpoint; phones get gap-4 so 320px keeps zero sideways scroll). gap-[38px] is that
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
 * NO SEARCH FIELD. Live's masthead carries a 534px search form at x456..x990
 * and this component used to render <DeferredHeaderSearch/> in that slot. The
 * standing project rule is that there is no search UI anywhere, so the slot is
 * gone rather than hidden: a CSS-hidden field is still in the DOM, still in the
 * tab order, and still ships its client chunk. `justify-end` closes the gap it
 * left, which is the one place this component knowingly departs from the
 * measured layout. The pixel cost is recorded in STATE.md.
 */
export default function MastheadNav() {
  return (
    <div className="flex min-w-0 flex-1 items-center justify-end ps-6">
      <RegionMenu />

      <nav
        className="flex shrink-0 items-center gap-4 lg:gap-[38px]"
        aria-label="פעולות חשבון ועגלה"
      >
        <Link
          href="/account/wishlist"
          aria-label="המועדפים שלי"
          className="-m-1 p-1 transition-opacity hover:opacity-70"
          style={{ color: ICON.color }}
        >
          <Heart size={ICON.size} strokeWidth={ICON.strokeWidth} aria-hidden="true" />
        </Link>

        <Link
          href="/login"
          aria-label="החשבון שלי"
          className="-m-1 p-1 transition-opacity hover:opacity-70"
          style={{ color: ICON.color }}
        >
          <User size={ICON.size} strokeWidth={ICON.strokeWidth} aria-hidden="true" />
        </Link>

        <HeaderCart />
      </nav>
    </div>
  )
}
