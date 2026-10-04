import HeaderCart from '@/components/cart/HeaderCart'
import AccountMenu from '@/components/layout/AccountMenu'
import WishlistNavLink from '@/components/wishlist/WishlistNavLink'
import { t } from '@/lib/i18n/messages'

/**
 * The header icon row: Electro header-v8's `div.header-icons`, exactly, and
 * the ONE place it is rendered -- both the handheld header and the masthead
 * mount this component, so the two cannot drift.
 *
 * THREE ITEMS, IN THIS DOM ORDER, AND NOTHING ELSE: wishlist, account, cart.
 * In an RTL flex row the first child renders rightmost, so reading from the
 * logo outward that is wishlist, then account, then the cart hard against the
 * left edge -- the mirror of Electro's compare, wishlist, user, cart with the
 * cart hard against the right. Compare is not here because this site has no
 * compare feature, and an icon that opens nothing is worse than a gap.
 *
 * WHAT IS DELIBERATELY NOT HERE (W01, 2026-10-05):
 *
 *   - the cart total price. Electro renders `.cart-items-total-price` beside
 *     the bag; this row never does. The count is in the yellow counter and
 *     the sum is in the mini-cart.
 *   - the region picker. It was the masthead's `secondary-nav` beside this
 *     cluster; it now lives in TopBar beside התחברות, where the feature is
 *     kept and the icon row is Electro's alone.
 *   - a counter on the wishlist. Electro's header-v8 counters are on compare
 *     and cart only.
 *
 * Geometry: src/styles/header-icons.css; provenance: refs/electro-header-icons.json.
 */
export default function HeaderIcons() {
  return (
    <nav className="header-icons" aria-label={t('nav.headerActions')}>
      <WishlistNavLink />
      <AccountMenu />
      <HeaderCart />
    </nav>
  )
}
