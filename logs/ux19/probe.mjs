import { writeFileSync } from 'node:fs'
// UX19 probe: /account/orders at 380 / 768 / 1440 on a built server, signed
// in as the seeded E2E customer. It reads the shape of the order list: how
// many entries, whether an entry is an article with an order number, a status
// badge group, product names, an expand control (aria-expanded) and a reorder
// button; the first entry's geometry, the width its text column is left with
// next to the actions column, how many lines its meta text wraps to, what
// the expand control opens (lines inside the panel, panel height), and the
// page height. Before and after run the same script, so the JSON diffs.
import { chromium } from '@playwright/test'

const BASE = process.env.BASE ?? 'http://localhost:3358'
const TAG = process.env.TAG ?? 'before'
const WIDTHS = (process.env.WIDTHS ?? '380,768,1440').split(',').map(Number)
const EMAIL = process.env.E2E_CUSTOMER_EMAIL ?? 'e2e-customer@test.kenyonexpress.local'
const PASSWORD = process.env.E2E_CUSTOMER_PASSWORD ?? 'E2eCustomer!pass1'

const browser = await chromium.launch()
const out = {}
const CONSENT = { name: 'ke_consent', value: 'denied.2', domain: 'localhost', path: '/' }

// One login per run, shared across the widths as cookies: the account
// limiter is 20 an hour and three probes a run spent it (measured).
const loginCtx = await browser.newContext({
  extraHTTPHeaders: { 'x-forwarded-for': `10.19.${TAG === 'before' ? 1 : 2}.9` },
})
const loginPage = await loginCtx.newPage()
await loginPage.goto(`${BASE}/login?next=%2Faccount%2Forders`, { waitUntil: 'networkidle' })
await loginPage.getByLabel('אימייל').fill(EMAIL)
await loginPage.getByLabel('סיסמה').fill(PASSWORD)
await loginPage.getByRole('button', { name: 'כניסה', exact: true }).click()
await loginPage.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 })
const session = (await loginCtx.storageState()).cookies
await loginCtx.close()

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
    extraHTTPHeaders: { 'x-forwarded-for': `10.19.${TAG === 'before' ? 1 : 2}.${width % 250}` },
  })
  await ctx.addCookies([CONSENT, ...session])
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.goto(`${BASE}/account/orders`, { waitUntil: 'load' })
  await page
    .locator('.account-nav__list')
    .first()
    .waitFor({ timeout: 15000 })
    .catch(() => {})
  await page.waitForTimeout(300)

  const shape = await page.evaluate(`(() => {
    const rect = ${rectFn}
    const q = (s) => document.querySelector(s)
    const qa = (s) => [...document.querySelectorAll(s)]
    const lines = (el) => {
      if (!el) return null
      const lh = parseFloat(getComputedStyle(el).lineHeight) || 20
      return Math.round(el.getBoundingClientRect().height / lh)
    }
    const entries = qa('.order-card, .account-card > .account-row')
    const first = entries[0] ?? null
    const firstMain = first?.querySelector('.order-card__body, .account-row__main') ?? null
    const firstActions = first?.querySelector('.order-card__actions, .account-row__actions') ?? null
    const expand = first?.querySelector('[aria-expanded]') ?? null
    const widthOf = (el) => (el ? +el.getBoundingClientRect().width.toFixed(1) : null)
    return {
      h1: q('h1')?.textContent.trim() ?? null,
      subtitle: q('.account-subtitle')?.textContent.trim() ?? null,
      entries: entries.length,
      articles: qa('article.order-card').length,
      first: first
        ? {
            tag: first.tagName.toLowerCase(),
            rect: rect(first),
            orderNumber: first.querySelector('.order-card__number')?.textContent.trim() ?? null,
            badges: [...first.querySelectorAll('.account-chip')].map((c) => c.textContent.trim()),
            badgeGroup: Boolean(first.querySelector('.order-card__badges')),
            productNames: [...first.querySelectorAll('.order-card__preview, .order-card__line-name')].map((e) => e.textContent.trim()).slice(0, 3),
            mainWidth: widthOf(firstMain),
            actionsWidth: widthOf(firstActions),
            metaLines: lines(first.querySelector('.account-row__meta, .order-card__meta')),
            expand: expand
              ? { text: expand.textContent.trim(), expanded: expand.getAttribute('aria-expanded'), controls: expand.getAttribute('aria-controls'), rect: rect(expand) }
              : null,
            reorder: [...first.querySelectorAll('button')].map((b) => b.textContent.trim()).find((t) => /הזמנ/.test(t)) ?? null,
            detailsLink: first.querySelector('a[href^="/account/orders/"]')?.textContent.trim() ?? null,
            buttons: [...first.querySelectorAll('button, a.account-btn')].map((b) => ({ text: b.textContent.trim(), rect: rect(b) })),
          }
        : null,
      content: rect(q('.account-content')),
      pageHeight: document.documentElement.scrollHeight,
      scrollWidth: document.documentElement.scrollWidth,
    }
  })()`)

  let opened = null
  const toggle = page.locator('.order-card [aria-expanded]').first()
  if ((await toggle.count()) > 0) {
    await toggle.click()
    await page.waitForTimeout(350)
    opened = await page.evaluate(`(() => {
      const rect = ${rectFn}
      const first = document.querySelector('.order-card')
      const btn = first.querySelector('[aria-expanded]')
      const panel = document.getElementById(btn.getAttribute('aria-controls'))
      return {
        expanded: btn.getAttribute('aria-expanded'),
        text: btn.textContent.trim(),
        panel: panel ? { rect: rect(panel), hidden: panel.hidden, lines: panel.querySelectorAll('.order-card__line').length, lineNames: [...panel.querySelectorAll('.order-card__line-name')].map((e) => e.textContent.trim()), lineChips: [...panel.querySelectorAll('.account-chip')].map((c) => c.textContent.trim()) } : null,
        cardRect: rect(first),
      }
    })()`)
    await page.screenshot({ path: `logs/ux19/${TAG}-${width}-open.png`, fullPage: false })
    await toggle.click()
    await page.waitForTimeout(350)
    opened.collapsedAgain = await toggle.getAttribute('aria-expanded')
  }

  await page.screenshot({ path: `logs/ux19/${TAG}-${width}.png`, fullPage: true })
  out[width] = { ...shape, opened, errors }
  await ctx.close()
}

await browser.close()
writeFileSync(`logs/ux19/${TAG}.json`, `${JSON.stringify(out, null, 2)}\n`)
console.log(JSON.stringify(out, null, 2))
