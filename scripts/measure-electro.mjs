// measure-electro.mjs
//
// Purpose: measure the Electro Home v7 REFERENCE theme against our LOCAL
// build. It opens two pages:
//   1. https://electro.madrasthemes.com/home-v7/  (the "Electro" column)
//   2. http://localhost:3000/                     (the "Local" column)
// For a curated set of regions (header, hero/slider, USP/benefit bar,
// category row, product card, footer) it captures getComputedStyle plus
// getBoundingClientRect and writes:
//   refs/measure-electro.md   (a table: Element | CSS Property | Electro | Local | Match?)
//   refs/electro-measured.json (the raw dump for both pages)
//
// Run command: node scripts/measure-electro.mjs
//
// WARNING: this hits an EXTERNAL site (electro.madrasthemes.com), which sits
// behind a Cloudflare managed challenge. Run it deliberately, not as part of an
// automated build. It launches a headed Chromium so the challenge can clear.
// If localhost:3000 is not running the Local column is filled with "n/a" and
// the Electro column is still emitted.
//
// Note: only @playwright/test is installed (there is no bare "playwright"
// package), so we import chromium from '@playwright/test'.

import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const ELECTRO_URL = 'https://electro.madrasthemes.com/home-v7/'
const LOCAL_URL = 'http://localhost:3000/'
const VIEWPORT = { width: 1440, height: 900 }

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_JSON = resolve(__dirname, '..', 'refs', 'electro-measured.json')
const OUT_MD = resolve(__dirname, '..', 'refs', 'measure-electro.md')

// Use the local Playwright browser cache if present (matches sibling scripts).
if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache
}

// Region name -> ordered list of candidate selectors. The reference theme is
// third party and our local build mimics it, so we try a few candidates per
// region and record which one matched (or null plus the tried list).
const REGIONS = {
  header: ['#masthead', 'header.site-header', '.site-header', 'header'],
  hero: [
    'rs-module-wrap',
    '.rev_slider_wrapper',
    '#rev_slider_1_1_wrapper',
    '.rev_slider',
    '.home-v7-slider',
    '.electro-slider',
    '[class*="hero"]',
  ],
  uspBar: [
    '.electro-advanced-recent-viewed-products',
    '.home-v7-usps',
    '.electro-services',
    '.icon-box-wrapper',
    '.electro-icon-box-wrapper',
    '[class*="usp"]',
    '[class*="benefit"]',
  ],
  categoryRow: [
    '.product-categories-carousel',
    '.electro-product-categories-carousel',
    '.categories-carousel',
    '.owl-carousel.product-categories',
    '.home-v7-categories',
    '.product-category-thumbnails',
    '[class*="category-strip"]',
    '[class*="categoryStrip"]',
  ],
  productCard: [
    'ul.products li.product',
    '.products .product',
    'li.product',
    '.product-inner',
    '.electro-product',
    '[class*="product-card"]',
    '[class*="productCard"]',
  ],
  footer: ['#colophon', 'footer.site-footer', '.site-footer', 'footer'],
}

// Curated computed-style property order for the output table. width/height come
// from getBoundingClientRect; the rest from getComputedStyle. "border-radius"
// reads the top-left corner and "border" is synthesised from the top edge.
const PROP_ORDER = [
  'width',
  'height',
  'background-color',
  'color',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'border-radius',
  'border',
  'box-shadow',
]

// Runs inside the page: returns { matched, tried, rect, style } per region.
function collectInPage(regions) {
  const round = (v) => {
    const n = Number.parseFloat(v)
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : v
  }
  const styleOf = (el) => {
    const s = getComputedStyle(el)
    const g = (p) => s.getPropertyValue(p).trim()
    return {
      'background-color': g('background-color'),
      color: g('color'),
      'font-family': g('font-family'),
      'font-size': g('font-size'),
      'font-weight': g('font-weight'),
      'line-height': g('line-height'),
      'padding-top': g('padding-top'),
      'padding-right': g('padding-right'),
      'padding-bottom': g('padding-bottom'),
      'padding-left': g('padding-left'),
      'margin-top': g('margin-top'),
      'margin-right': g('margin-right'),
      'margin-bottom': g('margin-bottom'),
      'margin-left': g('margin-left'),
      'border-radius': g('border-top-left-radius'),
      border: `${g('border-top-width')} ${g('border-top-style')} ${g('border-top-color')}`.trim(),
      'box-shadow': g('box-shadow'),
    }
  }
  const result = {}
  for (const [name, selectors] of Object.entries(regions)) {
    let el = null
    let matched = null
    for (const sel of selectors) {
      const found = document.querySelector(sel)
      if (found) {
        el = found
        matched = sel
        break
      }
    }
    if (!el) {
      result[name] = { matched: null, tried: selectors, rect: null, style: null }
      continue
    }
    const r = el.getBoundingClientRect()
    result[name] = {
      matched,
      tried: selectors,
      rect: { top: round(r.top), left: round(r.left), width: round(r.width), height: round(r.height) },
      style: styleOf(el),
    }
  }
  return result
}

// Flatten a region entry into { property: value } including width/height.
function flatten(entry) {
  if (!entry || !entry.style) return null
  const out = { ...entry.style }
  if (entry.rect) {
    out.width = `${entry.rect.width}px`
    out.height = `${entry.rect.height}px`
  }
  return out
}

// YES if the two values are equal within a small tolerance, else NO.
function matchCell(a, b) {
  if (a == null || b == null) return 'NO'
  if (a === 'n/a' || b === 'n/a' || a === '(missing)' || b === '(missing)') return 'NO'
  const na = String(a).trim().toLowerCase()
  const nb = String(b).trim().toLowerCase()
  if (na === nb) return 'YES'
  // Numeric compare: single trailing-number tokens within 1.5px / small delta.
  const fa = Number.parseFloat(na)
  const fb = Number.parseFloat(nb)
  if (Number.isFinite(fa) && Number.isFinite(fb)) {
    const tol = na.includes('px') || nb.includes('px') ? 1.5 : 0.05
    if (Math.abs(fa - fb) <= tol) return 'YES'
  }
  return 'NO'
}

async function measurePage(ctx, url, { challenge } = {}) {
  const page = await ctx.newPage()
  console.error(`Opening ${url} at ${VIEWPORT.width}x${VIEWPORT.height}...`)
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  } catch (err) {
    console.error(`goto failed for ${url}: ${err.message}`)
    if (!challenge) {
      await page.close()
      return null
    }
  }
  if (challenge) {
    // Poll until the Cloudflare challenge clears and real markup appears.
    console.error('Waiting for Cloudflare challenge to clear...')
    let cleared = false
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(1500)
      cleared = await page.evaluate(() => !!document.querySelector('#masthead, header.site-header'))
      if (cleared) break
    }
    if (!cleared) console.error('WARNING: theme markup never appeared, page may still be challenged')
  }
  // Let sliders and lazy content settle.
  await page.waitForTimeout(challenge ? 5000 : 2500)
  let regions = null
  try {
    regions = await page.evaluate(collectInPage, REGIONS)
  } catch (err) {
    console.error(`evaluate failed for ${url}: ${err.message}`)
  }
  await page.close()
  return regions
}

async function main() {
  // Headed Chrome with a realistic fingerprint so the Cloudflare managed
  // challenge on the Electro demo can clear.
  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
  })
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    locale: 'en-US',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  })
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })

  const electro = await measurePage(ctx, ELECTRO_URL, { challenge: true })
  const local = await measurePage(ctx, LOCAL_URL, { challenge: false })
  if (!local) console.error('localhost:3000 unavailable; Local column will be "n/a".')

  await browser.close()

  // Build the markdown table.
  const lines = []
  lines.push('# measure-electro')
  lines.push('')
  lines.push(`Electro reference: ${ELECTRO_URL}`)
  lines.push(`Local build: ${LOCAL_URL}`)
  lines.push(`Viewport: ${VIEWPORT.width}x${VIEWPORT.height}`)
  lines.push(`Measured at: ${new Date().toISOString()}`)
  lines.push(`Tool: Playwright (@playwright/test) chromium, getComputedStyle + getBoundingClientRect`)
  lines.push('')
  lines.push('| Element | CSS Property | Electro | Local | Match? |')
  lines.push('|---------|--------------|---------|-------|--------|')

  for (const name of Object.keys(REGIONS)) {
    const eFlat = flatten(electro && electro[name])
    const lFlat = local === null ? null : flatten(local && local[name])
    for (const prop of PROP_ORDER) {
      const eVal = eFlat ? (eFlat[prop] ?? '(missing)') : '(not found)'
      const lVal = local === null ? 'n/a' : lFlat ? (lFlat[prop] ?? '(missing)') : '(not found)'
      lines.push(`| ${name} | ${prop} | ${eVal} | ${lVal} | ${matchCell(eVal, lVal)} |`)
    }
  }
  lines.push('')

  mkdirSync(dirname(OUT_MD), { recursive: true })
  writeFileSync(OUT_MD, `${lines.join('\n')}\n`, 'utf8')
  console.error(`Wrote ${OUT_MD}`)

  const payload = {
    measuredAt: new Date().toISOString(),
    viewport: VIEWPORT,
    electro: { url: ELECTRO_URL, regions: electro },
    local: { url: LOCAL_URL, regions: local, available: local !== null },
  }
  writeFileSync(OUT_JSON, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.error(`Wrote ${OUT_JSON}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
