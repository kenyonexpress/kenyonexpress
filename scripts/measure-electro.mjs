// measure-electro.mjs
//
// Purpose: measure the Electro Home v7 reference theme's key layout regions
// (header, hero/slider, USP/benefit bar, category row, product card, footer)
// and write their getComputedStyle values plus getBoundingClientRect into
// refs/electro-measured.json. This mirrors the intent of MEASURED-LIVE.md
// (getComputedStyle + getBoundingClientRect capture) but targets the external
// Electro demo instead of our own live site.
//
// Run command: node scripts/measure-electro.mjs
//
// WARNING: this hits an EXTERNAL site (electro.madrasthemes.com), which sits
// behind a Cloudflare managed challenge. Run it deliberately, not as part of an
// automated build. It launches a headed Chromium so the challenge can clear.

import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const URL = 'https://electro.madrasthemes.com/home-v7/'
const VIEWPORT = { width: 1440, height: 900 }

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(__dirname, '..', 'refs', 'electro-measured.json')

// Region name -> ordered list of candidate selectors. The theme is third party,
// so selectors are uncertain: we pick the first candidate that matches and
// record which one won (or null plus the tried list when none match).
const REGIONS = {
  header: [
    '#masthead',
    'header.site-header',
    '.site-header',
    'header',
  ],
  hero: [
    'rs-module-wrap',
    '.rev_slider_wrapper',
    '#rev_slider_1_1_wrapper',
    '.rev_slider',
    '.home-v7-slider',
    '.electro-slider',
  ],
  uspBar: [
    '.electro-advanced-recent-viewed-products',
    '.home-v7-usps',
    '.footer-widgets .icon-box',
    '.electro-services',
    '.wpb_row .icon-box',
    '.icon-box-wrapper',
    '.electro-icon-box-wrapper',
  ],
  categoryRow: [
    '.product-categories-carousel',
    '.electro-product-categories-carousel',
    '.categories-carousel',
    '.owl-carousel.product-categories',
    '.home-v7-categories',
    '.product-category-thumbnails',
  ],
  productCard: [
    'ul.products li.product',
    '.products .product',
    'li.product',
    '.product-inner',
    '.electro-product',
  ],
  footer: [
    '#colophon',
    'footer.site-footer',
    '.site-footer',
    'footer',
  ],
}

// Curated computed-style properties captured per element.
const PROPS = [
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
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-right-radius',
  'border-bottom-left-radius',
  'border-top-width',
  'border-top-style',
  'border-top-color',
  'box-shadow',
  'display',
  'gap',
]

async function main() {
  // Headed Chrome with a realistic fingerprint: the live site sits behind a
  // Cloudflare managed challenge that hard blocks plain headless Chromium.
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
  const page = await ctx.newPage()

  console.error(`Opening ${URL} at ${VIEWPORT.width}x${VIEWPORT.height}...`)
  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
  } catch {
    console.error('goto timed out, continuing anyway')
  }

  // Poll until the Cloudflare challenge clears and real theme markup appears.
  console.error('Waiting for Cloudflare challenge to clear...')
  let cleared = false
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(1500)
    cleared = await page.evaluate(
      () => !!document.querySelector('#masthead, header.site-header'),
    )
    if (cleared) break
  }
  if (!cleared) {
    console.error('WARNING: theme markup never appeared, page may still be challenged')
  }

  // Give RevSlider and lazy content a moment to settle before measuring.
  console.error('Waiting 5s for slider/lazy content to settle...')
  await page.waitForTimeout(5000)

  const regions = await page.evaluate(
    ({ REGIONS, PROPS }) => {
      const round = (v) => {
        const n = Number.parseFloat(v)
        return Number.isFinite(n) ? Math.round(n * 100) / 100 : v
      }
      const rectOf = (el) => {
        const r = el.getBoundingClientRect()
        return {
          top: round(r.top),
          left: round(r.left),
          width: round(r.width),
          height: round(r.height),
        }
      }
      const styleOf = (el) => {
        const s = getComputedStyle(el)
        const out = {}
        for (const p of PROPS) out[p] = s.getPropertyValue(p)
        return out
      }

      const result = {}
      for (const [name, selectors] of Object.entries(REGIONS)) {
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
        result[name] = {
          matched,
          tried: selectors,
          rect: rectOf(el),
          style: styleOf(el),
        }
      }
      return result
    },
    { REGIONS, PROPS },
  )

  const payload = {
    measuredAt: new Date().toISOString(),
    url: URL,
    viewport: VIEWPORT,
    regions,
  }

  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.error(`Wrote ${OUT}`)

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
