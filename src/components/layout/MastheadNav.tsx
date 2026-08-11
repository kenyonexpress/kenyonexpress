import HeaderCart from '@/components/cart/HeaderCart'
import { User } from 'lucide-react'
import Link from 'next/link'

const ICON = { size: 22, color: 'var(--color-icon)', strokeWidth: 1.8 } as const

/**
 * The masthead's right-hand group: the account and cart icons.
 *
 * NO SEARCH BAR HERE, BY PROJECT RULE, AND AGAINST THE LIVE SITE.
 *
 * The live masthead does carry one — `refs/ke_live_singlefile.html` has
 * `class="navbar-search col"` with `placeholder="חפש מוצרים"` — so this is a
 * deliberate divergence from the visual reference, decided on 2026-08-12: the
 * header is logo plus icons only. It is recorded here because the standing rule
 * is that every visual fact comes from the reference, and the next session to
 * diff this header against it will find search missing and needs to know that
 * was chosen rather than lost.
 *
 * Removing it costs nothing else: `/search` is a real route reached by URL, and
 * `SearchOverlay`/`HeaderSearch` remain available to mount elsewhere.
 *
 * The live WP heart → /wishlist was removed in [28]: there is no wishlist
 * route here, and a header icon that 404s is worse than a small geometry gap
 * against the live masthead. Re-add with the feature, not before. That is why
 * this row is two icons and not the three the rule names.
 */
export default function MastheadNav() {
  return (
    <div className="flex min-w-0 flex-1 items-center justify-end gap-5 ps-6">
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
