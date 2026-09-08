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

/**
 * A MISSING PRODUCT MUST SAY 404 IN THE STATUS LINE, NOT ONLY IN THE BODY.
 *
 * Measured 2026-09-08 against `pnpm start`: every one of these already answers
 * with a real 404, and nothing held them there. The reason that is worth a test
 * rather than an assumption is `cacheComponents`.
 *
 * Under it, an uncached read at the top of a page fails the BUILD unless it sits
 * inside `<Suspense>`. Push the read in, and `notFound()` now fires after the
 * shell has flushed - so the response is 200 with the not-found UI streamed into
 * it. `/debug/sentry` and `/debug/sentry/render` are exactly that shape today,
 * deliberately: `connection()` inside a boundary is what keeps
 * SENTRY_DEBUG_ROUTES toggleable on an already-built deploy, and the pages
 * argue for the trade in their own comments. The body served is the 404 page,
 * so the gate holds; only the status line is soft.
 *
 * Wrapping a product page's data read in a boundary is an ordinary PPR
 * optimisation, and it would turn every missing product into a soft 404 across
 * the whole catalogue with no other symptom. Search engines treat those as a
 * quality problem, and this repo already reasons about status semantics - see
 * the 410-not-404 decision in src/proxy.ts.
 */
test.describe('missing pages answer with a real status code', () => {
  const MISSING = [
    '/product/no-such-product-xyz',
    '/category/no-such-category-xyz',
    '/blog/no-such-post-xyz',
    '/totally-unknown-path-xyz',
  ]

  for (const route of MISSING) {
    test(`404 status for ${route}`, async ({ request }) => {
      const response = await request.get(route, { maxRedirects: 0 })
      expect(response.status(), `${route} must be a hard 404, not a 200 carrying 404 markup`).toBe(
        404,
      )
    })
  }

  test('the API debug endpoint 404s by status while the flag is unset', async ({ request }) => {
    // A Route Handler can set the status itself, so this half has no excuse and
    // is held to it.
    const response = await request.get('/api/debug/sentry', { maxRedirects: 0 })
    expect(response.status()).toBe(404)
  })
})
