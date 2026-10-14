import { writeFileSync } from 'node:fs'
// UX22 probe: the two archives (a category page and /products) at 380 / 768 /
// 1440 on a built server, anonymous. For each it reads the breadcrumb (its
// crumbs and box), whether a hero banner rendered, the H1 and count line, the
// grid (card count, box, columns read off the first row's y), the pagination
// (box and links), whether a paging-mode switch and a load-more control exist,
// and the bottom count. On /products, which is the only archive with a second
// page in this catalogue (46 active products, 24 a page), it also exercises
// the continuous mode when it exists: chooses it, scrolls to the foot, and
// counts the cards after the next page lands. The same script runs before and
// after, so the two JSON files diff cleanly.
import { chromium } from '@playwright/test'

const BASE = process.env.BASE ?? 'http://localhost:3363'
const TAG = process.env.TAG ?? 'before'
const WIDTHS = (process.env.WIDTHS ?? '380,768,1440').split(',').map(Number)
const CASES = [
  { name: 'category', url: '/category/beauty-health' },
  { name: 'shop', url: '/products' },
  { name: 'shop-page2', url: '/products?page=2' },
]

const browser = await chromium.launch()
const out = {}
const CONSENT = { name: 'ke_consent', value: 'denied.2', domain: 'localhost', path: '/' }

const shapeFn = `(() => {
  const rect = (el) => {
    if (!el) return null
    const b = el.getBoundingClientRect()
    return { x: +b.x.toFixed(1), y: +(b.y + window.scrollY).toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }
  }
  const q = (s) => document.querySelector(s)
  const qa = (s) => [...document.querySelectorAll(s)]
  const main = q('.category-page') ?? q('main') ?? document.body
  const crumb = q('.category-breadcrumb')
  const hero = q('[data-testid="category-hero-banner"]')
  const grid = q('ul.category-products:not([aria-busy="true"])')
  const cards = grid ? [...grid.children] : []
  const firstRowY = cards[0] ? cards[0].getBoundingClientRect().y : null
  const columns = cards.filter((c) => Math.abs(c.getBoundingClientRect().y - firstRowY) < 2).length
  const pagination = q('.category-pagination')
  const pagingSwitch = q('.category-paging-switch')
  const loadMore = q('.category-load-more')
  const counts = qa('.category-page__count:not(.category-page__count--pending)')
  const viewportH = window.innerHeight
  return {
    h1: q('h1')?.textContent.trim() ?? null,
    breadcrumb: crumb ? { rect: rect(crumb), crumbs: [...crumb.querySelectorAll('a, span:not([aria-hidden])')].map((el) => el.textContent.trim()).filter(Boolean), links: [...crumb.querySelectorAll('a')].map((a) => a.getAttribute('href')) } : null,
    hero: hero ? { rect: rect(hero), title: hero.querySelector('h2')?.textContent.trim() ?? null } : null,
    countTop: counts[0]?.textContent.trim() ?? null,
    countBottom: counts[1]?.textContent.trim() ?? null,
    cards: cards.length,
    columns,
    grid: rect(grid),
    firstCard: rect(cards[0]),
    pagination: pagination ? { rect: rect(pagination), visible: pagination.getClientRects().length > 0, links: [...pagination.querySelectorAll('a')].map((a) => ({ text: a.textContent.trim(), href: a.getAttribute('href'), label: a.getAttribute('aria-label') })), current: pagination.querySelector('[aria-current="page"]')?.textContent.trim() ?? null } : null,
    pagingSwitch: pagingSwitch ? { rect: rect(pagingSwitch), buttons: [...pagingSwitch.querySelectorAll('button')].map((b) => ({ text: b.textContent.trim(), pressed: b.getAttribute('aria-pressed'), rect: rect(b) })) } : null,
    loadMore: loadMore ? { rect: rect(loadMore), text: loadMore.textContent.trim(), button: rect(loadMore.querySelector('button')) } : null,
    live: qa('[aria-live]').filter((el) => main.contains(el)).map((el) => ({ tag: el.tagName, text: el.textContent.trim().slice(0, 120) })),
    belowFold: pagination ? pagination.getBoundingClientRect().y + window.scrollY > viewportH : null,
    pageHeight: document.documentElement.scrollHeight,
    scrollWidth: document.documentElement.scrollWidth,
  }
})()`

for (const width of WIDTHS) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: 1,
    locale: 'he-IL',
    hasTouch: width < 768,
  })
  await ctx.addCookies([CONSENT])
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  out[width] = {}
  for (const c of CASES) {
    const res = await page.goto(`${BASE}${c.url}`, { waitUntil: 'load', timeout: 60000 })
    await page
      .locator('ul.category-products:not([aria-busy="true"]) li')
      .first()
      .waitFor({ timeout: 30000 })
      .catch(() => {})
    await page.waitForTimeout(600)
    const shape = await page.evaluate(shapeFn)
    shape.status = res?.status() ?? null
    out[width][c.name] = shape
    if (c.name !== 'shop-page2') {
      await page.screenshot({ path: `logs/ux22/${TAG}-${width}-${c.name}.png`, fullPage: true })
    }
  }

  // Continuous mode, when the page offers it: choose it, scroll to the foot,
  // and read the grid after the next page lands.
  let scrollProbe = null
  await page.goto(`${BASE}/products`, { waitUntil: 'load', timeout: 60000 })
  await page
    .locator('ul.category-products:not([aria-busy="true"]) li')
    .first()
    .waitFor({ timeout: 30000 })
    .catch(() => {})
  const scrollButton = page.locator('.category-paging-switch button[data-paging="scroll"]')
  if (await scrollButton.count()) {
    const before = await page.locator('ul.category-products li').count()
    await scrollButton.click()
    await page.waitForTimeout(300)
    const afterToggle = await page.evaluate(shapeFn)
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await page
      .locator('ul.category-products li')
      .nth(before)
      .waitFor({ timeout: 15000 })
      .catch(() => {})
    await page.waitForTimeout(800)
    const afterLoad = await page.evaluate(shapeFn)
    const stored = await page.evaluate(() => window.localStorage.getItem('ke_catalog_paging_v1'))
    // Reload: the preference survives and the pagination stays hidden.
    await page.reload({ waitUntil: 'load' })
    await page
      .locator('ul.category-products:not([aria-busy="true"]) li')
      .first()
      .waitFor({ timeout: 30000 })
      .catch(() => {})
    await page.waitForTimeout(800)
    const afterReload = await page.evaluate(shapeFn)
    scrollProbe = {
      cardsBefore: before,
      afterToggle: {
        pagination: afterToggle.pagination,
        loadMore: afterToggle.loadMore,
        pagingSwitch: afterToggle.pagingSwitch,
      },
      afterLoad: {
        cards: afterLoad.cards,
        countBottom: afterLoad.countBottom,
        loadMore: afterLoad.loadMore,
        live: afterLoad.live,
        pageHeight: afterLoad.pageHeight,
      },
      stored,
      afterReload: {
        cards: afterReload.cards,
        pagination: afterReload.pagination,
        loadMore: afterReload.loadMore,
        pagingSwitch: afterReload.pagingSwitch,
      },
    }
    await page.screenshot({ path: `logs/ux22/${TAG}-${width}-shop-scroll.png`, fullPage: true })
    await page.evaluate(() => window.localStorage.removeItem('ke_catalog_paging_v1'))
  }
  out[width].scrollProbe = scrollProbe
  out[width].errors = errors
  await ctx.close()
}

const api = await fetch(`${BASE}/api/catalog/page?page=2`)
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }))
  .catch((e) => ({ error: String(e) }))
out.api = {
  status: api.status ?? null,
  items: Array.isArray(api.body?.items) ? api.body.items.length : null,
  total: api.body?.total ?? null,
  totalPages: api.body?.totalPages ?? null,
}

await browser.close()
writeFileSync(`logs/ux22/${TAG}.json`, `${JSON.stringify(out, null, 2)}\n`)
console.log(JSON.stringify(out, null, 1).slice(0, 5000))
