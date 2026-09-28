/**
 * Route data shared between `route-audit.spec.ts` and `a11y-authenticated.spec.ts`.
 *
 * This is a plain module, not a spec file, on purpose. Playwright registers
 * every top-level `test()` call in a file the moment that file is imported,
 * even when the import is only for its exported constants. A file that
 * imports `route-audit.spec.ts` directly re-runs the whole route audit (every
 * role, every path) alongside whatever it meant to test -- measured 2026-09-28,
 * a run of `a11y-authenticated.spec.ts` alone executed 306 tests instead of
 * ~82 and took 36 minutes instead of a few, because it silently imported and
 * re-registered all of `route-audit.spec.ts`'s suites. Keeping the data here,
 * with no `test()` call in the file, is what makes the import side-effect-free.
 */

export type Expectation =
  /** Renders in place with 200. */
  | { kind: 'page' }
  /** Intentional redirect; the final pathname must start with `to`. */
  | { kind: 'redirect'; to: string }
  /**
   * A bogus id must answer the not-found page, never a server error. Either a
   * 404 status, or a 200 carrying the not-found page: notFound() thrown inside
   * a Suspense boundary after the shell has streamed cannot change the status
   * any more, and the gift and coupon pages are built that way on purpose.
   */
  | { kind: 'not-found' }

export type RouteSpec = { path: string; expect: Expectation; note?: string }

export const page200 = (path: string, note?: string): RouteSpec => ({
  path,
  expect: { kind: 'page' },
  note,
})
export const redirect = (path: string, to: string, note?: string): RouteSpec => ({
  path,
  expect: { kind: 'redirect', to },
  note,
})
export const notFound = (path: string, note?: string): RouteSpec => ({
  path,
  expect: { kind: 'not-found' },
  note,
})

export const BOGUS = '00000000-0000-4000-8000-000000000000'

export const CUSTOMER_PAGES: RouteSpec[] = [
  page200('/account'),
  page200('/account/addresses'),
  page200('/account/affiliate'),
  page200('/account/coupons'),
  page200('/account/details'),
  page200('/account/invoices'),
  redirect('/account/my-vouchers', '/account/coupons', 'permanent alias of the coupon list'),
  page200('/account/notifications'),
  page200('/account/orders'),
  page200('/account/referrals'),
  page200('/account/security'),
  page200('/account/subscriptions'),
  page200('/account/tickets'),
  page200('/account/tokens'),
  redirect('/account/vouchers', '/account/coupons', 'permanent alias of the coupon list'),
  page200('/account/wallet'),
  page200('/account/wishlist'),
  page200('/login', 'the login form renders again for a signed-in visitor; no redirect exists'),
  redirect('/admin', '/', 'a customer is not an admin'),
  redirect('/supplier', '/supplier/access-denied', 'a customer is not a supplier'),
  notFound(`/account/orders/${BOGUS}`),
  notFound(`/account/tickets/${BOGUS}`),
  notFound(`/account/coupons/${BOGUS}/gift`),
  notFound(`/coupon/${BOGUS}`),
]

export const ADMIN_PAGES: RouteSpec[] = [
  '/admin/affiliates',
  '/admin/analytics',
  '/admin/analytics/snapshot',
  '/admin/approvals',
  '/admin/audit-log',
  '/admin/billing',
  '/admin/cashback',
  '/admin/categories',
  '/admin/categories/new',
  '/admin/contact-channels',
  '/admin/coupons',
  '/admin/coupons/codes',
  '/admin/coupons/expiry',
  '/admin/coupons/impact',
  '/admin/coupons/lookup',
  '/admin/coupons/new',
  '/admin/cron',
  '/admin/dashboard',
  '/admin/data-requests',
  '/admin/deals-queue',
  '/admin/discounts',
  '/admin/discounts/new',
  '/admin/feature-flags',
  '/admin/flash-deals',
  '/admin/fraud',
  '/admin/growth',
  '/admin/homepage',
  '/admin/homepage/preview',
  '/admin/invoices',
  '/admin/orders',
  '/admin/pages',
  '/admin/payments',
  '/admin/payouts',
  '/admin/phases',
  '/admin/products',
  '/admin/products/images',
  '/admin/products/import',
  '/admin/products/new',
  '/admin/queues',
  '/admin/referrals',
  '/admin/reports',
  '/admin/reviews',
  '/admin/search',
  '/admin/settings',
  '/admin/status',
  '/admin/subscriptions',
  '/admin/suppliers',
  '/admin/suppliers/applications',
  '/admin/suppliers/contact-requests',
  '/admin/suppliers/image-submissions',
  '/admin/suppliers/new',
  '/admin/suppliers/price-proposals',
  '/admin/support',
  '/admin/users',
  '/admin/vendors',
  '/admin/vendors/new',
  '/admin/whatsapp/messages',
].map((path) => page200(path))
ADMIN_PAGES.unshift(redirect('/admin', '/admin/dashboard', 'the admin root is the dashboard'))

export const SUPPLIER_PAGES: RouteSpec[] = [
  page200('/supplier'),
  page200('/supplier/orders'),
  page200('/supplier/payouts'),
  page200('/supplier/products'),
  page200('/supplier/redemptions'),
  page200('/supplier/scan'),
  page200('/supplier/settings'),
  redirect('/supplier/login', '/supplier', 'a signed-in supplier skips the portal login'),
  redirect('/admin', '/', 'a supplier is not an admin'),
]
