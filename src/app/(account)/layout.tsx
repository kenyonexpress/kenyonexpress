import AccountNav from '@/components/account/AccountNav'
import AccountTabs from '@/components/account/AccountTabs'
import AccountTabsList from '@/components/account/AccountTabsList'
import NotificationBell from '@/components/account/NotificationBell'
import CartBootstrap from '@/components/cart/CartBootstrap'
import CartDrawer from '@/components/cart/CartDrawer'
import { CartProvider } from '@/components/cart/CartProvider'
import SiteFooter from '@/components/layout/SiteFooter'
import SiteHeader from '@/components/layout/SiteHeader'
import WhatsAppFloat from '@/components/shared/WhatsAppFloat'
import DeferredToaster from '@/components/ui/DeferredToaster'
import { createClient } from '@/lib/supabase/server'
import { getAccountProfile, getWalletSummary } from '@/server/queries/account'
import { getMyLoyalty } from '@/server/queries/loyalty'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { Suspense } from 'react'
import '@/styles/account.css'
// UX20: the wishlist tab's grid. Imported by the layout and not by the page
// because a stylesheet owned by a page inside the shell's Suspense boundary
// made Fizz emit its nonce-less reveal runtime ($RB/$RV) into
// account/wishlist.html, which csp-shell-gate refuses (logs/ux20/build.log).
import '@/styles/wishlist-page.css'

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

  const [profile, wallet, loyalty] = await Promise.all([
    getAccountProfile(),
    getWalletSummary(),
    getMyLoyalty(),
  ])

  return (
    <AccountNav
      fullName={profile?.fullName ?? null}
      email={profile?.email ?? user.email ?? ''}
      walletBalanceAgorot={wallet.balanceAgorot}
      loyaltyTier={loyalty?.tier ?? null}
    />
  )
}

/**
 * The tab bar's request-time slot (UX18).
 *
 * `AccountTabs` reads `usePathname()`, and under `cacheComponents` that hook
 * is URL data: on /account/orders/[id] it cannot resolve at build time and
 * the build stops (CLIENT_HOOK_DYNAMIC) unless a boundary holds a fallback.
 * On the static routes it DOES resolve during the prerender, which is
 * worse: the boundary completes inside the static shell and Fizz writes
 * `$RC("B:6","S:6")` into the HTML with no nonce, and
 * `scripts/security/csp-shell-gate.mjs` fails 21 account shells (measured,
 * logs/ux18/build2.log). The document policy allows exactly two hashed
 * scripts in a shell; everything that varies has to arrive on the resume
 * path, where it is nonced.
 *
 * `connection()` puts this boundary on that path: the prerender stops here,
 * the shell carries the fallback (the five links, none lit), and the request
 * resumes it with the pathname known. Same mechanism as the side nav above,
 * which is why the two arrive together. On a client-side navigation between
 * tabs the layout persists and the mounted client component re-renders from
 * the hook, so the lit tab moves without a server round trip.
 */
async function AccountTabsSlot() {
  await connection()
  return <AccountTabs />
}

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <CartBootstrap />
      <div className="min-h-screen flex flex-col bg-white">
        {/* STEP 32: same masthead as the storefront, same way past it. */}
        <SiteHeader />
        <main id="main-content" tabIndex={-1} className="flex-1 w-full outline-none">
          <div className="account-page">
            <div className="account-page__inner">
              <div className="account-topline">
                <nav className="account-page__crumb" aria-label="פירורי לחם">
                  <Link href="/">עמוד הבית</Link>
                  <span aria-hidden="true"> ‹ </span>
                  <span>האזור האישי</span>
                </nav>
                {/* Client-only: renders nothing until the session is
                    confirmed, so the static shell is unchanged. */}
                <NotificationBell />
              </div>

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
                {/* UX18: the five tabs, a grid sibling so the stylesheet can
                    put them above the content on a desktop and first on a
                    phone. The fallback is the same five links with none lit:
                    see AccountTabsSlot for why the slot is request-time. */}
                <Suspense fallback={<AccountTabsList active={null} />}>
                  <AccountTabsSlot />
                </Suspense>
                {/* Every /account page reads rows scoped to the signed-in user,
                    so each one is request-time work. The boundary that covers
                    them is account/loading.tsx (UX27), not a <Suspense> here,
                    and the difference was measured twice over:

                    - A `fallback={null}` boundary here flushed an EMPTY column
                      for the ~2s a page took to stream, and a tab press kept
                      the OLD page in place for as long (logs/ux27/before.json).
                      loading.tsx paints its skeleton the instant a client-side
                      navigation starts, which a layout-owned boundary cannot:
                      React keeps a mounted boundary's old content through a
                      transition.
                    - A boundary here AND loading.tsx below it was 23 account
                      shells refused by the csp gate (logs/ux27/build.log): the
                      outer boundary completes during the prerender (its child
                      is the inner boundary's fallback), so Fizz writes its
                      nonce-less reveal runtime ($RB/$RV) into the static HTML.
                      One boundary, the segment's own, stays postponed. */}
                <div className="account-content">{children}</div>
              </div>
            </div>
          </div>
        </main>
        <SiteFooter />
      </div>
      <CartDrawer />
      <WhatsAppFloat />
      <DeferredToaster />
    </CartProvider>
  )
}
