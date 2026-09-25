import SkipLink from '@/components/a11y/SkipLink'
import AccountNav from '@/components/account/AccountNav'
import PasskeyRegisterPrompt from '@/components/account/PasskeyRegisterPrompt'
import CartBootstrap from '@/components/cart/CartBootstrap'
import CartDrawer from '@/components/cart/CartDrawer'
import { CartProvider } from '@/components/cart/CartProvider'
import SiteFooter from '@/components/layout/SiteFooter'
import SiteHeader from '@/components/layout/SiteHeader'
import NotificationBell from '@/components/notifications/NotificationBell'
import WhatsAppFloat from '@/components/shared/WhatsAppFloat'
import { Toaster } from '@/components/ui/sonner'
import { WishlistProvider } from '@/components/wishlist/WishlistProvider'
import { log } from '@/lib/observability/log'
import { createClient } from '@/lib/supabase/server'
import { listPasskeys } from '@/server/actions/passkeys'
import { getAccountProfile, getWalletSummary } from '@/server/queries/account'
import { unreadCount } from '@/server/queries/notifications'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import '@/styles/account.css'
import { isPrerenderAbort } from '@/lib/observability/prerender-abort'

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

  const [profile, wallet, unread, passkeys] = await Promise.all([
    getAccountProfile(),
    getWalletSummary(),
    unreadCount(),
    // Best-effort: the register-a-passkey nudge is a nice-to-have, not
    // something worth failing the whole side nav over.
    listPasskeys().catch((cause): Awaited<ReturnType<typeof listPasskeys>> => {
      // `cookies()` rejects when a prerender completes first; that is the
      // static shell, not a passkey outage.
      if (!isPrerenderAbort(cause)) {
        log.warn('passkey.list_threw', {
          message: cause instanceof Error ? cause.message : String(cause),
        })
      }
      return { error: 'unavailable' }
    }),
  ])
  const hasPasskeys = 'available' in passkeys && passkeys.available && passkeys.passkeys.length > 0

  /*
    ONE GRID CHILD, not a fragment. `.account-shell` is a two-column grid
    (260px | 1fr) and this component is the first cell. A fragment here handed
    the grid three cells - the prompt, the bell row and the nav - so the nav
    landed in the 1fr column and every page's content dropped to row two of
    the 260px column. Measured 2026-09-25 on the coupons page: the content
    column was 260px wide inside a 1250px shell, each coupon row 218px, and
    the code paragraph 0px once the row grew a second action button. Broken
    since 039367fb9 added the bell as its own cell; the Suspense fallback is a
    single cell, which is why the shell looked right until the nav streamed in.
  */
  return (
    <div className="account-side">
      <PasskeyRegisterPrompt userId={user.id} hasPasskeys={hasPasskeys} />
      {/*
        THE BELL LIVES HERE AND NOT IN THE STOREFRONT HEADER, and the reason is
        measurable rather than aesthetic. `SiteHeader` is under the pixel-parity
        gate, which has to stay under 11% at 380, 768 and 1440; adding an
        element to it changes the header's geometry at every width, and the
        first thing that would report is a gate about a design reference, not
        about notifications.

        The account area is also where a bell is worth having: it is the only
        place a customer is signed in by construction, and the count is a
        property of a session.
      */}
      <div className="mb-3 flex justify-end">
        <NotificationBell userId={user.id} initialUnread={unread} />
      </div>
      <AccountNav
        fullName={profile?.fullName ?? null}
        email={profile?.email ?? user.email ?? ''}
        walletBalanceAgorot={wallet.balanceAgorot}
      />
    </div>
  )
}

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <WishlistProvider>
        <CartBootstrap />
        {/* WCAG 2.4.1 Bypass Blocks, which Israeli standard 5568 adopts. This
          layout repeats a navigation block on every page it wraps, so a
          keyboard or screen-reader user needs a way past it. */}
        <SkipLink />
        <div className="min-h-screen flex flex-col bg-white">
          <SiteHeader />
          {/* tabIndex={-1} is load-bearing: without it the browser scrolls but
            leaves focus on the skip link, so the next Tab returns to the nav
            and the skip does nothing for the users it exists for. */}
          <main id="main-content" tabIndex={-1} className="flex-1 w-full focus:outline-none">
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
                    fallback={
                      <div className="account-side" aria-hidden="true">
                        <div className="account-side__bell-pending" />
                        <div className="account-nav account-nav--pending" />
                      </div>
                    }
                  >
                    <AccountSideNav />
                  </Suspense>
                  {/* Every /account page reads rows scoped to the signed-in user,
                    so each one is request-time work. One boundary here covers
                    all ten rather than ten boundaries in ten files. */}
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
      </WishlistProvider>
    </CartProvider>
  )
}
