import { expect, test } from '@playwright/test'

/**
 * NO PUBLIC PAGE MAY QUIETLY BECOME DYNAMIC.
 *
 * This is the generalisation of the single assertion in `category.spec.ts`,
 * and it exists because this is the regression class that costs the most and
 * announces the least. `CartBootstrap`'s own header records the last one: two
 * cookie reads inside a `<Suspense>` hole made every storefront response
 * postponed, so every storefront route answered `Cache-Control: no-store` and
 * nothing could be cached anywhere. Nothing threw, nothing logged, the pixels
 * were identical, and the site simply stopped being cacheable.
 *
 * WHAT "NOT DYNAMIC" LOOKS LIKE ON THE WIRE, and it is two shapes, not one:
 *
 *   x-nextjs-postponed: 1   a prerendered shell, resumed for this request
 *   x-nextjs-prerender: 1   the whole route out of the full-route cache
 *
 * Which one arrives depends on whether that route's cache entry is warm, so
 * asserting either alone is a flake - measured on 2026-08-20, when
 * `category.spec.ts` failed three times in one night for exactly that reason
 * while the route was perfectly static both times.
 *
 * MEASURED ON A BUILT SERVER, 2026-08-20: every route below answers 200 with
 * at least one of the two, and every gated route (`/account`, `/admin`,
 * `/supplier`, `/checkout/return`) answers a 3xx instead - so on this app a
 * 200 with NEITHER header does not exist today, which is what makes the
 * assertion a real constraint rather than a description.
 *
 * THERE IS NO SEPARATE "ARE THESE STILL THE RIGHT HEADER NAMES" CHECK, and
 * that is deliberate rather than an omission. The first draft had one, pinning
 * `/products` to postponed and `/about` to prerender, and it failed on the
 * first run against a cold server for exactly the reason this file exists to
 * describe: which shape a route yields depends on cache warmth, not on the
 * route. It is also redundant - a Next upgrade that renamed both headers would
 * leave every route below carrying neither, and all ten assertions would go
 * red at once.
 *
 * READ THE PORT BEFORE TRUSTING A RUN. This file was written against a server
 * playwright had REUSED from an earlier build (`reuseExistingServer`), where
 * `/`, `/products` and `/about` carried no render-mode header at all. Same
 * spec, same code, 11 passed against a server built from HEAD moments later.
 */

/** Public routes that must stay statically renderable. */
const ROUTES = [
  '/',
  '/products',
  '/coupons',
  '/search',
  '/cart',
  '/checkout',
  '/about',
  '/contact',
  '/faq',
  '/accessibility',
]

/** Header names Next uses for the two shapes. */
const POSTPONED = 'x-nextjs-postponed'
const PRERENDER = 'x-nextjs-prerender'

test.describe('render mode', () => {
  for (const route of ROUTES) {
    test(`${route} is served as a shell or a prerender, never dynamically`, async ({ page }) => {
      const response = await page.goto(route)
      expect(response?.status(), `${route} did not answer 200`).toBe(200)

      const headers = response?.headers() ?? {}
      expect(
        `${headers[POSTPONED] ?? ''}${headers[PRERENDER] ?? ''}`,
        `${route} carries neither ${POSTPONED} nor ${PRERENDER}, so it is rendering dynamically on every request`,
      ).not.toBe('')
    })
  }
})
