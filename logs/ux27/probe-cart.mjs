import { writeFileSync } from 'node:fs'
// UX27, the cart moments alone, with the selectors the skeleton made
// necessary: a REAL line is `.cart-line__name` (the skeleton's rows share
// `.cart-line` for their geometry and carry no name). Seeds one line through
// the product page, then (1) loads /cart from a committed navigation and
// samples every ~8ms what the page shows (skeleton / empty / lines), and
// (2) presses המשך לתשלום and samples the checkout link's pending ring until
// the URL changes. No login; three widths.
import { chromium } from '@playwright/test'

const BASE = process.env.BASE ?? 'http://localhost:3364'
const TAG = process.env.TAG ?? 'after'
const WIDTHS = (process.env.WIDTHS ?? '380,768,1440').split(',').map(Number)
const CONSENT = { name: 'ke_consent', value: 'denied.2', domain: 'localhost', path: '/' }

const browser = await chromium.launch()
const out = { base: BASE, tag: TAG, widths: {} }

async function sampleUntil(page, fn, done, timeoutMs = 10000, every = 8) {
  const t0 = Date.now()
  const samples = []
  let last = null
  while (Date.now() - t0 < timeoutMs) {
    let s
    try {
      s = await page.evaluate(fn)
    } catch (e) {
      s = { evalError: String(e).slice(0, 80) }
    }
    const t = Date.now() - t0
    const key = JSON.stringify(s)
    if (key !== last) {
      samples.push({ t, ...s })
      last = key
    }
    if (!s.evalError && done(s)) break
    await new Promise((r) => setTimeout(r, every))
  }
  return { elapsed: Date.now() - t0, samples }
}

const cartState = () => ({
  url: location.pathname,
  parsed: !!document.querySelector('main h1'),
  skeleton: !!document.querySelector('[data-cart-skeleton]'),
  skeletonRows: document.querySelectorAll('[data-cart-skeleton] .cart-line').length,
  empty: !!document.querySelector('.cart-empty'),
  lines: document.querySelectorAll('.cart-line__name').length,
  ring: document.querySelector('.checkout-link__hint')?.getAttribute('data-link-pending') ?? null,
})

const ringState = () => ({
  url: location.pathname,
  ring: document.querySelector('.checkout-link__hint')?.getAttribute('data-link-pending') ?? null,
  live: document.querySelector('[data-checkout-link] output')?.textContent ?? null,
  checkoutShell: document.querySelectorAll('.checkout-skeleton__input').length,
})

for (const width of WIDTHS) {
  const w = { errors: [] }
  out.widths[width] = w
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: 1,
    locale: 'he-IL',
    hasTouch: width < 768,
  })
  await ctx.addCookies([CONSENT])
  const page = await ctx.newPage()
  page.on('pageerror', (e) => w.errors.push(String(e).slice(0, 120)))
  try {
    await page.goto(`${BASE}/products`, { waitUntil: 'load' })
    const productLink = page.locator('.category-card__link').first()
    await productLink.waitFor({ state: 'visible', timeout: 15_000 })
    await productLink.click()
    await page.waitForURL(/\/product\//, { timeout: 20_000 })
    const buy = page.getByRole('button', { name: /הוסף לסל|קנה עכשיו/ }).first()
    await buy.waitFor({ state: 'visible', timeout: 10_000 })
    await buy.click()
    await page.waitForSelector('[data-sonner-toast]', { timeout: 10_000 })

    await page.goto(`${BASE}/cart`, { waitUntil: 'commit' })
    const run = await sampleUntil(page, cartState, (s) => s.lines > 0)
    const firstParsed = run.samples.find((s) => s.parsed)
    const firstSkeleton = run.samples.find((s) => s.skeleton)
    const firstEmpty = run.samples.find((s) => s.empty)
    const firstLines = run.samples.find((s) => s.lines > 0)
    w.cartFirst = {
      parsedAt: firstParsed?.t ?? null,
      skeletonAt: firstSkeleton?.t ?? null,
      skeletonRows: firstSkeleton?.skeletonRows ?? 0,
      emptyAt: firstEmpty?.t ?? null,
      linesAt: firstLines?.t ?? null,
      emptyShown: !!firstEmpty,
      states: run.samples.map((s) => ({
        t: s.t,
        skeleton: s.skeleton,
        empty: s.empty,
        lines: s.lines,
      })),
    }
    await page.screenshot({ path: `logs/ux27/${TAG}-${width}-cartFirst.png` })

    await page.waitForLoadState('load')
    const go = page.getByRole('link', { name: 'המשך לתשלום' }).first()
    await go.scrollIntoViewIfNeeded()
    const ringBefore = await page.evaluate(ringState)
    await go.click()
    const run2 = await sampleUntil(page, ringState, (s) => s.url === '/checkout', 15_000, 4)
    const pendingSeen = run2.samples.filter((s) => s.ring === 'true' && s.url === '/cart')
    w.cartToCheckout = {
      ringBefore,
      pendingFrom: pendingSeen[0]?.t ?? null,
      pendingLive: pendingSeen[0]?.live ?? null,
      urlChangedAt: run2.samples.find((s) => s.url === '/checkout')?.t ?? null,
      shellAtArrival: run2.samples.find((s) => s.url === '/checkout')?.checkoutShell ?? null,
      states: run2.samples,
    }
  } catch (e) {
    w.failed = String(e).slice(0, 300)
  }
  await ctx.close()
}

await browser.close()
writeFileSync(`logs/ux27/${TAG}-cart.json`, JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
