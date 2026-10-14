import WishlistPageView from '@/components/wishlist/WishlistPageView'
import { connection } from 'next/server'

export const metadata = { title: 'רשימת המשאלות' }

/**
 * The wishlist inside the account shell (UX18), the page the "רשימת המשאלות"
 * tab opens. The same client view as `/wishlist` (one server read after
 * hydration, move-to-cart through the cart store, the share and alert cards
 * at the foot), without the public page's own breadcrumb and frame: the
 * shell already has both.
 *
 * This used to be a permanent redirect to `/wishlist` (STEP 12 moved the
 * public page out so a signed-out visitor who pressed a heart lands on a
 * sign-in prompt rather than the account bounce). That page stays, and the
 * header's heart still points at it. Measured 14.10 on the built server:
 * production's `seo_redirects` carries `/wishlist` as an active 410 from the
 * 09.09 seed, so the redirect sent every signed-in customer from the account
 * nav to a blank "Gone". A tab that opens its list here does not depend on
 * that row; migrations/pending/271 deactivates it.
 */
export default async function AccountWishlistPage() {
  // UX20: on the resume path like every other account page. As a static
  // page the client view's boundary completed INSIDE the prerender once the
  // view grew (the skeleton grid and the card's module graph), and Fizz
  // wrote its nonce-less reveal runtime ($RB/$RV/$RC("B:5","S:5")) into
  // account/wishlist.html; csp-shell-gate refused the build
  // (logs/ux20/build3.log). The shell keeps the layout's empty fallback and
  // the view streams at request time under the nonce, same as UX18's tabs.
  await connection()
  return <WishlistPageView embedded />
}
