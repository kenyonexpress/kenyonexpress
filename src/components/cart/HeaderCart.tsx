'use client'

import CartNavLink from '@/components/cart/CartNavLink'
import MiniCartDropdown from '@/components/cart/MiniCartDropdown'

/**
 * The masthead's cart control: the icon with its counter, and the mini-cart
 * that hangs off it.
 *
 * The two are wrapped together because the panel is positioned against this
 * element. Rendering the dropdown further up the tree (in the layout, beside
 * `CartDrawer`) would leave it anchored to the page rather than to the icon,
 * which is the whole difference between a dropdown and a sheet.
 */
export default function HeaderCart() {
  return (
    <div className="mini-cart">
      <CartNavLink />
      <MiniCartDropdown />
    </div>
  )
}
