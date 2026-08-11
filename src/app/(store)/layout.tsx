import SkipLink from '@/components/a11y/SkipLink'
import CartBootstrap from '@/components/cart/CartBootstrap'
import { CartProvider } from '@/components/cart/CartProvider'
import SiteFooter from '@/components/layout/SiteFooter'
import SiteHeader from '@/components/layout/SiteHeader'
import WhatsAppFloat from '@/components/shared/WhatsAppFloat'
import DeferredStoreChrome from '@/components/store/DeferredStoreChrome'
// cart-page.css is imported by the root layout, one request for the whole
// site. See the note there before moving it back down here.

/**
 * SYNCHRONOUS, and it has to stay that way.
 *
 * This layout used to `await createClient()` and `getCart()` before it rendered
 * a single element. Both read cookies, so every route in the group - the home
 * page, the categories, the products and the search - was request-time work
 * from the first byte, served `Cache-Control: private, no-cache, no-store,
 * max-age=0, must-revalidate`, uncacheable in every layer and failing bf-cache.
 * The home page's own component tree contains no data access at all; the layout
 * was the entire reason it could not be prerendered.
 *
 * The cart still needs those two reads. They live in `/api/cart`, which
 * `<CartBootstrap>` fetches on the client after hydration — no request-time
 * work is left in this tree at all, so the routes are fully static instead of
 * a static shell around a postponed hole, and the `no-store` header is gone.
 * Adding an `await` back up here silently undoes all of it, and nothing fails
 * to warn you: the page still works, it is just dynamic again.
 */
export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <CartBootstrap />
      {/* Measured live: the footer sits directly after the content (top 871 on
          hot-deals) with white space below, i.e. no sticky footer. flex-1 would
          stretch main to the viewport and push the footer to the bottom, which is
          the 1218px vertical mismatch in the category compare. Keep min-h-screen
          for the background fill, but let the footer follow the content. */}
      {/* First focusable element on the page: WCAG 2.4.1, which Israeli
          standard 5568 adopts. The header is a masthead, a search bar, a
          category menu and a nav row, and it repeats on every page. */}
      <SkipLink />
      <div className="min-h-screen flex flex-col bg-white">
        <SiteHeader />
        {/* tabIndex={-1} is load-bearing: without it the browser scrolls but
            leaves focus on the link, so the next Tab goes back into the header
            and the skip does nothing for keyboard users. */}
        <main id="main-content" tabIndex={-1} className="w-full focus:outline-none">
          {children}
        </main>
        <SiteFooter />
      </div>
      <WhatsAppFloat />
      <DeferredStoreChrome />
    </CartProvider>
  )
}
