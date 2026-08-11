import CartPageView from '@/components/cart/CartPageView'
import type { Metadata } from 'next'
// cart-page.css is imported by the root layout. See the note there.

export const metadata: Metadata = {
  title: 'סל הקניות',
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
  return <CartPageView />
}
