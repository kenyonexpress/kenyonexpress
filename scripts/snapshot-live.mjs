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
// This renders each page in a real Chromium, waits for the network to settle,
// and only then reads it. What comes out is what a shopper sees.
//
// Usage:
//   node scripts/snapshot-live.mjs                  all seven pages
//   node scripts/snapshot-live.mjs --page=home      one page
//   node scripts/snapshot-live.mjs --no-shots       skip the PNGs (much faster)
//
// Writes, all under refs/:
//   ke_live_computed.json      { page: { width: [ ...elements ] } }, every page
//   ke_live_singlefile.html    the HOME DOM, post-hydration (name kept: the
//                              project rules and older scripts still cite it)
//   ke_live_<page>.html        post-hydration DOM, one per page
//   ke_live_<page>_<w>.png     full-page screenshot, unless --no-shots

import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
// Shared with compare.mjs on purpose: the reference and the page scored against
// it have to be read by the same walker, or the difference between the two
// readers gets reported as a difference between the two designs.
import { PROPS, collectComputed } from './lib/computed.mjs'
import { freezeHero, loadLazyContent } from './lib/settle.mjs'

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}

const WIDTHS = [380, 768, 1440]
// The viewport height compare.mjs scores at. Matched on purpose: a reference
// captured at another viewport is a reference of a different render, and any
// element sized in vh would differ for that reason alone.
const SHOT_HEIGHT = 2600
const SHOTS = !process.argv.includes('--no-shots')

/**
 * The seven pages compare.mjs knows, with the live URL each one is scored
 * against. Kept in step with scripts/compare.mjs deliberately: if these two
 * lists drift, the reference is no longer of the page being measured.
 *
 * `seedCart` marks the two pages that render nothing useful until WooCommerce
 * has a cart cookie. Both of them DO render when empty rather than redirecting,
 * which is the trap: an empty reference scored against a filled local page
 * produces a number that means nothing.
 */
const SEARCH_Q = process.env.COMPARE_SEARCH_Q ?? 'אוזניות'
const LIVE_ATC_ID = process.env.LIVE_ATC_ID ?? '6166'

const PAGES = {
  home: { url: 'https://kenyonexpress.co.il/' },
  product: { url: 'https://kenyonexpress.co.il/product/מוצר-לדוגמא/' },
  category: { url: 'https://kenyonexpress.co.il/product-category/hot-deals/' },
  products: { url: 'https://kenyonexpress.co.il/shop/' },
  // Live search is a WordPress query string, not a route.
  search: {
    url: `https://kenyonexpress.co.il/?s=${encodeURIComponent(SEARCH_Q)}&post_type=product`,
  },
  cart: { url: 'https://kenyonexpress.co.il/cart/', seedCart: true },
  checkout: { url: 'https://kenyonexpress.co.il/checkout/', seedCart: true },
}

const only = arg('page', null)
if (only && !PAGES[only]) {
  console.error(`unknown --page=${only} (use ${Object.keys(PAGES).join(', ')})`)
  process.exit(2)
}
const TARGETS = only ? [only] : Object.keys(PAGES)

// The gate the goal names. A WooCommerce page is hundreds of KB of markup;
// anything under this is a Cloudflare interstitial, an error page, or a
// redirect to a consent wall, and committing one of those as "the reference"
// would poison every measurement taken against it afterwards.
const MIN_HTML_BYTES = 100 * 1024

const COMPUTED_PATH = 'refs/ke_live_computed.json'

/**
 * Puts one line in WooCommerce's cart so /cart and /checkout have something to
 * render. `waitUntil: 'commit'` on purpose: the only thing this navigation is
 * for is the Set-Cookie on the response, and waiting for the 4.5MB homepage
 * behind it to go idle is waiting for something the seed never uses. compare.mjs
 * learned that the slow way, at a two minute timeout.
 */
async function seedWooCart(context) {
  const page = await context.newPage()
  try {
    await page.goto(`https://kenyonexpress.co.il/?add-to-cart=${LIVE_ATC_ID}&quantity=1`, {
      waitUntil: 'commit',
      timeout: 60_000,
    })
    await page.waitForTimeout(3000)
  } finally {
    await page.close()
  }
}

await mkdir('refs', { recursive: true })

const browser = await chromium.launch()
/** page -> width -> elements */
const computed = {}
/** page -> post-hydration DOM */
const html = {}

try {
  for (const name of TARGETS) {
    const spec = PAGES[name]
    computed[name] = {}

    for (const width of WIDTHS) {
      const context = await browser.newContext({
        viewport: { width, height: SHOT_HEIGHT },
        deviceScaleFactor: 1,
        locale: 'he-IL',
        // A default headless UA is what gets served the bot challenge.
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
      })

      if (spec.seedCart) await seedWooCart(context)

      const page = await context.newPage()
      const response = await page.goto(spec.url, { waitUntil: 'networkidle', timeout: 120_000 })
      if (response && !response.ok()) {
        throw new Error(`${name} at ${width}px answered HTTP ${response.status()}`)
      }

      // networkidle already waits out the theme's XHRs. This additionally waits
      // for fonts, because font-family and line-height are two of the things
      // being recorded and both read differently before the webfont lands.
      await page.evaluate(() => document.fonts.ready)

      // Settle BEFORE anything is recorded, so the screenshot and the style
      // walk describe the same page. They did not: home was photographed at
      // 4968px and measured at 5493px, because the screenshot's own scroll was
      // what loaded the last 525px. See scripts/lib/settle.mjs.
      await page.evaluate(loadLazyContent)
      await page.waitForLoadState('networkidle').catch(() => {})
      await page.evaluate(freezeHero)
      await page.waitForTimeout(1200) // the theme's 700ms slide fade, plus room

      if (SHOTS) {
        await page.screenshot({ path: `refs/ke_live_${name}_${width}.png`, fullPage: true })
      }
      computed[name][String(width)] = await page.evaluate(collectComputed, PROPS)

      // The DOM is taken at the widest viewport only. It is one document; the
      // narrow ones differ by CSS, and that difference is exactly what the
      // per-width computed styles already carry.
      if (width === 1440) html[name] = await page.content()

      await context.close()
    }

    const counts = WIDTHS.map((w) => computed[name][String(w)].length).join(' / ')
    console.log(`  ${name.padEnd(9)} ${counts} elements   ${html[name].length.toLocaleString()} B`)
  }
} finally {
  await browser.close()
}

// Every page is gated, not just home. A challenge page on /checkout is exactly
// as poisonous as one on the homepage, and it is likelier: that is the route
// with the bot protection on it.
const thin = Object.entries(html).filter(
  ([, doc]) => Buffer.byteLength(doc, 'utf8') < MIN_HTML_BYTES,
)
if (thin.length > 0) {
  console.error('REFUSING to write. These came back under the 100KB floor:')
  for (const [name, doc] of thin) {
    console.error(`  ${name}: ${Buffer.byteLength(doc, 'utf8')} bytes`)
  }
  console.error('That is a challenge page or an error page, not the site. Nothing was overwritten.')
  process.exit(1)
}

for (const [name, doc] of Object.entries(html)) {
  await writeFile(`refs/ke_live_${name}.html`, doc)
  // The name the project rules and the older scripts still cite.
  if (name === 'home') await writeFile('refs/ke_live_singlefile.html', doc)
}

// MERGED, not replaced. `--page=home` used to write a file containing only
// home, silently deleting the other six pages' reference data -- and the
// script's own success message gave no hint that it had. Every page but the
// one being refreshed is carried over.
//
// The pages captured in THIS run overwrite their old entries wholesale rather
// than being merged per width, so a page can never end up half fresh and half
// stale at different viewports.
let merged = computed
if (existsSync(COMPUTED_PATH)) {
  try {
    merged = { ...JSON.parse(await readFile(COMPUTED_PATH, 'utf8')), ...computed }
  } catch (unreadable) {
    console.log(`  NOTE: ${COMPUTED_PATH} was unreadable (${unreadable.message}); writing fresh.`)
  }
}
const carried = Object.keys(merged).filter((name) => !TARGETS.includes(name))
if (carried.length > 0) console.log(`  carried over, not re-captured: ${carried.join(', ')}`)

// Not pretty-printed. Indentation was 60% of this file at seven pages, and
// nothing reads it by eye.
await writeFile(COMPUTED_PATH, JSON.stringify(merged))

console.log('\n=== snapshot-live ===')
for (const name of TARGETS) {
  console.log(`refs/ke_live_${name}.html`)
}
console.log('refs/ke_live_computed.json')
