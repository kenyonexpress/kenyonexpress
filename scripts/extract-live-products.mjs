// extract-live-products.mjs
//
// What it does:
//   Crawls the LIVE production site https://kenyonexpress.co.il (a Hebrew RTL
//   WooCommerce store) and extracts, for every product tile it finds across the
//   shop and category listing pages: name, price (parsed to a number),
//   image URL, source category, and product URL. Results are written to
//   refs/live-products.json as { extractedAt, count, products: [...] }.
//
// How to run:
//   node scripts/extract-live-products.mjs
//
// IMPORTANT: This script hits the LIVE production website over the network.
// It is NOT part of the normal build/test flow and must be run deliberately.
// It crawls sequentially with a delay between pages, a realistic user agent,
// and a hard page cap, so it stays polite. Do not wire it into CI or hooks.
//
// Note: playwright is provided here via @playwright/test (the package actually
// installed in node_modules), which re-exports chromium. The bare `playwright`
// package is not installed in this repo.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { chromium } from '@playwright/test'

// ---- config ------------------------------------------------------------

const ORIGIN = 'https://kenyonexpress.co.il'
const OUT_PATH = resolve('refs/live-products.json')
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const VIEWPORT = { width: 1440, height: 2200 }
const PAGE_DELAY_MS = 1500 // pause between page loads (be polite)
const MAX_PAGES = 120 // hard cap on total pages fetched (safety valve)
const MAX_PAGINATION_PER_CATEGORY = 25 // stop paginating a category after N pages
const NAV_TIMEOUT = 60000

// Reuse the local Playwright browser cache if present (matches sibling scripts).
if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache
}

// ---- helpers -----------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Parse an ILS price string (e.g. "₪1,299.00", "1,299 ש\"ח") to a number.
// Returns null when no numeric value can be found.
function parsePrice(text) {
  if (!text) return null
  // Collapse whitespace, keep only the first numeric token (sale price shows
  // both original and sale; WooCommerce renders the effective one first via ins).
  const cleaned = String(text).replace(/ /g, ' ').trim()
  const match = cleaned.match(/[\d.,]+/)
  if (!match) return null
  // Normalize: remove thousands separators (commas), keep decimal dot.
  const num = Number(match[0].replace(/,/g, ''))
  return Number.isFinite(num) ? num : null
}

// Load a page, tolerating slow WooCommerce/lazy scripts.
async function gotoTolerant(page, url) {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT })
  } catch {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT })
  }
  // Trigger lazy-loaded images by scrolling to the bottom in steps.
  await autoScroll(page)
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((done) => {
      let total = 0
      const step = 600
      const timer = setInterval(() => {
        window.scrollBy(0, step)
        total += step
        if (total >= document.body.scrollHeight) {
          clearInterval(timer)
          window.scrollTo(0, 0)
          done()
        }
      }, 120)
    })
  })
}

// Discover category listing URLs from the primary nav and /product-category/ links.
async function discoverCategories(page) {
  await gotoTolerant(page, `${ORIGIN}/`)
  const hrefs = await page.evaluate((origin) => {
    const out = new Set()
    for (const a of document.querySelectorAll('a[href*="/product-category/"]')) {
      const href = a.getAttribute('href')
      if (!href) continue
      try {
        const u = new URL(href, origin)
        if (u.hostname.endsWith('kenyonexpress.co.il')) out.add(u.href)
      } catch {
        // ignore malformed hrefs
      }
    }
    return [...out]
  }, ORIGIN)

  // Normalize to the category base path (strip pagination/query fragments) and dedupe.
  const bases = new Set()
  for (const href of hrefs) {
    try {
      const u = new URL(href)
      const m = u.pathname.match(/^(\/product-category\/[^/]+(?:\/[^/]+)*?)\/?$/)
      if (m) bases.add(`${u.origin}${m[1]}/`)
    } catch {
      // ignore
    }
  }
  return [...bases]
}

// Extract product tiles from the currently loaded WooCommerce listing page.
async function extractTiles(page, categoryUrl) {
  return page.evaluate(
    ({ origin, category }) => {
      const items = [...document.querySelectorAll('li.product, ul.products li, .products .product')]
      const seen = new Set()
      const out = []
      for (const el of items) {
        const titleEl =
          el.querySelector('.woocommerce-loop-product__title') ||
          el.querySelector('h2, h3, .product-title, .woocommerce-loop-category__title')
        const name = titleEl ? titleEl.textContent.trim() : null

        const linkEl =
          el.querySelector('a.woocommerce-LoopProduct-link') ||
          el.querySelector('a[href*="/product/"]') ||
          el.querySelector('a[href]')
        const productUrl = linkEl
          ? new URL(linkEl.getAttribute('href'), origin).href
          : null

        const priceEl = el.querySelector('.price')
        // Prefer the sale/effective price when present (ins), else full text.
        const insEl = priceEl ? priceEl.querySelector('ins .amount, ins') : null
        const priceText = insEl
          ? insEl.textContent.trim()
          : priceEl
            ? (priceEl.querySelector('.amount')?.textContent || priceEl.textContent).trim()
            : null

        const imgEl = el.querySelector('img')
        let imageUrl = null
        if (imgEl) {
          const raw =
            imgEl.getAttribute('data-src') ||
            imgEl.getAttribute('data-lazy-src') ||
            imgEl.currentSrc ||
            imgEl.getAttribute('src')
          if (raw && !/^data:image/.test(raw)) {
            try {
              imageUrl = new URL(raw, origin).href
            } catch {
              imageUrl = raw
            }
          }
        }

        // Skip empties and dedupe within the page by product URL (or name).
        const key = productUrl || name
        if (!key || seen.has(key)) continue
        seen.add(key)

        out.push({ name, priceText, imageUrl, productUrl, category })
      }
      return out
    },
    { origin: ORIGIN, category: categoryUrl },
  )
}

// Build a pagination URL for a category. WooCommerce uses /page/N/ by default,
// with ?product-page=N as the AJAX/shortcode fallback.
function pageUrl(categoryUrl, n) {
  if (n <= 1) return categoryUrl
  const base = categoryUrl.endsWith('/') ? categoryUrl : `${categoryUrl}/`
  return `${base}page/${n}/`
}

// ---- main --------------------------------------------------------------

async function main() {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: VIEWPORT,
    locale: 'he-IL',
    deviceScaleFactor: 1,
  })
  const page = await ctx.newPage()

  let pagesFetched = 0
  const byUrl = new Map() // dedupe products across all categories

  try {
    const categories = await discoverCategories(page)
    pagesFetched += 1
    console.log(`discovered ${categories.length} category URLs`)
    for (const c of categories) console.log(`  ${decodeURIComponent(c)}`)

    for (const categoryUrl of categories) {
      if (pagesFetched >= MAX_PAGES) {
        console.log('reached global page cap, stopping')
        break
      }
      const catLabel = decodeURIComponent(categoryUrl)

      for (let n = 1; n <= MAX_PAGINATION_PER_CATEGORY; n++) {
        if (pagesFetched >= MAX_PAGES) break
        const url = pageUrl(categoryUrl, n)
        await sleep(PAGE_DELAY_MS)
        await gotoTolerant(page, url)
        pagesFetched += 1

        const tiles = await extractTiles(page, categoryUrl)
        console.log(`  ${catLabel} page ${n}: ${tiles.length} tiles (fetched ${pagesFetched})`)

        // No products on this page: past the last page, stop paginating.
        if (tiles.length === 0) break

        let added = 0
        for (const t of tiles) {
          const key = t.productUrl || `${categoryUrl}::${t.name}`
          if (byUrl.has(key)) continue
          byUrl.set(key, {
            name: t.name,
            price: parsePrice(t.priceText),
            imageUrl: t.imageUrl,
            category: catLabel,
            productUrl: t.productUrl,
          })
          added += 1
        }
        // If a page added nothing new (WooCommerce can echo the last page for
        // out-of-range N), assume we are done with this category.
        if (added === 0 && n > 1) break
      }
    }
  } finally {
    await browser.close()
  }

  const products = [...byUrl.values()]
  const payload = {
    extractedAt: new Date().toISOString(),
    count: products.length,
    products,
  }

  const dir = dirname(OUT_PATH)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(OUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.log(`\nwrote ${products.length} products to ${OUT_PATH}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
