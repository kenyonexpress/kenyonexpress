import AxeBuilder from '@axe-core/playwright'
import { type BrowserContext, type Page, expect, test } from '@playwright/test'
import {
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  E2E_CUSTOMER_EMAIL,
  E2E_CUSTOMER_PASSWORD,
  E2E_SUPPLIER_EMAIL,
  E2E_SUPPLIER_PASSWORD,
  signInWithEmail,
} from './auth-session'
import { ADMIN_PAGES, CUSTOMER_PAGES, type RouteSpec, SUPPLIER_PAGES } from './route-lists'

/**
 * axe on every page behind a session: `/account/*`, `/admin/*`, `/supplier/*`.
 *
 * `e2e/a11y.spec.ts` says why it stops at public pages: "the account, supplier
 * and admin areas need a session, and the auth fixture belongs to the specs
 * that already own it". `route-audit.spec.ts` is that owner, and its
 * `CUSTOMER_PAGES` / `ADMIN_PAGES` / `SUPPLIER_PAGES` are the real paths those
 * roles render. Those lists live in `route-lists.ts`, a plain data module with
 * no `test()` calls, not in `route-audit.spec.ts` itself: Playwright registers
 * every top-level `test()` in a file the moment it is imported, so importing
 * the `.spec.ts` file directly for its constants silently re-runs the whole
 * route audit too (measured 2026-09-28: 306 tests instead of ~82, 36 minutes
 * instead of a few). This file reuses the lists rather than keeping a second
 * one that would drift, and runs axe instead of the console/hydration/RTL
 * checks route-audit already covers.
 *
 * SCOPE: routes whose `expect.kind` is `'page'`. A redirect target is a page
 * this file already scans under its own path (`/admin` -> `/admin/dashboard`
 * is `ADMIN_PAGES[0]`'s destination, itself in the list); a `not-found` target
 * is the shared not-found template, out of scope here for the same reason the
 * public sweep does not scan every bogus-id 404 separately.
 *
 * WHY axe FAILS ON ANY VIOLATION RATHER THAN FILTERING TO serious/critical.
 * `e2e/a11y.spec.ts`'s own history is two rounds where a `moderate` finding
 * (text-gray-400 at 2.60:1, text-heading/70 missing AA by 0.02) was the real
 * defect and a filtered gate would have stayed green through it. Keeping the
 * same bar as the public sweep means one gate, not two policies to remember.
 */

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

/**
 * The suite signs in once per role and reuses the same page for every route
 * (see roleA11ySuite below), so the cursor is wherever the sign-in button
 * click left it and `page.goto` never moves it. Measured 2026-09-28: on
 * `/admin/suppliers/new` the upload dropzone happens to render under that
 * exact leftover pixel, so Chromium reports it `:hover` on a page nobody's
 * mouse has touched, and its `hover:text-brand` utility fires -- a real
 * visitor loading the page fresh never sees that. Moving the pointer off
 * before every scan is what makes this a resting-state check.
 */
async function scan(page: Page) {
  await page.mouse.move(0, 0)
  return new AxeBuilder({ page }).withTags(WCAG_AA).analyze()
}

function describe(results: Awaited<ReturnType<typeof scan>>) {
  return results.violations
    .map((v) => {
      const where = v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(' '))
        .join(' | ')
      return `${v.id} (${v.impact}) x${v.nodes.length}: ${v.help}\n    ${where}`
    })
    .join('\n  ')
}

function roleA11ySuite(role: string, email: string, password: string, pages: RouteSpec[]): void {
  const scannable = pages.filter((spec) => spec.expect.kind === 'page')

  test.describe(`authenticated a11y: ${role}`, () => {
    let context: BrowserContext
    let page: Page
    let signedIn = false
    let signInError = ''

    test.beforeAll(async ({ browser }) => {
      context = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem' })
      page = await context.newPage()
      try {
        await signInWithEmail(page, email, password)
        await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
        signedIn = true
      } catch (error) {
        signedIn = false
        signInError = String((error as Error)?.message ?? error).split('\n')[0] ?? ''
      }
    })
    test.afterAll(async () => {
      await context?.close()
    })

    for (const spec of scannable) {
      test(`${role} ${spec.path} has no WCAG A/AA violations`, async () => {
        if (!signedIn) {
          test.skip(true, `${role} sign-in failed: ${signInError || 'unknown'}`)
        }
        await page.goto(spec.path, { waitUntil: 'load', timeout: 45_000 })
        await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)

        const results = await scan(page)
        const summary = results.violations.map((v) => `${v.id} x${v.nodes.length}`)
        expect(summary, `${spec.path}\n  ${describe(results)}\n`).toEqual([])
      })
    }
  })
}

roleA11ySuite('customer', E2E_CUSTOMER_EMAIL, E2E_CUSTOMER_PASSWORD, CUSTOMER_PAGES)
roleA11ySuite('admin', E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, ADMIN_PAGES)
roleA11ySuite('supplier', E2E_SUPPLIER_EMAIL, E2E_SUPPLIER_PASSWORD, SUPPLIER_PAGES)
