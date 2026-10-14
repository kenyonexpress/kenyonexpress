import { writeFileSync } from 'node:fs'
// UX18 probe: the account area at 380 / 768 / 1440 on a built server, signed
// in as the seeded E2E customer. It reads what the shell offers: whether a
// tab bar exists above the content, its items and which one is current on
// each of the five routes (overview, orders, wishlist, addresses, settings),
// where the side nav and the content column sit (on a phone the thing that
// matters is what comes first), the tab hit sizes, the page height, and what
// /account/wishlist and /account/details answer (a redirect or a page). The
// same script runs before and after, so the two JSON files diff cleanly.
import { chromium } from '@playwright/test'

const BASE = process.env.BASE ?? 'http://localhost:3356'
const TAG = process.env.TAG ?? 'before'
const WIDTHS = (process.env.WIDTHS ?? '380,768,1440').split(',').map(Number)
const EMAIL = process.env.E2E_CUSTOMER_EMAIL ?? 'e2e-customer@test.kenyonexpress.local'
const PASSWORD = process.env.E2E_CUSTOMER_PASSWORD ?? 'E2eCustomer!pass1'
const ROUTES = [
  '/account',
  '/account/orders',
  '/account/wishlist',
  '/account/addresses',
  '/account/details',
  '/account/settings',
]

const browser = await chromium.launch()
const out = {}

const CONSENT = { name: 'ke_consent', value: 'denied.2', domain: 'localhost', path: '/' }

const rectFn = `(el) => {
  if (!el) return null
  const b = el.getBoundingClientRect()
  return { x: +b.x.toFixed(1), y: +(b.y + window.scrollY).toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }
}`

for (const width of WIDTHS) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: 1,
    locale: 'he-IL',
    hasTouch: width < 768,
    // A fresh client IP per width and per tag: the login limiter is 10/h per IP.
    extraHTTPHeaders: { 'x-forwarded-for': `10.18.${TAG === 'before' ? 1 : 2}.${width % 250}` },
  })
  await ctx.addCookies([CONSENT])
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.goto(`${BASE}/login?next=%2Faccount`, { waitUntil: 'networkidle' })
  await page.getByLabel('אימייל').fill(EMAIL)
  await page.getByLabel('סיסמה').fill(PASSWORD)
  await page.getByRole('button', { name: 'כניסה', exact: true }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 })

  const routes = {}
  for (const route of ROUTES) {
    const res = await page.goto(`${BASE}${route}`, { waitUntil: 'load' })
    // Let the streamed side nav land.
    await page
      .locator('.account-nav__list, .cart-page__title')
      .first()
      .waitFor({ timeout: 15000 })
      .catch(() => {})
    await page.waitForTimeout(300)
    const shape = await page.evaluate(`(() => {
      const rect = ${rectFn}
      const vis = (el) => Boolean(el && el.checkVisibility && el.checkVisibility())
      const q = (s) => document.querySelector(s)
      const qa = (s) => [...document.querySelectorAll(s)]
      const tabbar = q('.account-tabbar')
      return {
        title: document.title,
        h1: q('h1')?.textContent.trim() ?? null,
        inAccountShell: Boolean(q('.account-shell')),
        tabbar: tabbar
          ? {
              rect: rect(tabbar),
              label: tabbar.getAttribute('aria-label'),
              items: qa('.account-tabbar__link').map((a) => ({
                text: a.textContent.trim(),
                href: a.getAttribute('href'),
                current: a.getAttribute('aria-current'),
                rect: rect(a),
              })),
              scrollable: tabbar.scrollWidth > tabbar.clientWidth + 1,
            }
          : null,
        sideNav: {
          rect: rect(q('nav.account-nav')),
          items: qa('.account-nav__link').length,
          active: qa('.account-nav__link.is-active').map((a) => a.textContent.trim()),
        },
        content: rect(q('.account-content')),
        pageHeight: document.documentElement.scrollHeight,
        scrollWidth: document.documentElement.scrollWidth,
      }
    })()`)
    routes[route] = {
      status: res?.status() ?? null,
      landed: new URL(page.url()).pathname,
      ...shape,
    }
    if (route === '/account' || route === '/account/orders') {
      await page.screenshot({
        path: `logs/ux18/${TAG}-${width}${route === '/account' ? '' : '-orders'}.png`,
        fullPage: true,
      })
    }
  }

  out[width] = { routes, errors }
  await ctx.close()
}

await browser.close()
writeFileSync(`logs/ux18/${TAG}.json`, `${JSON.stringify(out, null, 2)}\n`)
console.log(JSON.stringify(out, null, 2))
