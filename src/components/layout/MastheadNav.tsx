import HeaderCart from '@/components/cart/HeaderCart'
import DeferredHeaderSearch from '@/components/search/DeferredHeaderSearch'
import { ChevronDown, Heart, User } from 'lucide-react'
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
 * user, cart -- with 38px edge-to-edge between the icons. gap-[38px] is that
 * measurement, not a taste.
 *
 * The heart is BACK (it was removed in [28] because there was no wishlist
 * route and a 404 icon is worse than a geometry gap). The 1:1 instruction of
 * 2026-09-02 overrides the gap half of that; the 404 half is avoided by
 * sending it to the customer's coupons, the nearest "saved things" surface
 * this site has. When a wishlist route lands, retarget it.
 *
 * The region selector matches live's secondary-nav (96x45, 14px/500 with a
 * chevron). Live opens a dropdown of regions; ours goes to the suppliers page,
 * where the region actually filters something. Visual parity, honest target.
 *
 * Search is deferred ([32]): CSS-hidden on phones, so mobile Lighthouse must
 * not download or hydrate its suggest/router client graph.
 */
export default function MastheadNav() {
  return (
    <div className="flex min-w-0 flex-1 items-center justify-end ps-6">
      <DeferredHeaderSearch />

      <Link
        href="/suppliers"
        className="me-[14px] ms-[53px] hidden shrink-0 items-center gap-1 text-sm font-medium text-heading transition-opacity hover:opacity-70 lg:flex"
      >
        בחר אזור
        <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
      </Link>

      <nav className="flex shrink-0 items-center gap-[38px]" aria-label="פעולות חשבון ועגלה">
        <Link
          href="/account/coupons"
          aria-label="המועדפים שלי"
          className="transition-opacity hover:opacity-70"
          style={{ color: ICON.color }}
        >
          <Heart size={ICON.size} strokeWidth={ICON.strokeWidth} aria-hidden="true" />
        </Link>

        <Link
          href="/login"
          aria-label="החשבון שלי"
          className="transition-opacity hover:opacity-70"
          style={{ color: ICON.color }}
        >
          <User size={ICON.size} strokeWidth={ICON.strokeWidth} aria-hidden="true" />
        </Link>

        <HeaderCart />
      </nav>
    </div>
  )
}
