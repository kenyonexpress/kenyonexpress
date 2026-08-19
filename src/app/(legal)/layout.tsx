import type { Metadata } from 'next'

import SkipLink from '@/components/a11y/SkipLink'
import CartBootstrap from '@/components/cart/CartBootstrap'
import { CartProvider } from '@/components/cart/CartProvider'
import SiteFooter from '@/components/layout/SiteFooter'
import SiteHeader from '@/components/layout/SiteHeader'

/**
 * Chrome for the legal documents.
 *
 * Deliberately the same header and footer as the store group, and deliberately
 * SYNCHRONOUS for the same reason that one is: an `await` here reads cookies,
 * turns four static documents into request-time renders and nothing warns you.
 * These pages hold no per-user data at all, so they prerender completely.
 *
 * `CartProvider` is here because the shared header renders the cart nav link,
 * and that hook throws outside the provider. `CartBootstrap` fills it on the
 * client after hydration, which keeps the page static.
 */
/**
 * NOT INDEXABLE, AND ONLY UNTIL SOMEBODY CHOOSES.
 *
 * This site now carries TWO complete sets of legal documents. The older set is
 * the canonical one by every measure that matters: `SiteFooter` links
 * `/terms-and-conditions`, `/privacy-policy` and `/refund_returns`, and
 * `next.config.ts` 308s `/terms` and `/privacy` onto it. The set under
 * `/legal/*` is newer and better sourced, written to Amendment 13 and to the
 * current no-Escrow coupon model, but nothing links to it.
 *
 * Two indexable sets of terms is the specific failure
 * `src/content/legal/legal-routes.test.ts` was written to prevent, in its own
 * words: "the site states two different sets of terms about a consumer's right
 * to cancel, which is exactly the kind of contradiction the Consumer Protection
 * Law makes expensive". That test only asserts the redirects exist, so it
 * cannot see a second set arriving on new paths, which is how this got past it.
 *
 * WHY noindex AND NOT A DELETION OR A REDIRECT. Which text binds the company is
 * a decision for Ofir and for counsel, not one to take in a merge. Deleting
 * either set destroys work; redirecting one onto the other silently changes
 * which terms a customer is held to. `noindex` changes neither: both documents
 * still serve, the footer still points where it pointed, and the only thing
 * that stops is a search engine presenting a second, unlinked set of terms as
 * though it were this site's policy.
 *
 * Measured, so it is not a guess: the two cancellation documents AGREE on the
 * fee (5%, capped at 100 shekels), and both match `computeCancellationFee` in
 * `src/server/domain/orders/refund.ts`. `legal-duplication.test.ts` keeps that
 * true. The problem is duplication and drift, not a contradiction today.
 *
 * TO PROMOTE THIS SET: delete this export, point `SiteFooter` at `/legal/*`,
 * repoint the `next.config.ts` aliases, and retire the older set. One commit.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <CartBootstrap />
      <SkipLink />
      <div className="min-h-screen flex flex-col bg-white">
        <SiteHeader />
        {/* tabIndex={-1} is load-bearing: without it the skip link moves the
            scroll but leaves focus in the header. */}
        <main id="main-content" tabIndex={-1} className="w-full focus:outline-none">
          {children}
        </main>
        <SiteFooter />
      </div>
    </CartProvider>
  )
}
