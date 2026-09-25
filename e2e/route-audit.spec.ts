import { appendFileSync, mkdirSync } from 'node:fs'
import { type BrowserContext, type ConsoleMessage, type Page, expect, test } from '@playwright/test'
import {
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  E2E_CUSTOMER_EMAIL,
  E2E_CUSTOMER_PASSWORD,
  E2E_SUPPLIER_EMAIL,
  E2E_SUPPLIER_PASSWORD,
  signInWithEmail,
} from './auth-session'

/**
 * Route audit: every route in the app, in a real browser, as every role.
 *
 * `smoke-all-routes.spec.ts` is the cheap request-level half (does the page
 * answer). This is the browser half: for each page route it records the final
 * status and URL, every console error, every hydration warning and the
 * document direction, and fails on any of:
 *
 *   - a status other than the expected one (200, or an intentional redirect
 *     whose destination is written next to the route below, or 404 for a
 *     deliberately bogus token);
 *   - any console error or uncaught page error;
 *   - any React hydration warning (production builds minify them to
 *     "Minified React error #418/#423/#425", so the match is on the numbers
 *     as well as on the words);
 *   - a document that is not `<html lang="he" dir="rtl">` with a body whose
 *     computed direction is rtl.
 *
 * Dynamic segments are discovered at runtime from the pages that link to them
 * (first product on /products, first order on /account/orders, ...). A list
 * page with nothing to link to records the detail route as NO DATA rather
 * than inventing an id.
 *
 * Deliberately absent: `/admin/users/[id]/view-as`. A GET there mints an
 * impersonation cookie into the admin's session and writes an audit row, so a
 * sweep that requests it changes state on every run.
 *
 * Run against a production build with the mock provider baked in and a fresh
 * login-limiter bucket:
 *
 *   CARDCOM_USE_MOCK=true NEXT_PUBLIC_APP_URL=http://localhost:3471 pnpm build
 *   CARDCOM_USE_MOCK=true NEXT_PUBLIC_APP_URL=http://localhost:3471 PORT=3471 pnpm start
 *   E2E_BASE_URL=http://localhost:3471 E2E_FORWARDED_FOR=10.77.0.21 \
 *   E2E_ADMIN_EMAIL=e2e-admin@kenyonexpress.co.il ROUTE_AUDIT_REPORT=/tmp/route-audit.jsonl \
 *     pnpm exec playwright test e2e/route-audit.spec.ts --project=chromium --workers=1
 *
 * The admin fixture in the hosted database is the `.co.il` address above, not
 * the seed's `.local` default; without the variable the admin suite records
 * every route as SKIPPED with the sign-in failure in its detail column.
 *
 * The full table lands in the report file, one row per route, appended as
 * each route is measured. Appended and not collected: Playwright recycles the
 * worker process after a failed test, and a module-level array dies with it,
 * so a run with three failures would report only the rows of the last worker.
 * Delete the file before a run whose numbers matter. The whole sweep takes
 * about 25 minutes serially; `--grep` on a role name splits it, and the rows
 * of every chunk land in the same file when ROUTE_AUDIT_REPORT is set.
 */

type Expectation =
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

type RouteSpec = { path: string; expect: Expectation; note?: string }

type Row = {
  role: string
  path: string
  status: number | null
  finalPath: string
  outcome: 'PASS' | 'FAIL' | 'NO DATA' | 'SKIPPED'
  consoleErrors: string[]
  hydrationWarnings: string[]
  rtl: boolean | null
  detail?: string
}

const page200 = (path: string, note?: string): RouteSpec => ({
  path,
  expect: { kind: 'page' },
  note,
})
const redirect = (path: string, to: string, note?: string): RouteSpec => ({
  path,
  expect: { kind: 'redirect', to },
  note,
})
const notFound = (path: string, note?: string): RouteSpec => ({
  path,
  expect: { kind: 'not-found' },
  note,
})

const BOGUS = '00000000-0000-4000-8000-000000000000'

// ---------------------------------------------------------------------------
// Anonymous
// ---------------------------------------------------------------------------

const PUBLIC_PAGES: RouteSpec[] = [
  page200('/'),
  page200('/about'),
  page200('/accessibility'),
  page200('/blog'),
  page200('/cart'),
  redirect(
    '/checkout',
    '/cart',
    'guest checkout is open, but an empty cart is sent back to the cart',
  ),
  redirect(
    '/checkout/failed',
    '/login',
    'every /checkout/* page past the frame needs the buyer signed in',
  ),
  page200('/contact'),
  page200('/coupons'),
  page200('/faq'),
  page200('/help'),
  page200('/privacy-policy'),
  page200('/products'),
  page200('/refund_returns'),
  page200('/search', 'no search field in the UI; the route still renders for campaign links'),
  page200('/suppliers'),
  redirect(
    '/suppliers/apply',
    '/login',
    'the application form asks for a session first, by design',
  ),
  page200('/terms-and-conditions'),
  page200('/newsletter/confirm'),
  page200('/newsletter/unsubscribe'),
  page200('/supplier/login'),
  page200('/supplier/access-denied'),
  page200('/offline'),
  page200('/login'),
  page200('/signup'),
  page200('/signup/confirm'),
  page200('/forgot-password'),
  page200('/reset-password'),
  page200('/mfa'),
  // Legacy and alias paths: next.config redirects() and the (legal) group.
  redirect('/legal/accessibility', '/accessibility'),
  redirect('/legal/privacy', '/privacy-policy'),
  redirect('/legal/returns', '/refund_returns'),
  redirect('/legal/terms', '/terms-and-conditions'),
  redirect('/terms', '/terms-and-conditions'),
  redirect('/privacy', '/privacy-policy'),
  redirect('/cancellation-policy', '/refund_returns'),
  redirect('/scan', '/login', 'alias of /supplier/scan, which needs a session'),
  // Gated routes, signed out: the proxy sends them to /login?next=...
  redirect('/account', '/login'),
  redirect('/account/orders', '/login'),
  redirect('/admin', '/login'),
  redirect('/admin-mfa', '/login'),
  redirect('/supplier', '/login'),
  redirect('/supplier/scan', '/login'),
  redirect('/checkout/confirmation', '/login', 'order pages need the buyer'),
  redirect('/checkout/return', '/login'),
  redirect('/checkout/app-return', '/login'),
  redirect(`/coupon/${BOGUS}`, '/login'),
  redirect(`/c/nope-${BOGUS}`, '/', 'unknown affiliate code goes home without a cookie'),
  // Bogus tokens and ids: the not-found page, never a 500.
  notFound(`/gift/${BOGUS}`),
  page200(`/redeem/${BOGUS}`, 'a forged token renders the invalid-signature outcome, never a 404'),
  page200(`/wishlist/s/${BOGUS}`, 'a broken share link renders the invalid-link page, never a 404'),
  notFound(`/s/${BOGUS}`),
  page200(
    `/order/${BOGUS}/tracking`,
    'a bad tracking link says the link expired; a 404 would be an order-id oracle',
  ),
  notFound(`/page/no-such-page-${BOGUS}`),
  notFound(`/product/no-such-product-${BOGUS}`),
  notFound(`/category/no-such-category-${BOGUS}`),
  notFound(`/city/no-such-city-${BOGUS}`),
  notFound(`/coupons/${BOGUS}`),
  notFound('/this-route-does-not-exist'),
]

/** GET on every non-page route: never a 5xx, whatever the auth answer is. */
const FILE_AND_API_ROUTES = [
  '/robots.txt',
  '/manifest.webmanifest',
  '/opengraph-image',
  '/sitemap.xml',
  '/sitemap/categories.xml',
  '/sitemap/content.xml',
  '/sitemap/products.xml',
  '/sitemap/regions.xml',
  '/sitemap/suppliers.xml',
  '/feed.xml',
  '/merchant.xml',
  '/.well-known/apple-app-site-association',
  '/.well-known/assetlinks.json',
  '/auth/callback',
  '/api/a',
  '/api/account/delete',
  '/api/account/export',
  '/api/admin/audit-log/csv',
  `/api/admin/coupon-qr/${BOGUS}/pdf`,
  `/api/admin/disputes/${BOGUS}/evidence`,
  '/api/admin/payouts/ledger',
  '/api/admin/reports/sales',
  '/api/app/push-tokens',
  '/api/app/session',
  '/api/cart',
  '/api/cron/abandoned-cart',
  '/api/cron/anonymize-user-data',
  '/api/cron/deals-autopilot',
  '/api/cron/expire-vouchers',
  '/api/cron/health',
  '/api/cron/invoices',
  '/api/cron/notifications',
  '/api/cron/payout-run',
  '/api/cron/price-schedule',
  '/api/cron/price-snapshot',
  '/api/cron/reap-carts',
  '/api/cron/reconcile',
  '/api/cron/retention',
  '/api/cron/settlement-reconcile',
  '/api/cron/stock',
  '/api/cron/stranded-payments',
  '/api/cron/subscriptions',
  '/api/cron/webhook-dlq',
  '/api/cron/weekly-digest',
  '/api/cron/whatsapp',
  '/api/cron/wishlist-alerts',
  '/api/debug/sentry',
  '/api/health',
  `/api/invoices/${BOGUS}/download`,
  '/api/payments/cardcom/webhook',
  '/api/ready',
  '/api/revalidate',
  '/api/search',
  '/api/search/facets',
  '/api/search/index-dlq',
  '/api/search/index-job',
  '/api/search/quick-links',
  '/api/search/suggest',
  '/api/supplier/app/pin',
  '/api/supplier/payouts/csv',
  '/api/supplier/redeem',
  '/api/supplier/redemptions/csv',
  '/api/supplier/statement',
  '/api/supplier/vouchers/lookup',
  '/api/supplier/vouchers/redeem-batch',
  '/api/supplier/vouchers/redeem',
  `/api/wallet/apple/${BOGUS}`,
  '/api/webhooks/products',
  '/api/webhooks/resend',
  '/api/webhooks/twilio-sms',
  '/api/webhooks/whatsapp',
  `/account/orders/${BOGUS}/invoice`,
]

// ---------------------------------------------------------------------------
// Signed-in roles
// ---------------------------------------------------------------------------

const CUSTOMER_PAGES: RouteSpec[] = [
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

/** Detail pages discovered from a list page: [list, href prefix, suffix]. */
const CUSTOMER_DETAILS: Array<[string, string, string]> = [
  ['/account/orders', '/account/orders/', ''],
  ['/account/tickets', '/account/tickets/', ''],
  ['/account/coupons', '/account/coupons/', '/gift'],
]

const ADMIN_PAGES: RouteSpec[] = [
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

const ADMIN_DETAILS: Array<[string, string, string]> = [
  ['/admin/categories', '/admin/categories/', ''],
  ['/admin/coupons', '/admin/coupons/', ''],
  ['/admin/coupons/codes', '/admin/coupons/codes/', ''],
  ['/admin/discounts', '/admin/discounts/', ''],
  ['/admin/orders', '/admin/orders/', ''],
  ['/admin/pages', '/admin/pages/', ''],
  ['/admin/products', '/admin/products/', '/edit'],
  ['/admin/suppliers', '/admin/suppliers/', ''],
  ['/admin/users', '/admin/users/', ''],
  ['/admin/vendors', '/admin/vendors/', ''],
]

const SUPPLIER_PAGES: RouteSpec[] = [
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

// ---------------------------------------------------------------------------
// Machinery
// ---------------------------------------------------------------------------

const HYDRATION = /hydrat|did not match|Minified React error #(?:418|419|421|422|423|424|425)\b/i

/**
 * Chrome writes a console error for every failed subresource. The document's
 * own 404 on a deliberately bogus token is expected and is not a page defect,
 * so it is filtered when it points at the document URL itself; anything else
 * that fails to load is reported.
 */
function isOwnDocument404(msg: ConsoleMessage, documentUrl: string): boolean {
  return (
    /Failed to load resource: the server responded with a status of 404/.test(msg.text()) &&
    msg.location().url.split('#')[0] === documentUrl.split('#')[0]
  )
}

/**
 * Playwright empties test-results at the start of every run, so a run split
 * into chunks (one per role, to stay inside a shell timeout) loses the rows of
 * every chunk but the last. ROUTE_AUDIT_REPORT points the ledger elsewhere.
 */
const REPORT = process.env.ROUTE_AUDIT_REPORT ?? 'test-results/route-audit.jsonl'
const NOT_FOUND_HEADING = 'הדף שחיפשתם לא נמצא'

function record(row: Row): void {
  try {
    mkdirSync('test-results', { recursive: true })
    appendFileSync(REPORT, `${JSON.stringify(row)}\n`)
  } catch {
    // The report is a convenience; the assertions already carried the result.
  }
}

async function auditPage(page: Page, role: string, spec: RouteSpec): Promise<void> {
  const consoleErrors: string[] = []
  const hydrationWarnings: string[] = []
  const pending: ConsoleMessage[] = []

  const onConsole = (msg: ConsoleMessage) => {
    const text = msg.text()
    if (HYDRATION.test(text)) {
      hydrationWarnings.push(text)
      return
    }
    if (msg.type() === 'error') pending.push(msg)
  }
  const onPageError = (err: Error) => {
    const text = String(err?.message ?? err)
    if (HYDRATION.test(text)) hydrationWarnings.push(text)
    else consoleErrors.push(`pageerror: ${text}`)
  }
  page.on('console', onConsole)
  page.on('pageerror', onPageError)

  let status: number | null = null
  let finalPath = ''
  let rtl: boolean | null = null
  let detail: string | undefined
  try {
    const response = await page.goto(spec.path, { waitUntil: 'load', timeout: 45_000 })
    status = response?.status() ?? null
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
    // Hydration runs after load; give React a beat to report a mismatch.
    await page.waitForTimeout(750)
    const url = new URL(page.url())
    finalPath = url.pathname + url.search
    const documentUrl = page.url()
    for (const msg of pending) {
      if (!isOwnDocument404(msg, documentUrl) || spec.expect.kind !== 'not-found') {
        consoleErrors.push(`${msg.text()} @ ${msg.location().url}`)
      }
    }

    const html = page.locator('html')
    const [dir, lang, bodyDir, appError, notFoundHeading] = await Promise.all([
      html.getAttribute('dir'),
      html.getAttribute('lang'),
      page.evaluate(() => getComputedStyle(document.body).direction),
      page.getByText('Application error: a server-side exception').count(),
      page.getByRole('heading', { name: NOT_FOUND_HEADING }).count(),
    ])
    rtl = dir === 'rtl' && lang === 'he' && bodyDir === 'rtl'
    if (appError > 0) detail = 'Next error page rendered'

    // ---- assertions --------------------------------------------------------
    const problems: string[] = []
    if (spec.expect.kind === 'page') {
      if (status !== 200) problems.push(`status ${status}, expected 200`)
      if (decodeURIComponent(url.pathname) !== spec.path) {
        problems.push(`landed on ${finalPath}, expected to stay`)
      }
    } else if (spec.expect.kind === 'redirect') {
      if (!url.pathname.startsWith(spec.expect.to)) {
        problems.push(`landed on ${finalPath}, expected a redirect to ${spec.expect.to}`)
      }
      if (status !== 200) problems.push(`redirect target answered ${status}`)
    } else if (status !== 404 && !(status === 200 && notFoundHeading > 0)) {
      problems.push(`status ${status}, expected the not-found page`)
    }
    if (!rtl) problems.push(`document is not Hebrew RTL (dir=${dir} lang=${lang} body=${bodyDir})`)
    if (appError > 0) problems.push('Next error page rendered')
    if (consoleErrors.length) problems.push(`${consoleErrors.length} console error(s)`)
    if (hydrationWarnings.length) problems.push(`${hydrationWarnings.length} hydration warning(s)`)

    record({
      role,
      path: spec.path,
      status,
      finalPath,
      outcome: problems.length ? 'FAIL' : 'PASS',
      consoleErrors,
      hydrationWarnings,
      rtl,
      detail: [detail, spec.note].filter(Boolean).join('; ') || undefined,
    })

    expect(
      problems,
      [
        `${role} ${spec.path}`,
        ...problems,
        ...consoleErrors.map((e) => `  console: ${e}`),
        ...hydrationWarnings.map((e) => `  hydration: ${e}`),
      ].join('\n'),
    ).toEqual([])
  } finally {
    page.off('console', onConsole)
    page.off('pageerror', onPageError)
  }
}

/** First link on `listPath` whose href is `${prefix}<one segment>${suffix}`. */
async function discoverDetail(
  page: Page,
  listPath: string,
  prefix: string,
  suffix: string,
): Promise<string | null> {
  await page.goto(listPath, { waitUntil: 'load' })
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
  const hrefs = await page
    .locator(`a[href^="${prefix}"], a[href^="${listPath}?edit="]`)
    .evaluateAll((els) => els.map((el) => el.getAttribute('href') ?? ''))
  const staticTails = new Set(['new', 'import', 'images', 'codes', 'expiry', 'impact', 'lookup'])
  // A list whose rows open an inline editor (`?edit=<id>`) still names the id
  // the detail route takes; nothing else in the app links to that route.
  for (const href of hrefs.map((h) => h.replace(`${listPath}?edit=`, prefix))) {
    const path = href.split('?')[0] ?? ''
    if (!path.startsWith(prefix)) continue
    const tail = path.slice(prefix.length)
    const segment = suffix ? tail.replace(new RegExp(`${suffix}$`), '') : tail
    if (!segment || segment.includes('/') || staticTails.has(segment)) continue
    if (suffix && !tail.endsWith(suffix)) continue
    return `${prefix}${segment}${suffix}`
  }
  return null
}

async function auditDiscovered(
  page: Page,
  role: string,
  discovered: string | null,
  template: string,
): Promise<void> {
  if (!discovered) {
    record({
      role,
      path: template,
      status: null,
      finalPath: '',
      outcome: 'NO DATA',
      consoleErrors: [],
      hydrationWarnings: [],
      rtl: null,
      detail: 'the list page links to no row',
    })
    test.info().annotations.push({ type: 'no-data', description: template })
    return
  }
  await auditPage(page, role, page200(discovered, `discovered for ${template}`))
}

// ---------------------------------------------------------------------------
// Suites
// ---------------------------------------------------------------------------

test.describe.configure({ mode: 'default' })

test.describe('route audit: anonymous', () => {
  let context: BrowserContext
  let page: Page

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem' })
    page = await context.newPage()
  })
  test.afterAll(async () => {
    await context?.close()
  })

  for (const spec of PUBLIC_PAGES) {
    test(`anon ${spec.path}`, async () => {
      await auditPage(page, 'anon', spec)
    })
  }

  test('anon dynamic catalogue routes', async () => {
    // Seven discoveries and seven audits in one test; the 30s default is for one page.
    test.setTimeout(240_000)
    const product = await discoverDetail(page, '/products', '/product/', '')
    await auditDiscovered(page, 'anon', product, '/product/[slug]')
    await auditDiscovered(
      page,
      'anon',
      product ? `${product}/reviews` : null,
      '/product/[slug]/reviews',
    )

    await page.goto('/', { waitUntil: 'load' })
    const categories = await page
      .locator('a[href^="/category/"]')
      .evaluateAll((els) => els.map((el) => (el.getAttribute('href') ?? '').split('?')[0] ?? ''))
    let category: string | null = null
    for (const href of [...new Set(categories)]) {
      if (!href.startsWith('/category/') || href.slice('/category/'.length).includes('/')) continue
      const res = await page.goto(href, { waitUntil: 'load' })
      if (res?.status() === 200) {
        category = href
        break
      }
    }
    await auditDiscovered(page, 'anon', category, '/category/[slug]')

    // No page links to a city; the regions sitemap is the canonical list.
    const regions = await page.request.get('/sitemap/regions.xml')
    const cityLoc = (await regions.text()).match(/<loc>[^<]*?(\/city\/[^<]+)<\/loc>/)
    const city = cityLoc?.[1] ? decodeURIComponent(cityLoc[1]) : null
    await auditDiscovered(page, 'anon', city, '/city/[slug]')
    const coupon = await discoverDetail(page, '/coupons', '/coupons/', '')
    await auditDiscovered(page, 'anon', coupon, '/coupons/[id]')
    const cms = await discoverDetail(page, '/', '/page/', '')
    await auditDiscovered(page, 'anon', cms, '/page/[slug]')
    const storefront = product ? await discoverDetail(page, product, '/s/', '') : null
    await auditDiscovered(page, 'anon', storefront, '/s/[id]')
  })

  for (const path of FILE_AND_API_ROUTES) {
    test(`GET ${path}`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 5 })
      const status = response.status()
      const body = await response.text().catch(() => '')
      record({
        role: 'anon',
        path,
        status,
        finalPath: response.url().replace(/^https?:\/\/[^/]+/, ''),
        outcome: status < 500 && !body.includes('Application error') ? 'PASS' : 'FAIL',
        consoleErrors: [],
        hydrationWarnings: [],
        rtl: null,
      })
      expect(status, `${path} answered ${status}`).toBeLessThan(500)
      expect(body, `${path} rendered the Next error page`).not.toContain(
        'Application error: a server-side exception',
      )
    })
  }
})

function roleSuite(
  role: string,
  email: string,
  password: string,
  pages: RouteSpec[],
  details: Array<[string, string, string]>,
): void {
  test.describe(`route audit: ${role}`, () => {
    let context: BrowserContext
    let page: Page
    let signedIn = false
    let signInError = ''

    test.beforeAll(async ({ browser }) => {
      context = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem' })
      page = await context.newPage()
      try {
        await signInWithEmail(page, email, password)
        // Let the post-login page finish its own fetches before the first
        // audited navigation aborts them; an aborted auth fetch logs a
        // "Failed to fetch" that belongs to the login page, not to the route.
        await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
        signedIn = true
      } catch (error) {
        signedIn = false
        // Recorded on every skipped row: a suite that skips 59 routes because
        // the fixture failed to sign in must say why, not just "skipped".
        signInError = String((error as Error)?.message ?? error).split('\n')[0] ?? ''
      }
    })
    test.afterAll(async () => {
      await context?.close()
    })

    for (const spec of pages) {
      test(`${role} ${spec.path}`, async () => {
        if (!signedIn) {
          record({
            role,
            path: spec.path,
            status: null,
            finalPath: '',
            outcome: 'SKIPPED',
            consoleErrors: [],
            hydrationWarnings: [],
            rtl: null,
            detail: `${role} sign-in failed: ${signInError || 'unknown'}; run pnpm seed:test`,
          })
          test.skip(true, `${role} sign-in failed: ${signInError || 'unknown'}`)
        }
        await auditPage(page, role, spec)
      })
    }

    test(`${role} detail pages discovered from their lists`, async () => {
      test.skip(!signedIn, `${role} sign-in failed: ${signInError || 'unknown'}`)
      // Up to ten list visits and ten audits in one test; the 30s default is for one page.
      test.setTimeout(240_000)
      for (const [list, prefix, suffix] of details) {
        let found = await discoverDetail(page, list, prefix, suffix)
        if (!found && prefix === '/admin/categories/') {
          // The categories table opens an inline editor and nothing in the app
          // links to the detail route; the product form's category select is
          // the one place a category id is written into the DOM.
          const product = await discoverDetail(page, '/admin/products', '/admin/products/', '/edit')
          if (product) {
            await page.goto(product, { waitUntil: 'load' })
            const id = await page
              .locator('select[name="category_id"] option[value]:not([value=""])')
              .first()
              .getAttribute('value')
              .catch(() => null)
            found = id ? `${prefix}${id}${suffix}` : null
          }
        }
        await auditDiscovered(page, role, found, `${prefix}[id]${suffix}`)
      }
    })
  })
}

roleSuite('customer', E2E_CUSTOMER_EMAIL, E2E_CUSTOMER_PASSWORD, CUSTOMER_PAGES, CUSTOMER_DETAILS)
roleSuite('admin', E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, ADMIN_PAGES, ADMIN_DETAILS)
roleSuite('supplier', E2E_SUPPLIER_EMAIL, E2E_SUPPLIER_PASSWORD, SUPPLIER_PAGES, [])
