import SkipLink from '@/components/a11y/SkipLink'
import CartBootstrap from '@/components/cart/CartBootstrap'
import { CartProvider } from '@/components/cart/CartProvider'
import SiteFooter from '@/components/layout/SiteFooter'
import SiteHeader from '@/components/layout/SiteHeader'
import '@/styles/auth-page.css'

/**
 * V04: the sign-in pages inside the store's own header and footer, as Electro's
 * my-account page is. This group used to be a bare grey screen with a
 * "KenyonExpress" wordmark, which is neither the site's name nor its chrome.
 *
 * The same shape as the legal layout, and SYNCHRONOUS for the same reason: an
 * `await` here reads cookies and makes every page below request-time work.
 * `CartProvider` is here because the header renders the cart link, and that
 * hook throws outside the provider; `CartBootstrap` fills it after hydration.
 * The header and footer are rendered, never edited (design freeze).
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
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
