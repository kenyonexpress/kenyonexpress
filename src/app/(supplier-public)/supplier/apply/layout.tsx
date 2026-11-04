import SkipLink from '@/components/a11y/SkipLink'
import CartBootstrap from '@/components/cart/CartBootstrap'
import { CartProvider } from '@/components/cart/CartProvider'
import SiteFooter from '@/components/layout/SiteFooter'
import SiteHeader from '@/components/layout/SiteHeader'

/**
 * V06: the store's header and footer around the business join.
 *
 * `(supplier-public)` has no layout of its own, so until V06 `/supplier/apply`
 * rendered with no site chrome at all: a bare form with no way back to the
 * store. The chrome is the legal group's, imported unchanged (every component
 * here is frozen), and scoped to this one route so `/supplier/login` and
 * `/supplier/access-denied` keep their standalone screens.
 *
 * `CartProvider` because the shared header renders the cart link, and that
 * hook throws outside the provider.
 */
export default function SupplierApplyLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <CartBootstrap />
      <SkipLink />
      <div className="min-h-screen flex flex-col bg-white">
        <SiteHeader />
        {/* tabIndex={-1}: the skip link must move focus, not only scroll. */}
        <main id="main-content" tabIndex={-1} className="w-full focus:outline-none">
          {children}
        </main>
        <SiteFooter />
      </div>
    </CartProvider>
  )
}
