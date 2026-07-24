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
        <SiteHeader />
        <main className="w-full">{children}</main>
        <SiteFooter />
      </div>
      <CartDrawer />
      <WhatsAppFloat />
      <Toaster position="top-center" dir="rtl" richColors closeButton />
    </CartProvider>
  )
}
