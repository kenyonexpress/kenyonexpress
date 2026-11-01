'use client'

import CartNavLink from '@/components/cart/CartNavLink'
import MiniCartDropdown from '@/components/cart/MiniCartDropdown'
import { EcUser } from '@/components/icons/electro-icons'
import Link from 'next/link'
import { Suspense } from 'react'

/**
 * The masthead's cart control: the icon with its counter, and the mini-cart
 * that hangs off it.
 *
 * The two are wrapped together because the panel is positioned against this
 * element. Rendering the dropdown further up the tree (in the layout, beside
 * `CartDrawer`) would leave it anchored to the page rather than to the icon,
 * which is the whole difference between a dropdown and a sheet.
 */
/*
 * C137 HEADER LOCK (decision 02.11.2026): the cluster is three icons,
 * wishlist / account / cart, at every breakpoint. The account icon is rendered
 * here, immediately before the cart, because both clusters that mount this
 * component (the handheld row in layout/Header.tsx and MastheadNav) already
 * place the heart first; Header.tsx is a locked file, so this is the one
 * place both clusters gain the account icon without editing it.
 */
export default function HeaderCart() {
  return (
    <>
      <Link
        href="/account"
        prefetch={false}
        aria-label="החשבון שלי"
        data-header-account=""
        className="hit-44 -m-1 grid place-items-center p-1 text-icon transition-opacity hover:opacity-70"
      >
        <EcUser size={22} aria-hidden="true" />
      </Link>
      <HeaderCartControl />
    </>
  )
}

function HeaderCartControl() {
  return (
    <div className="mini-cart">
      <CartNavLink />
      {/*
        The panel calls `usePathname`, and under `cacheComponents` that is
        runtime data on any route with a dynamic param - the pathname is not
        knowable at build time. Without this boundary the masthead takes
        /product/[slug], /category/[slug] and every admin and account [id] route
        out of the static shell, which is the whole site.

        A null fallback costs nothing to look at: the panel is closed until the
        cart icon is pressed, and it renders nothing until then either.
      */}
      <Suspense fallback={null}>
        <MiniCartDropdown />
      </Suspense>
    </div>
  )
}
