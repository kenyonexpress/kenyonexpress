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
            <div className="grid grid-cols-[200px_1fr_250px] gap-4 items-start">
              <RightSidebar />
              <main className="min-w-0 space-y-4">{children}</main>
              <LeftSidebar />
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
