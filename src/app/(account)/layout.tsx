import AccountNav from '@/components/account/AccountNav'
import CartDrawer from '@/components/cart/CartDrawer'
import { CartProvider } from '@/components/cart/CartProvider'
import SiteFooter from '@/components/layout/SiteFooter'
import SiteHeader from '@/components/layout/SiteHeader'
import WhatsAppFloat from '@/components/shared/WhatsAppFloat'
import { Toaster } from '@/components/ui/sonner'
import { createClient } from '@/lib/supabase/server'
import { getCart } from '@/server/actions/cart'
import { getAccountProfile, getWalletSummary } from '@/server/queries/account'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import '@/styles/account.css'

/**
 * Every /account route is behind a server-side session check. The guest cart is
 * deliberately open elsewhere on the site; this area is the one place that
 * requires an identity, so the gate lives here rather than in middleware.
 */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login?next=${encodeURIComponent('/account')}`)
  }

  const [cart, profile, wallet] = await Promise.all([
    getCart(),
    getAccountProfile(),
    getWalletSummary(),
  ])

  return (
    <CartProvider initialCart={cart} isAuthenticated>
      <div className="min-h-screen flex flex-col bg-white">
        <SiteHeader />
        <main className="flex-1 w-full">
          <div className="account-page">
            <div className="account-page__inner">
              <nav className="account-page__crumb" aria-label="פירורי לחם">
                <Link href="/">עמוד הבית</Link>
                <span aria-hidden="true"> ‹ </span>
                <span>האזור האישי</span>
              </nav>

              <div className="account-shell">
                <AccountNav
                  fullName={profile?.fullName ?? null}
                  email={profile?.email ?? user.email ?? ''}
                  walletBalanceIls={wallet.balanceIls}
                />
                <div className="account-content">{children}</div>
              </div>
            </div>
          </div>
        </main>
        <SiteFooter />
      </div>
      <CartDrawer />
      <WhatsAppFloat />
      <Toaster position="top-center" dir="rtl" richColors closeButton />
    </CartProvider>
  )
}
