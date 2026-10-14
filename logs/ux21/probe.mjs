import { writeFileSync } from 'node:fs'
// UX21 probe: the search results page at 380 / 768 / 1440 on a built server,
// anonymous. Four URLs: a query with results, a query with none, a query
// narrowed by a facet to none, and a too-short query. For each it reads the
// header (H1, count line, whether the engine's name is printed to the
// shopper), whether a control bar exists (sort select, filters link, view
// switcher), where the facet navigation sits relative to the grid and the
// viewport (above or below the first card, inside or outside the first
// screen), whether active-filter chips sit above the grid, whether there is
// any pagination, what the empty state offers (its links, a clear-filters
// action, a verified "did you mean"), and the sidebar's price fields. The
// same script runs before and after, so the two JSON files diff cleanly.
import { chromium } from '@playwright/test'

const BASE = process.env.BASE ?? 'http://localhost:3361'
const TAG = process.env.TAG ?? 'before'
const WIDTHS = (process.env.WIDTHS ?? '380,768,1440').split(',').map(Number)
const CASES = [
  { name: 'results', url: `/search?q=${encodeURIComponent('זוג')}` },
  { name: 'empty', url: `/search?q=${encodeURIComponent('חחחקקק')}` },
  {
    name: 'narrowed-empty',
    url: `/search?q=${encodeURIComponent('זוג')}&city=${encodeURIComponent('חיפה')}`,
  },
  { name: 'too-short', url: '/search?q=a' },
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
  const grid = q('ul.category-products')
  const cards = grid ? [...grid.children] : []
  const firstCard = cards[0] ?? null
  const bar = q('.category-control-bar, .search-control-bar')
  const sort = bar ? bar.querySelector('select') : null
  const filtersLink = bar ? bar.querySelector('a[href^="#"], button[aria-controls]') : null
  const switcher = bar ? bar.querySelector('.category-view-switcher') : null
  const facets = q('.search-facets')
  const facetsDisclosure = q('details.search-filters, details.search-facets')
  const chipsAbove = q('.category-active-filters, .search-active-filters, .search-facets__active')
  const count = q('.category-page__count')
  const pagination = q('.category-pagination, nav[aria-label*="עמוד"], nav[aria-label*="דפדוף"]')
  const empty = q('[data-testid="search-empty-state"]')
  const sidebar = q('.category-sidebar')
  const priceInputs = sidebar ? [...sidebar.querySelectorAll('input')].map((i) => ({ name: i.name || i.id, value: i.value })) : []
  const sidebarSummary = sidebar ? sidebar.querySelector('summary')?.textContent.trim() ?? null : null
  const viewportH = window.innerHeight
  const inFirstScreen = (r) => r ? r.y < viewportH : null
  return {
    h1: q('h1')?.textContent.trim() ?? null,
    countText: count?.textContent.trim() ?? null,
    countEngine: count?.getAttribute('data-engine') ?? null,
    engineInCopy: /Meilisearch|database/i.test(count?.textContent ?? ''),
    cards: cards.length,
    grid: rect(grid),
    firstCard: rect(firstCard),
    bar: bar ? { rect: rect(bar), sort: sort ? { id: sort.id, options: [...sort.options].map((o) => o.textContent.trim()), value: sort.value } : null, filtersLink: filtersLink ? { text: filtersLink.textContent.trim(), rect: rect(filtersLink), visible: filtersLink.getClientRects().length > 0 } : null, switcher: switcher ? { visible: switcher.getClientRects().length > 0 } : null } : null,
    facets: facets ? { rect: rect(facets), aboveGrid: grid ? facets.getBoundingClientRect().y < grid.getBoundingClientRect().y : null, inFirstScreen: inFirstScreen(rect(facets)), sections: [...facets.querySelectorAll('.search-facets__title')].map((t) => t.textContent.trim()), options: facets.querySelectorAll('.search-facets__option').length, firstOption: rect(facets.querySelector('.search-facets__option')) } : null,
    facetsDisclosure: facetsDisclosure ? { open: facetsDisclosure.open, summary: facetsDisclosure.querySelector('summary')?.textContent.trim() ?? null, rect: rect(facetsDisclosure), summaryRect: rect(facetsDisclosure.querySelector('summary')), aboveGrid: grid ? facetsDisclosure.getBoundingClientRect().y < grid.getBoundingClientRect().y : null } : null,
    chipsAbove: chipsAbove ? { cls: chipsAbove.className, rect: rect(chipsAbove), aboveGrid: grid ? chipsAbove.getBoundingClientRect().y < grid.getBoundingClientRect().y : (empty ? chipsAbove.getBoundingClientRect().y < empty.getBoundingClientRect().y : null), chips: [...chipsAbove.querySelectorAll('a')].map((a) => a.textContent.trim()) } : null,
    pagination: pagination ? { rect: rect(pagination), links: [...pagination.querySelectorAll('a')].map((a) => a.textContent.trim()) } : null,
    empty: empty ? { rect: rect(empty), text: [...empty.querySelectorAll('p')].map((p) => p.textContent.trim()).slice(0, 4), links: [...empty.querySelectorAll('a')].map((a) => ({ text: a.textContent.trim(), href: a.getAttribute('href') })), clearAction: [...empty.querySelectorAll('a')].some((a) => /סינון|סינונים/.test(a.textContent)), relaxed: empty.querySelector('.search-empty__relaxed')?.textContent.trim() ?? null } : null,
    sidebar: sidebar ? { rect: rect(sidebar), summary: sidebarSummary, priceInputs } : null,
    live: qa('[aria-live]').filter((el) => main.contains(el)).map((el) => ({ tag: el.tagName, text: el.textContent.trim().slice(0, 80) })),
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
    // 'load' and a settle, not networkidle: the full vitest suite runs beside
    // the after-measurement and a 30s networkidle timed out on the too-short
    // page once; what the probe needs is the streamed body, waited for below.
    const res = await page.goto(`${BASE}${c.url}`, { waitUntil: 'load', timeout: 60000 })
    await page
      .locator(
        '.category-page__count:not(.category-page__count--pending), [data-testid="search-empty-state"]',
      )
      .first()
      .waitFor({ timeout: 30000 })
      .catch(() => {})
    await page.waitForTimeout(600)
    const shape = await page.evaluate(shapeFn)
    shape.status = res?.status() ?? null
    // Facet API: which engine answers, and the shape it returns.
    out[width][c.name] = shape
    if (c.name === 'results' || c.name === 'narrowed-empty') {
      await page.screenshot({ path: `logs/ux21/${TAG}-${width}-${c.name}.png`, fullPage: true })
    }
  }
  // Sort: is there a control, and does changing it change the URL?
  const sort = page.locator('.category-control-bar select, .search-control-bar select').first()
  await page.goto(`${BASE}${CASES[0].url}`, { waitUntil: 'load', timeout: 60000 })
  await page
    .locator('ul.category-products li')
    .first()
    .waitFor({ timeout: 30000 })
    .catch(() => {})
  let sortProbe = null
  if (await sort.count()) {
    const options = await sort.locator('option').evaluateAll((os) => os.map((o) => o.value))
    const target = options.find((v) => /price/.test(v)) ?? options[1]
    await sort.selectOption(target)
    await page.waitForURL((u) => u.search.includes('sort='), { timeout: 8000 }).catch(() => {})
    sortProbe = {
      target,
      url: new URL(page.url()).search,
      firstCard: await page
        .locator('ul.category-products li')
        .first()
        .textContent()
        .catch(() => null),
    }
  }
  out[width].sortProbe = sortProbe
  out[width].errors = errors
  await ctx.close()
}

const api = await fetch(`${BASE}/api/search/facets?q=${encodeURIComponent('זוג')}&limit=1`)
  .then((r) => r.json())
  .catch((e) => ({ error: String(e) }))
out.api = {
  engine: api.engine ?? null,
  total: api.total ?? null,
  facets: Object.keys(api.facets ?? {}),
}

await browser.close()
writeFileSync(`logs/ux21/${TAG}.json`, JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 1).slice(0, 6000))
