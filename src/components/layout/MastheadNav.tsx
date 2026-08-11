import HeaderCart from '@/components/cart/HeaderCart'
import DeferredHeaderSearch from '@/components/search/DeferredHeaderSearch'
import { User } from 'lucide-react'
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
 *
 * The live WP heart → /wishlist was removed in [28]: there is no wishlist
 * route here, and a header icon that 404s is worse than a small geometry gap
 * against the live masthead. Re-add with the feature, not before.
 *
 * Search is deferred ([32]): it is CSS-hidden on phones, so mobile Lighthouse
 * must not download or hydrate its suggest/router client graph.
 */
export default function MastheadNav() {
  return (
    <div className="flex min-w-0 flex-1 items-center justify-end gap-5 ps-6">
      <DeferredHeaderSearch />

      <nav className="flex shrink-0 items-center gap-5" aria-label="פעולות חשבון ועגלה">
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
