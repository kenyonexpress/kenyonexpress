import LeftSidebar from '@/components/LeftSidebar'
import RightSidebar from '@/components/RightSidebar'
import SiteFooter from '@/components/SiteFooter'
import CartDrawer from '@/components/cart/CartDrawer'
import { CartProvider } from '@/components/cart/CartProvider'
import Header from '@/components/layout/Header'
import WhatsAppFloat from '@/components/shared/WhatsAppFloat'
import { Toaster } from '@/components/ui/sonner'
import { getCart } from '@/server/actions/cart'

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const cart = await getCart()

  return (
    <CartProvider initialCart={cart}>
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 py-4">
            {/*
              Three columns from lg up. Below that the sidebars are hidden, not
              stacked: stacking put category lists and English promo banners
              above the page on phones.

              The previous grid was grid-cols-[200px_1fr_250px] at every width.
              Fixed columns + gaps = 482px, so on a 412px phone the middle 1fr
              column (the page) resolved to ~2px. That made /coupons unusable.
            */}
            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[200px_1fr_250px]">
              <div className="hidden lg:block">
                <RightSidebar />
              </div>
              <main className="order-first min-w-0 space-y-4 lg:order-none">{children}</main>
              <div className="hidden lg:block">
                <LeftSidebar />
              </div>
            </div>
          </div>
        </div>
        <SiteFooter />
      </div>
      <CartDrawer />
      <WhatsAppFloat />
      <Toaster position="top-center" dir="rtl" richColors closeButton />
    </CartProvider>
  )
}
