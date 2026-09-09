import { expect, test } from '@playwright/test'

/**
 * One cheap request per route: the page answers, and answers as itself.
 *
 * This is the breadth complement to the deep specs in this directory -- it
 * proves no route 500s and every public page still ships Hebrew RTL, without
 * driving any flow. Dynamic-slug routes are covered by their own specs
 * (product.spec.ts, category.spec.ts, coupons.spec.ts) against real data, so
 * they are deliberately absent here.
 */

/** Public pages: must render 200 and be RTL documents. */
const PUBLIC_ROUTES = [
  '/',
  '/about',
  '/accessibility',
  '/blog',
  '/cart',
  '/checkout',
  '/checkout/failed',
  '/contact',
  '/coupons',
  '/faq',
  '/privacy-policy',
  '/products',
  '/refund_returns',
  '/suppliers',
  '/terms-and-conditions',
  '/legal/accessibility',
  '/legal/privacy',
  '/legal/returns',
  '/legal/terms',
  '/newsletter/unsubscribe',
  '/supplier/login',
  '/supplier/access-denied',
  '/offline',
]

/**
 * Gated pages: anonymous requests may redirect to a login/denied page, but the
 * final answer must still be a working page, never a server error.
 */
const GATED_ROUTES = [
  '/account',
  '/account/orders',
  '/admin',
  '/admin/orders',
  '/supplier',
  '/scan',
]

test.describe('smoke: every static route answers', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`public ${route}`, async ({ request }) => {
      const response = await request.get(route)
      expect(response.status(), `${route} should render`).toBe(200)
      const body = await response.text()
      expect(body, `${route} should be an RTL document`).toContain('dir="rtl"')
      expect(body, `${route} should not be the Next error page`).not.toContain(
        'Application error: a server-side exception',
      )
    })
  }

  for (const route of GATED_ROUTES) {
    test(`gated ${route}`, async ({ request }) => {
      const response = await request.get(route) // follows redirects
      expect(response.status(), `${route} should redirect or render, not crash`).toBeLessThan(500)
    })
  }
})
