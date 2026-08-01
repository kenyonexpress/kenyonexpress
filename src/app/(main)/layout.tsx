import LeftSidebar from '@/components/LeftSidebar'
import RightSidebar from '@/components/RightSidebar'
import SiteFooter from '@/components/SiteFooter'
import CartDrawer from '@/components/cart/CartDrawer'
import { CartProvider } from '@/components/cart/CartProvider'
import Header from '@/components/layout/Header'
import WhatsAppFloat from '@/components/shared/WhatsAppFloat'
import { Toaster } from '@/components/ui/sonner'
import { createClient } from '@/lib/supabase/server'
import { getCart } from '@/server/actions/cart'

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const [cart, { data: auth }] = await Promise.all([getCart(), supabase.auth.getUser()])

  return (
    <CartProvider initialCart={cart} isAuthenticated={auth.user !== null}>
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 py-4">
            {/*
              The three columns start at lg, and the two sidebars do not exist
              below it.

              This grid used to be `grid-cols-[200px_1fr_250px]` at every width,
              with no breakpoint. The two fixed columns and the gaps come to
              482px, so on a 412px phone the `1fr` middle column - the page
              itself - was solved at **2px wide** and everything in it was a
              vertical sliver. Measured across widths before the fix: 2px at
              360/390/412/480, 37 at 600, 76.66 at 768, 162 at 1024. That is
              every page in this route group (/coupons, /coupons/[id] and the
              two newsletter screens) unusable on a phone, and /coupons is where
              the coupon catalogue lives.

              The sidebars are `hidden` rather than stacked because stacking
              them puts a category list and three English promo banners ABOVE
              the content on the narrowest screen. `order-first` keeps the page
              first in the visual order on mobile without moving it out of the
              middle column on desktop, where DOM order is what places it.
            */}
            <div className="grid grid-cols-1 gap-4 items-start lg:grid-cols-[200px_1fr_250px]">
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
