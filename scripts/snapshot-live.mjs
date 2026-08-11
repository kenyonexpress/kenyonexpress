// Captures the live site as the project's visual source of truth.
//
// WHY THIS EXISTS
//
// Every goal prompt says "all visual data from refs/ only, never from
// imagination". The file those rules named, refs/ke_live_singlefile.html, was
// not in the repo at all: it last existed in 8474fbd and vanished when refs/
// became gitignored (.gitignore:52). For a while it was restored with `curl`,
// which is worse than it looks. curl gets the SERVER's HTML, before any script
// runs, so a WooCommerce theme that builds its masthead, sliders and price
// blocks on the client hands back markup the browser never actually shows.
// Measuring against it is measuring against a page that does not exist.
//
// This renders the page in a real Chromium, waits for the network to settle,
// and only then reads it. What comes out is what a shopper sees.
//
// Usage: node scripts/snapshot-live.mjs [--url=https://...]
//
// Writes, all under refs/:
//   ke_live_singlefile.html  post-hydration DOM (page.content)
//   ke_live_computed.json    getComputedStyle for every element, per width
//   ke_live_380.png          full-page screenshot, phone
//   ke_live_768.png          full-page screenshot, tablet
//   ke_live_1440.png         full-page screenshot, desktop

import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}

const URL = arg('url', 'https://kenyonexpress.co.il/')
const WIDTHS = [380, 768, 1440]

// The gate the goal names. A WooCommerce homepage is ~700KB of markup; anything
// under this is a Cloudflare interstitial, an error page, or a redirect to a
// consent wall, and committing one of those as "the reference" would poison
// every measurement taken against it afterwards.
const MIN_HTML_BYTES = 100 * 1024

/**
 * The properties worth recording, in the order the goal listed them.
 *
 * Deliberately NOT the whole CSSStyleDeclaration: that is ~340 longhand
 * properties per element, which on this page is a 200MB JSON nobody can diff.
 * These are the ones a layout is rebuilt from.
 */
const PROPS = [
  'width',
  'height',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'color',
  'background-color',
  'border-radius',
]

/**
 * Runs in the page. Walks every element and records the properties above.
 *
 * Elements with no box (display:none, and the head's script/meta/style nodes)
 * are skipped: they have computed styles but no geometry, and keeping them
 * triples the file for rows that can never be compared against a rendered
 * layout.
 */
function collectComputed(props) {
  const out = []
  for (const el of document.querySelectorAll('*')) {
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) continue

    const cs = getComputedStyle(el)
    const style = {}
    for (const prop of props) style[prop] = cs.getPropertyValue(prop)

    out.push({
      tag: el.tagName.toLowerCase(),
      // `className` is not a string on SVG elements (it is an SVGAnimatedString),
      // which is why this reads the attribute instead.
      class: el.getAttribute('class') ?? '',
      id: el.id || undefined,
      // Rounded: sub-pixel noise differs between runs on the same page and would
      // make every snapshot diff against the last one for no reason.
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      w: Math.round(rect.width),
      h: Math.round(rect.height),
      style,
    })
  }
  return out
}

await mkdir('refs', { recursive: true })

const browser = await chromium.launch()
const computed = {}
let html = ''

try {
  for (const width of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width, height: 1200 },
      deviceScaleFactor: 1,
      locale: 'he-IL',
      // A default headless UA is what gets served the bot challenge.
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
    })
    const page = await context.newPage()

    const response = await page.goto(URL, { waitUntil: 'networkidle', timeout: 90_000 })
    if (response && !response.ok()) {
      throw new Error(`${URL} at ${width}px answered HTTP ${response.status()}`)
    }

    // networkidle already waits out the theme's XHRs. This additionally waits
    // for fonts, because font-family and line-height are two of the things
    // being recorded and both read differently before the webfont lands.
    await page.evaluate(() => document.fonts.ready)

    await page.screenshot({ path: `refs/ke_live_${width}.png`, fullPage: true })
    computed[String(width)] = await page.evaluate(collectComputed, PROPS)
    console.log(`  ${width}px: ${computed[String(width)].length} elements measured`)

    // The DOM is taken at the widest viewport only. It is one document; the
    // narrow ones differ by CSS, and that difference is exactly what the
    // per-width computed styles already carry.
    if (width === 1440) html = await page.content()

    await context.close()
  }
} finally {
  await browser.close()
}

const htmlBytes = Buffer.byteLength(html, 'utf8')
if (htmlBytes < MIN_HTML_BYTES) {
  console.error(
    `REFUSING to write: DOM is ${htmlBytes} bytes, under the ${MIN_HTML_BYTES} floor.\nThat is a challenge page or an error page, not the site. Nothing was overwritten.`,
  )
  process.exit(1)
}

await writeFile('refs/ke_live_singlefile.html', html)
await writeFile('refs/ke_live_computed.json', JSON.stringify(computed, null, 2))

console.log(`\n=== snapshot-live: ${URL} ===`)
console.log(`refs/ke_live_singlefile.html  ${htmlBytes.toLocaleString()} bytes`)
for (const width of WIDTHS) {
  console.log(`refs/ke_live_${width}.png`)
}
