import AccountNav from '@/components/account/AccountNav'
import CartBootstrap from '@/components/cart/CartBootstrap'
import CartDrawer from '@/components/cart/CartDrawer'
import { CartProvider } from '@/components/cart/CartProvider'
import SiteFooter from '@/components/layout/SiteFooter'
import SiteHeader from '@/components/layout/SiteHeader'
import WhatsAppFloat from '@/components/shared/WhatsAppFloat'
import { Toaster } from '@/components/ui/sonner'
import { createClient } from '@/lib/supabase/server'
import { getAccountProfile, getWalletSummary } from '@/server/queries/account'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import '@/styles/account.css'

/**
 * The session check and the identity the side nav shows, together, because both
 * come out of the same read.
 *
 * This used to run before the layout rendered anything, which made every
 * /account route request-time work from the first byte. It now runs in a
 * streamed hole so the account chrome has a static shell like the rest of the
 * site. That moves the redirect for a signed-out visitor from "before the first
 * byte" to "after the shell", which is safe here, and is worth being explicit
 * about rather than leaving to be rediscovered:
 *
 *  - `src/proxy.ts` already bounces `/account*` without a session, so nobody
 *    signed out reaches this render. That is layer 1 and it is untouched.
 *  - Every account read uses the request-scoped Supabase client and is enforced
 *    by RLS on `auth.uid()` (see src/server/queries/account.ts). The shell that
 *    would flash holds no data belonging to anyone.
 *
 * Still layer 2 of the same four, doing the same job, one boundary further down.
 */
async function AccountSideNav() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login?next=${encodeURIComponent('/account')}`)
  }

  const [profile, wallet] = await Promise.all([getAccountProfile(), getWalletSummary()])

  return (
    <AccountNav
      fullName={profile?.fullName ?? null}
      email={profile?.email ?? user.email ?? ''}
      walletBalanceAgorot={wallet.balanceAgorot}
    />
  )
}

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <CartBootstrap />
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
                {/* Holds the nav's box, not a spinner: the column is a fixed
                    260px so the content beside it never moves, and the height is
                    the measured height of the real nav so the page below it does
                    not either. See .account-nav--pending in account.css. */}
                <Suspense
                  fallback={<div className="account-nav account-nav--pending" aria-hidden="true" />}
                >
                  <AccountSideNav />
                </Suspense>
                {/* Every /account page reads rows scoped to the signed-in user,
                    so each one is request-time work. One boundary here covers
                    all nine rather than nine boundaries in nine files. */}
                <div className="account-content">
                  <Suspense fallback={null}>{children}</Suspense>
                </div>
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
