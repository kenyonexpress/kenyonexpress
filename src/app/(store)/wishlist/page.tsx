import WishlistPageView from '@/components/wishlist/WishlistPageView'
import type { Metadata } from 'next'
// cart-page.css is imported by the root layout; the page shares its frame,
// breadcrumb and title so the two lists the shopper keeps look like siblings.
import '@/styles/account.css'

export const metadata: Metadata = {
  title: 'רשימת המשאלות שלי',
  robots: { index: false, follow: false },
}

/**
 * Fully static, like `/cart`, and the list still shows up: everything per
 * shopper is one client read after hydration inside `WishlistPageView`. A
 * server read here would need the cookie and would take the route out of the
 * static shell under `cacheComponents`.
 *
 * `account.css` is imported for the two cards at the foot of the page (the
 * share link and the alert toggles) which were written for the account area
 * and keep their look here.
 */
export default function WishlistPage() {
  return <WishlistPageView />
}
