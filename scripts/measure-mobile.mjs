import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

// Usage:
//   node scripts/measure-mobile.mjs [--width=380] [--url=...] [--out=refs/mine-mobile-380.json]
//   node scripts/measure-mobile.mjs --width=380 --compare
//
// Measures the handheld chrome of a page: header, hamburger, logo, hero, and
// the product grid. Writes JSON in the same shape as refs/electro-mobile-380.json
// so the three sides can be diffed directly.
//
// WHY THE ELECTRO REFS ARE NOT THE ONLY REFERENCE. refs/electro-mobile-380.json
// was measured off electro.madrasthemes.com, the theme demo, NOT off
// kenyonexpress.co.il. STATE already records one case where demo-derived tokens
// were mistaken for live ones (ELECTRO_HERO.slider, 743x377 against live's
// 728x370). `--compare` therefore measures the LIVE site too and prints all
// three, so a difference against the demo is never silently treated as a defect
// against live.

const argOf = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : dflt
}
const hasFlag = (name) => process.argv.includes(`--${name}`)

const width = Number(argOf('width', '380'))
const height = width >= 768 ? 1024 : 820
const LOCAL = process.env.LOCAL_BASE ?? 'http://localhost:3000'
const LIVE = 'https://kenyonexpress.co.il/'

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache
}

/**
 * Runs in the page. Selectors are listed most specific first and the first hit
 * wins, so our markup and the WooCommerce theme's can both be measured by one
 * function without either one's names leaking into the other's result.
 */
function probe() {
  const box = (el) => {
    if (!el) return null
    const r = el.getBoundingClientRect()
    return {
      width: Math.round(r.width * 100) / 100,
      height: Math.round(r.height * 100) / 100,
      x: Math.round(r.x * 100) / 100,
      y: Math.round((r.y + window.scrollY) * 100) / 100,
    }
  }
  const pick = (selectors) => {
    for (const selector of selectors) {
      const el = document.querySelector(selector)
      if (el && el.getBoundingClientRect().height > 0) return { el, selector }
    }
    return { el: null, selector: null }
  }

  const header = pick([
    '.handheld-header-wrap',
    'header#masthead',
    'header[data-site-header]',
    'header',
  ])
  const hamburger = pick([
    'button.navbar-toggle-hamburger',
    'button[aria-label*="תפריט"]',
    'button[aria-label*="menu" i]',
    '[data-mobile-menu-toggle]',
  ])
  const logo = pick([
    '.handheld-header-wrap .navbar-brand',
    'a[href="/"] img',
    '.site-logo img',
    'header img',
  ])
  const hero = pick([
    '[data-hero-slider]',
    '.home-v1-slider',
    'rs-module',
    '.hero',
    'main > section:first-of-type',
  ])

  // The product grid: whichever container holds the most cells.
  const candidates = [
    ...document.querySelectorAll('ul.products, [data-product-grid], .products-grid, .grid'),
  ]
  let grid = null
  let cells = []
  for (const container of candidates) {
    const found = [
      ...container.querySelectorAll('li.product, [data-product-card], article, .product-card'),
    ]
    if (found.length > cells.length) {
      grid = container
      cells = found
    }
  }

  let productCard = null
  if (grid && cells.length > 0) {
    const first = cells[0]
    const style = getComputedStyle(first)
    const tops = [
      ...new Set(cells.slice(0, 12).map((c) => Math.round(c.getBoundingClientRect().top))),
    ]
    const perRow = tops.length > 0 ? Math.round(cells.length / tops.length) : null
    const title = first.querySelector('h2, h3, .product-title, [data-product-title]')
    const price = first.querySelector('.price, [data-price], .amount')
    productCard = {
      containerWidth: Math.round(grid.getBoundingClientRect().width * 100) / 100,
      box: box(first),
      perRow,
      titleFontSize: title ? Math.round(Number.parseFloat(getComputedStyle(title).fontSize)) : null,
      priceFontSize: price ? Math.round(Number.parseFloat(getComputedStyle(price).fontSize)) : null,
      innerBorderRadius: Math.round(Number.parseFloat(style.borderTopLeftRadius) || 0),
    }
  }

  return {
    documentWidth: document.documentElement.scrollWidth,
    // A page wider than its viewport is the defining handheld defect: it makes
    // the whole layout pannable and every tap target move under the finger.
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
    header: { selector: header.selector, box: box(header.el) },
    hamburger: {
      present: Boolean(hamburger.el),
      selector: hamburger.selector,
      box: box(hamburger.el),
    },
    logo: { selector: logo.selector, box: box(logo.el) },
    hero: { selector: hero.selector, box: box(hero.el) },
    productCard,
  }
}

async function measure(context, url, label) {
  const page = await context.newPage()
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(url.includes('kenyonexpress.co.il') ? 4000 : 2500)
    const result = await page.evaluate(probe)
    return { label, url, ...result }
  } catch (error) {
    return { label, url, error: String(error.message).split('\n')[0] }
  } finally {
    await page.close()
  }
}

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width, height },
  deviceScaleFactor: 2,
  isMobile: width < 768,
  hasTouch: true,
  userAgent: IPHONE_UA,
  locale: 'he-IL',
})

const mine = await measure(context, argOf('url', `${LOCAL}/`), 'mine')
const live = hasFlag('compare') ? await measure(context, LIVE, 'live') : null
await browser.close()

const refPath = `refs/electro-${width >= 768 ? 'tablet' : 'mobile'}-${width}.json`
const electro = existsSync(refPath) ? JSON.parse(readFileSync(refPath, 'utf8')) : null

const out = argOf('out', `refs/mine-mobile-${width}.json`)
writeFileSync(out, `${JSON.stringify(mine, null, 2)}\n`)

const cell = (v) => (v === null || v === undefined ? '—' : String(v))
const row = (name, a, b, c) =>
  `${name.padEnd(20)} ${cell(a).padStart(12)} ${cell(b).padStart(12)} ${cell(c).padStart(12)}`

console.log(`\n=== handheld ${width}px ===`)
console.log(row('', 'mine', 'live', 'electro'))
const boxes = ['header', 'hamburger', 'logo', 'hero']
for (const key of boxes) {
  for (const dim of ['height', 'width', 'x', 'y']) {
    const m = mine?.[key]?.box?.[dim]
    const l = live?.[key]?.box?.[dim]
    const e = electro?.[key]?.box?.[dim]
    if (m === undefined && l === undefined && e === undefined) continue
    console.log(row(`${key}.${dim}`, m, l, e))
  }
}
console.log(
  row(
    'card.perRow',
    mine?.productCard?.perRow,
    live?.productCard?.perRow,
    electro?.productCard?.perRow,
  ),
)
console.log(
  row(
    'card.title px',
    mine?.productCard?.titleFontSize,
    live?.productCard?.titleFontSize,
    electro?.productCard?.titleFontSize,
  ),
)
console.log(row('doc width', mine?.documentWidth, live?.documentWidth, electro?.documentWidth))
console.log(row('overflows', mine?.horizontalOverflow, live?.horizontalOverflow, undefined))
if (mine?.error) console.log(`mine error: ${mine.error}`)
if (live?.error) console.log(`live error: ${live.error}`)
console.log(`\nwrote ${out}`)
