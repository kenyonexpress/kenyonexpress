import { writeFileSync } from 'node:fs'
// UX25 probe: the page a shopper lands on when a link rots, at 380 / 768 /
// 1440 on a built server, anonymous. Opens an unmatched URL and a dead
// product slug and reads what the 404 offers: the status, the title, whether
// the storefront chrome (header, footer) is there, a search field inside
// main, category links, a home link, every link and button with its box, the
// headings, and page errors. The same script runs before and after.
import { chromium } from '@playwright/test'

const BASE = process.env.BASE ?? 'http://localhost:3364'
const TAG = process.env.TAG ?? 'before'
const WIDTHS = (process.env.WIDTHS ?? '380,768,1440').split(',').map(Number)
const PATHS = ['/this-page-does-not-exist-ux25', '/product/no-such-product-slug-12345']

const browser = await chromium.launch()
const out = {}
const CONSENT = { name: 'ke_consent', value: 'denied.2', domain: 'localhost', path: '/' }

const shapeFn = `(() => {
  const rect = (el) => {
    if (!el) return null
    const b = el.getBoundingClientRect()
    return { x: +b.x.toFixed(1), y: +(b.y + window.scrollY).toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }
  }
  const visible = (el) => !!el && el.getClientRects().length > 0
  const q = (s) => document.querySelector(s)
  const main = q('main') ?? document.body
  const search = main.querySelector('input[type="search"]')
  const catLinks = [...main.querySelectorAll('a[href^="/category/"]')].filter(visible)
  const links = [...main.querySelectorAll('a')].filter(visible).map((a) => ({ href: a.getAttribute('href'), text: a.textContent.trim().slice(0, 40), rect: rect(a) }))
  const buttons = [...main.querySelectorAll('button')].filter(visible).map((b) => ({ text: (b.getAttribute('aria-label') ?? b.textContent).trim().slice(0, 40), rect: rect(b) }))
  return {
    url: location.pathname,
    title: document.title,
    htmlDir: document.documentElement.getAttribute('dir'),
    mainDir: main.getAttribute('dir'),
    robots: q('meta[name="robots"]')?.getAttribute('content') ?? null,
    header: !!q('header'),
    footer: !!q('footer'),
    skipLink: !!q('a[href="#main-content"]'),
    mastheadSearch: !!q('#masthead-search, #handheld-search, button[aria-label*="חיפוש"]'),
    h1: q('h1')?.textContent.trim() ?? null,
    headings: [...main.querySelectorAll('h1, h2, h3')].map((h) => ({ tag: h.tagName, text: h.textContent.trim().slice(0, 60), rect: rect(h) })),
    mainSearch: search ? { id: search.id, role: search.getAttribute('role'), rect: rect(search), label: search.getAttribute('aria-label') ?? search.labels?.[0]?.textContent.trim() ?? null, form: !!search.closest('form'), formAction: search.closest('form')?.getAttribute('action') ?? null } : null,
    categoryLinks: catLinks.map((a) => ({ href: a.getAttribute('href'), text: a.textContent.trim().slice(0, 30), rect: rect(a), img: !!a.querySelector('img') })),
    categorySection: (() => { const s = main.querySelector('[data-not-found-categories]'); return s ? { rect: rect(s), label: s.getAttribute('aria-labelledby') ? document.getElementById(s.getAttribute('aria-labelledby'))?.textContent.trim() : null, columns: getComputedStyle(s.querySelector('ul') ?? s).gridTemplateColumns.split(' ').length } : null })(),
    homeLink: links.find((l) => l.href === '/') ?? null,
    links,
    buttons,
    brandMark: !!main.querySelector('[data-not-found-mark]'),
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
  const w = {}
  out[width] = w
  for (const path of PATHS) {
    const res = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
    const shape = await page.evaluate(shapeFn)
    const key = path.startsWith('/product/') ? 'deadProduct' : 'unmatched'
    w[key] = { status: res?.status() ?? null, ...shape }
    await page.screenshot({ path: `logs/ux25/${TAG}-${width}-${key}.png`, fullPage: true })
    if (shape.mainSearch && key === 'unmatched') {
      // Type a query into the page's own field and read what the combobox does.
      const input = page.locator(`#${shape.mainSearch.id}`)
      await input.fill('ברביקיו')
      await page.waitForTimeout(900)
      const expanded = await input.getAttribute('aria-expanded')
      const options = await page
        .locator(`#${shape.mainSearch.id}-suggestions [role="option"]`)
        .count()
      w.search = { expanded, options }
      await input.press('Enter')
      await page.waitForURL(/\/search\?q=/, { timeout: 8000 }).catch(() => {})
      w.search.urlAfterEnter = new URL(page.url()).pathname + new URL(page.url()).search
    }
  }
  w.errors = errors
  await ctx.close()
}

await browser.close()
writeFileSync(`logs/ux25/${TAG}.json`, JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
