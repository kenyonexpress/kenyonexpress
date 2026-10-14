import { writeFileSync } from 'node:fs'
// UX27 probe: what a shopper sees WHILE a page loads, at 380 / 768 / 1440 on
// a built server. Five moments, each sampled every ~16ms from the gesture
// until the real content lands, so the gap between "I pressed" and "it
// arrived" is a number and what filled it is a fact:
//
//   accountTab   signed in, /account, press the ההזמנות שלי tab: what the
//                content column holds between the press and the orders h1
//                (nothing, the old overview, or a skeleton).
//   accountHtml  the same page as a direct load, read as a stream: whether
//                the first flush carries an empty content column.
//   loadMore     /products in continuous mode, press טען עוד: whether any
//                card-shaped placeholder sits in the list while page two is
//                fetched, or only the button's label changes.
//   categoryTile /, press the first category tile: what paints between the
//                press and the category grid (the tile's own pending hint,
//                the page shell, the skeleton cards, or nothing).
//   cartFirst    a cart with one line, direct load of /cart: whether the
//                yellow "empty cart" banner paints before the line does, and
//                for how long.
//   cartToCheckout press המשך לתשלום on /cart: what paints before the form.
//
// The same script runs before and after. Login once per run (the limiter is
// 10/h per IP); the account moments are skipped with the reason when the
// seeded customer cannot sign in.
import { chromium } from '@playwright/test'

const BASE = process.env.BASE ?? 'http://localhost:3364'
const TAG = process.env.TAG ?? 'before'
const WIDTHS = (process.env.WIDTHS ?? '380,768,1440').split(',').map(Number)
const CUSTOMER_EMAIL = process.env.E2E_CUSTOMER_EMAIL ?? 'e2e-customer@test.kenyonexpress.local'
const CUSTOMER_PASSWORD = process.env.E2E_CUSTOMER_PASSWORD ?? 'E2eCustomer!pass1'
const SAMPLE_MS = 16
const CONSENT = { name: 'ke_consent', value: 'denied.2', domain: 'localhost', path: '/' }

const browser = await chromium.launch()
const out = { base: BASE, tag: TAG, widths: {} }

/** Samples `fn` in the page every SAMPLE_MS until `done(sample)` or timeout. */
async function sampleUntil(page, fn, done, timeoutMs = 8000) {
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
    await new Promise((r) => setTimeout(r, SAMPLE_MS))
  }
  return { elapsed: Date.now() - t0, samples }
}

const accountContent = () => {
  const c = document.querySelector('.account-content')
  const h1 = document.querySelector('main h1')
  return {
    url: location.pathname,
    h1: h1 ? h1.textContent.trim().slice(0, 40) : null,
    contentChildren: c ? c.children.length : -1,
    contentHeight: c ? Math.round(c.getBoundingClientRect().height) : -1,
    skeleton: !!document.querySelector('[data-account-skeleton]'),
    busy: !!document.querySelector('.account-content [aria-busy="true"]'),
    tabCurrent:
      document.querySelector('.account-tabbar [aria-current="page"]')?.textContent.trim() ?? null,
  }
}

const catalogList = () => {
  const ul = document.querySelector('ul.category-products')
  const btn = document.querySelector('.category-load-more__btn')
  return {
    items: ul ? ul.querySelectorAll('li.category-products__item').length : -1,
    skeletons: ul ? ul.querySelectorAll('.category-card--skeleton').length : -1,
    listHeight: ul ? Math.round(ul.getBoundingClientRect().height) : -1,
    button: btn ? btn.textContent.trim() : null,
    buttonStatus: btn ? btn.getAttribute('data-status') : null,
    busy: !!document.querySelector('.category-load-more[aria-busy="true"]'),
  }
}

const categoryNav = () => {
  const main = document.querySelector('main')
  const h1 = document.querySelector('main h1')
  return {
    url: location.pathname,
    h1: h1 ? h1.textContent.trim().slice(0, 40) : null,
    categoryPage: !!document.querySelector('.category-page'),
    skeletons: document.querySelectorAll('.category-card--skeleton').length,
    cards: document.querySelectorAll('.category-card:not(.category-card--skeleton)').length,
    pendingHint: !!document.querySelector('[data-link-pending="true"]'),
    homeGrid: !!document.querySelector('#home-categories-title'),
    mainHeight: main ? Math.round(main.getBoundingClientRect().height) : -1,
  }
}

const cartState = () => {
  return {
    url: location.pathname,
    empty: !!document.querySelector('.cart-empty'),
    emptyText: document.querySelector('.cart-empty')?.textContent.trim().slice(0, 40) ?? null,
    lines: document.querySelectorAll('.cart-line').length,
    skeleton: !!document.querySelector('[data-cart-skeleton]'),
    h1: document.querySelector('main h1')?.textContent.trim().slice(0, 30) ?? null,
    badge: document.querySelector('[data-cart-count]')?.textContent.trim() ?? null,
  }
}

const checkoutState = () => {
  const main = document.querySelector('main')
  return {
    url: location.pathname,
    h1: document.querySelector('main h1')?.textContent.trim().slice(0, 30) ?? null,
    shell: document.querySelectorAll('.checkout-skeleton__input').length,
    fields: document.querySelectorAll('.checkout-page form input').length,
    steps: document.querySelectorAll('.checkout-steps__item').length,
    cartPage: !!document.querySelector('.cart-page'),
    mainHeight: main ? Math.round(main.getBoundingClientRect().height) : -1,
  }
}

function summarize(run, { from, to }) {
  // The blank window: the first sample after the gesture where `from` is no
  // longer true, until the first where `to` is true.
  const left = run.samples.find((s) => !from(s))
  const arrived = run.samples.find((s) => to(s))
  return {
    elapsed: run.elapsed,
    leftAt: left ? left.t : null,
    arrivedAt: arrived ? arrived.t : null,
    between: run.samples.filter((s) => (!left || s.t >= left.t) && (!arrived || s.t < arrived.t)),
    arrived: arrived ?? null,
  }
}

async function streamAccountHtml(cookies, path) {
  const cookie = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
  const t0 = Date.now()
  const res = await fetch(`${BASE}${path}`, { headers: { cookie, accept: 'text/html' } })
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let html = ''
  let firstChunkAt = null
  let firstChunk = ''
  let contentAt = null
  let skeletonAt = null
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    const text = decoder.decode(value, { stream: true })
    if (firstChunkAt === null) {
      firstChunkAt = Date.now() - t0
      firstChunk = text
    }
    html += text
    if (skeletonAt === null && html.includes('data-account-skeleton')) skeletonAt = Date.now() - t0
    if (contentAt === null && html.includes('class="account-title"')) contentAt = Date.now() - t0
  }
  const contentIdx = firstChunk.indexOf('class="account-content"')
  const afterContent = contentIdx >= 0 ? firstChunk.slice(contentIdx, contentIdx + 400) : null
  return {
    status: res.status,
    firstChunkAt,
    firstChunkBytes: firstChunk.length,
    totalBytes: html.length,
    skeletonAt,
    contentAt,
    firstChunkHasTitle: firstChunk.includes('class="account-title"'),
    firstChunkHasSkeleton: firstChunk.includes('data-account-skeleton'),
    firstChunkContentOpening: afterContent ? afterContent.replace(/\s+/g, ' ').slice(0, 220) : null,
  }
}

async function newContext(width) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: 1,
    locale: 'he-IL',
    hasTouch: width < 768,
  })
  await ctx.addCookies([CONSENT])
  return ctx
}

// One login for the run; cookies copied into each width's context.
let session = null
let loginError = null
{
  const ctx = await newContext(1440)
  const page = await ctx.newPage()
  try {
    await page.goto(`${BASE}/login?next=%2Faccount`)
    await page.getByLabel('אימייל', { exact: true }).fill(CUSTOMER_EMAIL)
    await page.getByLabel('סיסמה', { exact: true }).fill(CUSTOMER_PASSWORD)
    await page.getByRole('button', { name: 'כניסה', exact: true }).click()
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20_000 })
    // The auth cookie lands a beat after the URL does: wait for it, or the
    // copied state is a consent cookie and nothing else.
    await page.waitForLoadState('networkidle')
    for (let i = 0; i < 50; i += 1) {
      const names = (await ctx.cookies()).map((c) => c.name)
      if (names.some((n) => n.startsWith('sb-'))) break
      await new Promise((r) => setTimeout(r, 100))
    }
    session = (await ctx.storageState()).cookies
  } catch (e) {
    loginError = String(e).slice(0, 200)
  }
  await ctx.close()
}
out.login = session ? { ok: true, cookies: session.length } : { ok: false, error: loginError }

for (const width of WIDTHS) {
  const w = { errors: [] }
  out.widths[width] = w
  const ctx = await newContext(width)
  if (session) await ctx.addCookies(session)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => w.errors.push(String(e).slice(0, 120)))
  try {
    // 1. account tab navigation
    if (session) {
      await page.goto(`${BASE}/account`, { waitUntil: 'networkidle' })
      const before = await page.evaluate(accountContent)
      const tab = page.getByRole('navigation', { name: 'אזורי החשבון' }).getByRole('link', {
        name: 'ההזמנות שלי',
      })
      const tabVisible = await tab.isVisible().catch(() => false)
      if (!tabVisible) {
        w.accountTab = { skipped: `no tab bar at ${page.url()}` }
      } else {
        await tab.click()
        const run = await sampleUntil(page, accountContent, (s) => s.h1 === 'ההזמנות שלי')
        w.accountTab = {
          before,
          ...summarize(run, {
            from: (s) => s.h1 === 'האזור האישי' && s.contentChildren === before.contentChildren,
            to: (s) => s.h1 === 'ההזמנות שלי',
          }),
        }
        await page.screenshot({ path: `logs/ux27/${TAG}-${width}-accountTab.png` })
      }
      if (width === WIDTHS[0]) {
        w.accountHtml = await streamAccountHtml(session, '/account/orders')
      }
    } else {
      w.accountTab = { skipped: loginError }
    }

    // 2. catalogue load more
    await page.goto(`${BASE}/products`, { waitUntil: 'networkidle' })
    await page.evaluate(() => window.localStorage.setItem('ke_catalog_paging_v1', 'scroll'))
    await page.reload({ waitUntil: 'networkidle' })
    const btn = page.locator('.category-load-more__btn')
    const hasButton = (await btn.count()) > 0
    if (hasButton) {
      const before = await page.evaluate(catalogList)
      // Page two may already be on its way from the observer: wait for idle.
      await page
        .waitForFunction(
          () =>
            document.querySelector('.category-load-more__btn')?.getAttribute('data-status') ===
            'idle',
          null,
          { timeout: 15_000 },
        )
        .catch(() => {})
      const atIdle = await page.evaluate(catalogList)
      if (atIdle.items === before.items) {
        await btn.evaluate((el) => el.click())
      }
      const run = await sampleUntil(page, catalogList, (s) => s.items > atIdle.items)
      w.loadMore = {
        before: atIdle,
        ...summarize(run, {
          from: (s) => s.buttonStatus === 'idle',
          to: (s) => s.items > atIdle.items,
        }),
      }
      await page.screenshot({ path: `logs/ux27/${TAG}-${width}-loadMore.png` })
    } else {
      w.loadMore = { skipped: 'no continuous control on /products' }
    }

    // 3. category tile from home
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
    const tile = page.locator('section[aria-labelledby="home-categories-title"] a').first()
    await tile.scrollIntoViewIfNeeded()
    const tileHref = await tile.getAttribute('href')
    // A cold route: drop the prefetch cache by opening the tile in a fresh
    // page with scripting intact but before the prefetch could land.
    await tile.click()
    const run3 = await sampleUntil(page, categoryNav, (s) => s.cards > 0 && !s.homeGrid)
    w.categoryTile = {
      href: tileHref,
      ...summarize(run3, { from: (s) => s.homeGrid, to: (s) => s.cards > 0 && !s.homeGrid }),
    }
    await page.screenshot({ path: `logs/ux27/${TAG}-${width}-categoryTile.png` })

    // 4. a cart with one line, direct load of /cart. Numbered paging again, so
    // the archive does not keep fetching while we leave it.
    await page.evaluate(() => window.localStorage.removeItem('ke_catalog_paging_v1'))
    await page.goto(`${BASE}/products`, { waitUntil: 'load' })
    const productLink = page.locator('.category-card__link').first()
    await productLink.waitFor({ state: 'visible', timeout: 15_000 })
    await productLink.click()
    await page.waitForURL(/\/product\//, { timeout: 20_000 })
    const buy = page.getByRole('button', { name: /הוסף לסל|קנה עכשיו/ }).first()
    let cartSeeded = false
    try {
      await buy.waitFor({ state: 'visible', timeout: 10_000 })
      await buy.click()
      await page.waitForSelector('[data-sonner-toast]', { timeout: 10_000 })
      cartSeeded = true
    } catch (e) {
      w.cartSeed = { error: String(e).slice(0, 120) }
    }
    if (cartSeeded) {
      await page.goto(`${BASE}/cart`, { waitUntil: 'commit' })
      const run4 = await sampleUntil(page, cartState, (s) => s.lines > 0, 10_000)
      w.cartFirst = summarize(run4, { from: () => false, to: (s) => s.lines > 0 })
      w.cartFirst.emptyShown = run4.samples.some((s) => s.empty)
      const firstEmpty = run4.samples.find((s) => s.empty)
      const firstLine = run4.samples.find((s) => s.lines > 0)
      w.cartFirst.emptyWindowMs =
        firstEmpty && firstLine ? firstLine.t - firstEmpty.t : firstEmpty ? run4.elapsed : 0
      await page.screenshot({ path: `logs/ux27/${TAG}-${width}-cartFirst.png` })

      // 5. cart -> checkout
      await page.waitForLoadState('load')
      const go = page.getByRole('link', { name: 'המשך לתשלום' }).first()
      await go.waitFor({ state: 'visible', timeout: 15_000 })
      await go.scrollIntoViewIfNeeded()
      await go.click()
      const run5 = await sampleUntil(page, checkoutState, (s) => s.fields > 0, 15_000)
      w.cartToCheckout = summarize(run5, { from: (s) => s.cartPage, to: (s) => s.fields > 0 })
      await page.screenshot({ path: `logs/ux27/${TAG}-${width}-checkout.png` })
    }
  } catch (e) {
    w.failed = String(e).slice(0, 300)
    await page.screenshot({ path: `logs/ux27/${TAG}-${width}-failed.png` }).catch(() => {})
  }

  await ctx.close()
}

await browser.close()
writeFileSync(`logs/ux27/${TAG}.json`, JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
