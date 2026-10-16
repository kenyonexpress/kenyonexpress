import CartBootstrap from '@/components/cart/CartBootstrap'
import { CartProvider } from '@/components/cart/CartProvider'
import SiteFooter from '@/components/layout/SiteFooter'
import SiteHeader from '@/components/layout/SiteHeader'
import { MobileNavBar } from '@/components/mobile'
import WhatsAppFloat from '@/components/shared/WhatsAppFloat'
import DeferredStoreChrome from '@/components/store/DeferredStoreChrome'
import MobileContentWrapper from '@/components/store/MobileContentWrapper'
import { phoneAuthEnabled } from '@/lib/auth/phone-otp'
import { Suspense } from 'react'

/**
 * The storefront's chrome and providers, as one component.
 *
 * `(store)/layout.tsx` is this and nothing else. It is a component rather
 * than only a layout because `/coupon/[slug]` needs it too and cannot live in
 * the group: the same route serves `/coupon/<uuid>`, a customer's voucher,
 * which is deliberately rendered bare (see `coupon/[slug]/VoucherPage.tsx`),
 * and a route group cannot pick a layout by the shape of a segment. The offer
 * half renders inside this shell from the page; the voucher half does not.
 *
 * SYNCHRONOUS, and it has to stay that way. The layout this came from used to
 * `await createClient()` and `getCart()` before rendering an element, which
 * made every storefront route request-time work from the first byte. The
 * cart reads live in `/api/cart`, fetched by `<CartBootstrap>` after
 * hydration; an `await` added here silently makes the whole storefront
 * dynamic again and nothing warns.
 */
export default function StoreShell({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <CartBootstrap />
      {/* Measured live: the footer sits directly after the content (top 871 on
          hot-deals) with white space below, i.e. no sticky footer. flex-1 would
          stretch main to the viewport and push the footer to the bottom, which is
          the 1218px vertical mismatch in the category compare. Keep min-h-screen
          for the background fill, but let the footer follow the content. */}
      {/* The skip link (WCAG 2.4.1) is rendered once by the root layout, ahead
          of the consent banner, and lands on the <main> below. */}
      <div className="min-h-screen flex flex-col bg-white">
        <SiteHeader />
        {/* tabIndex={-1} is load-bearing: without it the browser scrolls but
            leaves focus on the link, so the next Tab goes back into the header
            and the skip does nothing for keyboard users. */}
        <main id="main-content" tabIndex={-1} className="w-full focus:outline-none pb-14 md:pb-0">
          <Suspense fallback={children}>
            <MobileContentWrapper>{children}</MobileContentWrapper>
          </Suspense>
        </main>
        <SiteFooter />
      </div>
      <Suspense fallback={null}>
        <MobileNavBar />
      </Suspense>
      <WhatsAppFloat />
      <DeferredStoreChrome phoneEnabled={phoneAuthEnabled()} />
    </CartProvider>
  )
}
