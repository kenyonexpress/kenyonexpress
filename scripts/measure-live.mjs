// measure-live.mjs
//
// Purpose: measure the LIVE kenyonexpress product page against our LOCAL
// product page. It opens two pages:
//   1. https://kenyonexpress.co.il/product/מוצר-לדוגמא/  (the "Live" column)
//   2. the first local product, discovered by opening
//      http://localhost:3000/products, taking the first a[href*="/product/"],
//      and opening http://localhost:3000<href>          (the "Local" column)
// For a curated set of product regions (breadcrumb, product title h1,
// gallery/main image, price block, add-to-cart/buy box, supplier/vendor info,
// related products heading) it captures getComputedStyle plus
// getBoundingClientRect and writes:
//   refs/measure-live.md    (a table: Element | CSS Property | Live | Local | Match?)
//   refs/live-measured.json (the raw dump for both pages)
//
// Run command: node scripts/measure-live.mjs
//
// WARNING: this hits the EXTERNAL live site (kenyonexpress.co.il). Run it
// deliberately. If localhost:3000 is not running, or no local product can be
// discovered, the Local column is filled with "n/a" and the Live column is
// still emitted.
//
// Note: only @playwright/test is installed (there is no bare "playwright"
// package), so we import chromium from '@playwright/test'.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const SLUG = encodeURIComponent('מוצר-לדוגמא')
const LIVE_URL = `https://kenyonexpress.co.il/product/${SLUG}/`
const LOCAL_ORIGIN = 'http://localhost:3000'
const LOCAL_PRODUCTS_URL = `${LOCAL_ORIGIN}/products`
const VIEWPORT = { width: 1440, height: 900 }

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_JSON = resolve(__dirname, '..', 'refs', 'live-measured.json')
const OUT_MD = resolve(__dirname, '..', 'refs', 'measure-live.md')

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache
}

// Region name -> ordered candidate selectors (WooCommerce/Electro on live,
// mirrored by the local build). First match wins; the winner is recorded.
const REGIONS = {
  breadcrumb: [
    '.woocommerce-breadcrumb',
    'nav.woocommerce-breadcrumb',
    '.breadcrumb',
    '[class*="breadcrumb"]',
  ],
  productTitle: ['h1.product_title', '.product_title', 'h1.entry-title', 'main h1', 'h1'],
  gallery: [
    '.woocommerce-product-gallery__image img',
    '.woocommerce-product-gallery img',
    '.product-gallery img',
    'figure.woocommerce-product-gallery__wrapper img',
    '[class*="gallery"] img',
  ],
  priceBlock: ['.summary .price', 'p.price', '.product .price', '.price', '[class*="price"]'],
  buyBox: [
    'form.cart .single_add_to_cart_button',
    '.single_add_to_cart_button',
    'button[name="add-to-cart"]',
    'form.cart button',
    '[class*="add-to-cart"] button',
    '[class*="add-to-cart"]',
  ],
  supplierInfo: [
    '.product_meta',
    '.vendor',
    '.wcfmmp-store-info',
    '.product_meta .posted_in',
    '[class*="vendor"]',
    '[class*="supplier"]',
  ],
  relatedHeading: [
    '.related.products > h2',
    '.related.products h2',
    'section.related h2',
    '.up-sells h2',
    '[class*="related"] h2',
  ],
}

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
      rect: {
        top: round(r.top),
        left: round(r.left),
        width: round(r.width),
        height: round(r.height),
      },
      style: styleOf(el),
    }
  }
  return result
}

function flatten(entry) {
  if (!entry || !entry.style) return null
  const out = { ...entry.style }
  if (entry.rect) {
    out.width = `${entry.rect.width}px`
    out.height = `${entry.rect.height}px`
  }
  return out
}

function matchCell(a, b) {
  if (a == null || b == null) return 'NO'
  if (a === 'n/a' || b === 'n/a' || a === '(missing)' || b === '(missing)') return 'NO'
  const na = String(a).trim().toLowerCase()
  const nb = String(b).trim().toLowerCase()
  if (na === nb) return 'YES'
  const fa = Number.parseFloat(na)
  const fb = Number.parseFloat(nb)
  if (Number.isFinite(fa) && Number.isFinite(fb)) {
    const tol = na.includes('px') || nb.includes('px') ? 1.5 : 0.05
    if (Math.abs(fa - fb) <= tol) return 'YES'
  }
  return 'NO'
}

async function gotoSettled(page, url, timeout = 60000) {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout })
  } catch {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout })
  }
}

async function measureLive(ctx) {
  const page = await ctx.newPage()
  console.error(`Opening LIVE ${LIVE_URL} ...`)
  try {
    await gotoSettled(page, LIVE_URL)
  } catch (err) {
    console.error(`live goto failed: ${err.message}`)
    await page.close()
    return null
  }
  await page.waitForTimeout(4000)
  let regions = null
  try {
    regions = await page.evaluate(collectInPage, REGIONS)
  } catch (err) {
    console.error(`live evaluate failed: ${err.message}`)
  }
  await page.close()
  return regions
}

async function measureLocal(ctx) {
  const page = await ctx.newPage()
  console.error(`Discovering first local product at ${LOCAL_PRODUCTS_URL} ...`)
  try {
    await gotoSettled(page, LOCAL_PRODUCTS_URL, 30000)
  } catch (err) {
    console.error(`localhost:3000 unavailable: ${err.message}`)
    await page.close()
    return { url: null, regions: null }
  }
  await page.waitForTimeout(1500)
  let href = null
  try {
    href = await page.evaluate(() => {
      const a = document.querySelector('a[href*="/product/"]')
      return a ? a.getAttribute('href') : null
    })
  } catch {
    href = null
  }
  if (!href) {
    console.error('No local product link (a[href*="/product/"]) found.')
    await page.close()
    return { url: null, regions: null }
  }
  const localUrl = href.startsWith('http')
    ? href
    : `${LOCAL_ORIGIN}${href.startsWith('/') ? '' : '/'}${href}`
  console.error(`Opening LOCAL product ${localUrl} ...`)
  try {
    await gotoSettled(page, localUrl, 30000)
  } catch (err) {
    console.error(`local product goto failed: ${err.message}`)
    await page.close()
    return { url: localUrl, regions: null }
  }
  await page.waitForTimeout(2000)
  let regions = null
  try {
    regions = await page.evaluate(collectInPage, REGIONS)
  } catch (err) {
    console.error(`local evaluate failed: ${err.message}`)
  }
  await page.close()
  return { url: localUrl, regions }
}

async function main() {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 })

  const live = await measureLive(ctx)
  const local = await measureLocal(ctx)
  const localAvailable = local.regions !== null
  if (!localAvailable) console.error('Local product unavailable; Local column will be "n/a".')

  await browser.close()

  const lines = []
  lines.push('# measure-live')
  lines.push('')
  lines.push(`Live reference: ${LIVE_URL}`)
  lines.push(`Local product: ${local.url || '(none discovered)'}`)
  lines.push(`Viewport: ${VIEWPORT.width}x${VIEWPORT.height}`)
  lines.push(`Measured at: ${new Date().toISOString()}`)
  lines.push(
    'Tool: Playwright (@playwright/test) chromium, getComputedStyle + getBoundingClientRect',
  )
  lines.push('')
  lines.push('| Element | CSS Property | Live | Local | Match? |')
  lines.push('|---------|--------------|------|-------|--------|')

  for (const name of Object.keys(REGIONS)) {
    const liveFlat = flatten(live?.[name])
    const localFlat = localAvailable ? flatten(local.regions?.[name]) : null
    for (const prop of PROP_ORDER) {
      const lvVal = liveFlat ? (liveFlat[prop] ?? '(missing)') : '(not found)'
      const loVal = !localAvailable
        ? 'n/a'
        : localFlat
          ? (localFlat[prop] ?? '(missing)')
          : '(not found)'
      lines.push(`| ${name} | ${prop} | ${lvVal} | ${loVal} | ${matchCell(lvVal, loVal)} |`)
    }
  }
  lines.push('')

  mkdirSync(dirname(OUT_MD), { recursive: true })
  writeFileSync(OUT_MD, `${lines.join('\n')}\n`, 'utf8')
  console.error(`Wrote ${OUT_MD}`)

  const payload = {
    measuredAt: new Date().toISOString(),
    viewport: VIEWPORT,
    live: { url: LIVE_URL, regions: live },
    local: { url: local.url, regions: local.regions, available: localAvailable },
  }
  writeFileSync(OUT_JSON, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.error(`Wrote ${OUT_JSON}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
