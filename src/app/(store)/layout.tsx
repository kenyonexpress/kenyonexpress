import CartDrawer from '@/components/cart/CartDrawer'
import { CartProvider } from '@/components/cart/CartProvider'
import SiteFooter from '@/components/layout/SiteFooter'
import SiteHeader from '@/components/layout/SiteHeader'
import { Toaster } from '@/components/ui/sonner'
import { getCart } from '@/server/actions/cart'
import '@/styles/cart-page.css'

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const cart = await getCart()

  return (
    <CartProvider initialCart={cart}>
      <div className="min-h-screen flex flex-col bg-white">
        <SiteHeader />
        <main className="flex-1 w-full">{children}</main>
        <SiteFooter />
      </div>
      <CartDrawer />
      <Toaster position="top-center" dir="rtl" richColors closeButton />
    </CartProvider>
  )
}
