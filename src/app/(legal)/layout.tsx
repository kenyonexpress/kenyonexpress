import SkipLink from '@/components/a11y/SkipLink'
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
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <CartBootstrap />
      <SkipLink />
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
