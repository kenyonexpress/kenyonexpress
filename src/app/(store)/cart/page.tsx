import CartPageView from '@/components/cart/CartPageView'
import type { Metadata } from 'next'
// cart-page.css is imported by the root layout. See the note there.

export const metadata: Metadata = {
  // NOINDEX, and the canonical is the reason rather than the crawl budget.
  // The root layout declares `alternates.canonical: '/'` and Next inherits
  // metadata, so a page that sets neither tells Google it IS the home page -
  // measured 2026-09-10 on sixteen public routes, this one among them. A
  // duplicate-content signal pointing at the home page from a login form is
  // worse than the page being crawled at all. robots.txt disallows several of
  // these too, and that stops the crawl, not the indexing of a URL somebody
  // links to.
  robots: { index: false, follow: true },
  // A SELF-CANONICAL BESIDE THE NOINDEX, and the pair is deliberate. Without it
  // this page inherits the root layout's canonical of '/', and noindex plus a
  // canonical pointing at ANOTHER url is a contradiction Google resolves by
  // following the canonical - which would aim the noindex at the home page. The
  // same url in both fields says exactly one thing: do not index this, and it
  // stands for nothing else.
  alternates: { canonical: '/cart' },
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
