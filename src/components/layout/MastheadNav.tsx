import HeaderCart from '@/components/cart/HeaderCart'
import HeaderSearch from '@/components/search/HeaderSearch'
import { Heart, User } from 'lucide-react'
import Link from 'next/link'

const ICON = { size: 22, color: 'var(--color-icon)', strokeWidth: 1.8 } as const

/**
 * The masthead's right-hand group: search plus the account and cart icons.
 *
 * Search is mounted here, not in `layout/Header.tsx`, because that file is on
 * the LOCKED_COMPONENTS list and is measured against the live masthead. This
 * component renders inside the same header row and is not locked, so it is the
 * supported way to put search in the header without touching locked geometry.
 *
 * The wrapper grows into the space the logo leaves; the icon row stays
 * `shrink-0` so a long placeholder can never squeeze it.
 */
export default function MastheadNav() {
  return (
    <div className="flex min-w-0 flex-1 items-center justify-end gap-5 ps-6">
      <HeaderSearch />

      <nav className="flex shrink-0 items-center gap-5" aria-label="פעולות חשבון ועגלה">
        {/* No /wishlist page exists in this app; the href came over with the
            masthead markup. Prefetch off so the 404 is not fetched on every
            page view of the site. See the note in SiteFooter.tsx. */}
        <Link
          href="/wishlist"
          prefetch={false}
          aria-label="מועדפים"
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
