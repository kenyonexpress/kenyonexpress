/**
 * The account's top tabs (UX18): the five places a customer actually goes,
 * above the content on every /account route, in front of the eighteen-row
 * side nav. Pure, so the "which tab is lit" rule is tested without a router.
 *
 * Route-based, not ARIA tabs: each tab is a link to its own page and the
 * current one carries `aria-current="page"`. The ARIA tabs pattern is for
 * panels swapped in place, and a screen reader told "tab 2 of 5, selected"
 * on a link that reloads the route is being told the wrong thing.
 *
 * Settings is a hub, not a route of its own kind: notifications, security,
 * payment methods and privacy all sit under it, and /account/details is the
 * old address of the profile form (a permanent redirect to the hub). Returns
 * live under orders because a return is a thing done to an order.
 */

export type AccountTabId = 'overview' | 'orders' | 'wishlist' | 'addresses' | 'settings'

export interface AccountTab {
  id: AccountTabId
  href: string
  /** Hebrew, as rendered. */
  label: string
  /** Paths (exact or as a prefix) that light the tab; the overview is exact. */
  matches: readonly string[]
}

export const ACCOUNT_TABS: readonly AccountTab[] = [
  { id: 'overview', href: '/account', label: 'סקירה', matches: ['/account'] },
  {
    id: 'orders',
    href: '/account/orders',
    label: 'ההזמנות שלי',
    matches: ['/account/orders', '/account/return'],
  },
  {
    id: 'wishlist',
    href: '/account/wishlist',
    label: 'רשימת המשאלות',
    matches: ['/account/wishlist'],
  },
  { id: 'addresses', href: '/account/addresses', label: 'כתובות', matches: ['/account/addresses'] },
  {
    id: 'settings',
    href: '/account/settings',
    label: 'הגדרות',
    matches: [
      '/account/settings',
      '/account/details',
      '/account/notifications',
      '/account/security',
      '/account/privacy',
      '/account/tokens',
    ],
  },
] as const

function stripTrailingSlash(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
}

/**
 * The tab a path belongs to, or null for an account page outside the five
 * (wallet, coupons, loyalty...). The overview matches only itself, so it never
 * lights up for a child; every other tab matches itself and its children.
 */
export function activeAccountTab(pathname: string): AccountTabId | null {
  const path = stripTrailingSlash(pathname.split('?')[0] ?? '')
  for (const tab of ACCOUNT_TABS) {
    for (const match of tab.matches) {
      if (tab.id === 'overview') {
        if (path === match) return tab.id
        continue
      }
      if (path === match || path.startsWith(`${match}/`)) return tab.id
    }
  }
  return null
}
