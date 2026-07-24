import CartDrawer from '@/components/cart/CartDrawer'
import { CartProvider } from '@/components/cart/CartProvider'
import SiteFooter from '@/components/layout/SiteFooter'
import SiteHeader from '@/components/layout/SiteHeader'
import WhatsAppFloat from '@/components/shared/WhatsAppFloat'
import { Toaster } from '@/components/ui/sonner'
import { getCart } from '@/server/actions/cart'
import '@/styles/cart-page.css'

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const cart = await getCart()

  return (
    <CartProvider initialCart={cart}>
      {/* Measured live: the footer sits directly after the content (top 871 on
          hot-deals) with white space below, i.e. no sticky footer. flex-1 would
          stretch main to the viewport and push the footer to the bottom, which is
          the 1218px vertical mismatch in the category compare. Keep min-h-screen
          for the background fill, but let the footer follow the content. */}
      <div className="min-h-screen flex flex-col bg-white">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-brand-primary focus:px-4 focus:py-3 focus:text-sm focus:font-bold focus:text-heading"
        >
          דלג לתוכן הראשי
        </a>
        <SiteHeader />
        <main id="main-content" className="w-full" tabIndex={-1}>
          {children}
        </main>
        <SiteFooter />
      </div>
      <CartDrawer />
      <WhatsAppFloat />
      <Toaster position="top-center" dir="rtl" richColors closeButton />
    </CartProvider>
  )
}
