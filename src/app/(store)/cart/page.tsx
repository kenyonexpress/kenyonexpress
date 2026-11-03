import CartPageView from '@/components/cart/CartPageView'
import TrustBar from '@/components/storefront/TrustBar'
import { alternatesFor } from '@/lib/seo/alternates'
import type { Metadata } from 'next'
// cart-page.css is imported by the root layout. See the note there.

export const metadata: Metadata = {
  title: 'סל הקניות',
  // Self-canonical. Without one the page inherits the root layout's
  // `canonical: '/'`, which tells a crawler this URL is a copy of the home
  // page; Lighthouse's canonical audit failed it (C181).
  alternates: alternatesFor('/cart'),
}

/**
 * Fully static, and the cart still shows up.
 *
 * This used to await `getCart()` and `auth.getUser()` and hand both to
 * `CartPageView`, which then wrote the cart into the store from an effect. The
 * store is already filled by `<CartBootstrap>` in the group layout, from the
 * same two reads, so the page's own copy was a second round trip for a value
 * that was arriving anyway - and it was the only reason /cart could not be
 * prerendered.
 */
export default function CartPage() {
  return (
    <>
      <CartPageView />
      <TrustBar />
    </>
  )
}
