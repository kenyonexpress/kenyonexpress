import CartBootstrap from '@/components/cart/CartBootstrap'
import { CartProvider } from '@/components/cart/CartProvider'
import SiteFooter from '@/components/layout/SiteFooter'
import SiteHeader from '@/components/layout/SiteHeader'

/**
 * Chrome for the legal documents.
 *
 * Deliberately the same header and footer as the store group, and deliberately
 * SYNCHRONOUS for the same reason that one is: an `await` here reads cookies,
 * turns four static documents into request-time renders and nothing warns you.
 * These pages hold no per-user data at all, so they prerender completely.
 *
 * `CartProvider` is here because the shared header renders the cart nav link,
 * and that hook throws outside the provider. `CartBootstrap` fills it on the
 * client after hydration, which keeps the page static.
 */
/**
 * ONE SET OF LEGAL DOCUMENTS, SERVED HERE (F42).
 *
 * This group used to hold a second, unlinked, noindexed set while the store
 * group served the WordPress-era pages. The duplication was resolved in two
 * steps: first the better-sourced `(legal)/_content` text was promoted onto
 * the old linked URLs, then F42 moved those pages into this group at
 * `/terms`, `/privacy`, `/returns` and `/accessibility`. `next.config.ts`
 * 308s `/terms-and-conditions`, `/privacy-policy`, `/refund_returns` and
 * `/cancellation-policy` onto them, and the `legal/*` stubs below redirect
 * too, so no URL a customer or a search engine holds stops resolving.
 * `legal-duplication.test.ts` keeps it at one set.
 */

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <CartBootstrap />
      {/* The skip link is in the root layout, ahead of the consent banner. */}
      <div className="min-h-screen flex flex-col bg-white">
        <SiteHeader />
        {/* tabIndex={-1} is load-bearing: without it the skip link moves the
            scroll but leaves focus in the header. */}
        <main id="main-content" tabIndex={-1} className="w-full focus:outline-none">
          {children}
        </main>
        <SiteFooter />
      </div>
    </CartProvider>
  )
}
