import HeaderIcons from '@/components/layout/HeaderIcons'

/**
 * The masthead's left-hand group (RTL): Electro header-v8's icon row, and only
 * that. See HeaderIcons.tsx for what the row holds and what it deliberately
 * does not.
 *
 * WHAT USED TO BE HERE. Until W01 (2026-10-05) this group was the region
 * selector ("בחר אזור", live's `secondary-nav`) followed by a two-icon cluster
 * of heart and cart with the cart's subtotal printed beside it, and the
 * account entry point was kept OUT of the cluster by a test. The row is now
 * Electro's exactly -- wishlist, account, cart -- and the region selector
 * moved to TopBar beside התחברות, so the feature is kept and the cluster is
 * not.
 *
 * NO SEARCH FIELD. Live's masthead carries a 534px search form in this slot
 * and the standing project rule is that there is no search UI anywhere, so the
 * slot is gone rather than hidden. `justify-end` closes the gap it left; the
 * pixel cost is recorded in STATE.md.
 */
export default function MastheadNav() {
  return (
    <div className="flex min-w-0 flex-1 items-center justify-end ps-6">
      <HeaderIcons />
    </div>
  )
}
