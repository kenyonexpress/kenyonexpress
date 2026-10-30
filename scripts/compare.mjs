import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync, rmSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'
import { parseCompareArgs } from './compare-args.mjs'
import { loadShortfall, ownSideCaveat } from './load-shortfall.mjs'
import { defaultBaselineFor, recaptureHint } from './parity-baseline.mjs'
import { appendParityFailure } from './parity-log.mjs'

// Usage: node scripts/compare.mjs [--page=home|product|category|products|search|cart|checkout|account|supplier]
//                                 [--live=<url>] [--mine=<url>]
// home     : live = LIVE_HOME below                  mine = http://localhost:3000/
// product  : live = live kenyonexpress product page mine = http://localhost:3000/product/<slug>
// category : live = live product-category archive   mine = http://localhost:3000/category/<slug>
// coupon   : live coupon PDP vs local coupon product (QR customer page needs auth; PDP is the public surface)
// account  : live WP /my-account/ vs local /account (set COMPARE_STORAGE_STATE for an authed session)
// supplier : live Next.js baseline vs local /supplier (requires --baseline flag)
// Writes refs/live.png + refs/mine.png (consumed by diff-bands.mjs), plus
// page-suffixed copies refs/live-<page>.png / refs/mine-<page>.png for reference.

// `--name=value` AND `--name value`, because the second form used to be found
// by nothing and fall silently to its default. That is not a cosmetic parser
// gap: `--live-png refs/ke_live_1440.png` did not substitute the capture, it
// left LIVE_PNG null, navigated to the live host instead, and refused with exit
// 5 -- a refusal blaming the reference for a space in the calling shell.
const argOf = (name, dflt) => {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`))
  if (eq) return eq.slice(name.length + 3)
  const flag = process.argv.indexOf(`--${name}`)
  if (flag !== -1) {
    const next = process.argv[flag + 1]
    if (next && !next.startsWith('--')) return next
  }
  return dflt
}
const page = argOf('page', 'home')
// F43: the flags the goal queue uses (`--widths=`, `--baseline=`, `--live-url=`)
// are parsed in compare-args.mjs, with their meaning and a test. Unknown flags
// used to be ignored in silence; these three now do what they say.
const ARGS = parseCompareArgs(process.argv.slice(2))
// Width is an argument because the gate is quoted at three widths (380, 768,
// 1440) and this was hardcoded to 1440, so the two phone widths had never once
// been measured. Height stays 2600: the diff is banded down the page and the
// bands must line up run to run for the numbers to be comparable.
const VIEW = { width: ARGS.width, height: 2600 }

// A BARE RUN HAS A REFERENCE (KEN-8): the page's frozen Electro capture from
// scripts/parity-baseline.mjs. An explicit `--live=<url>` still navigates, and
// `--baseline=` / `--live-png=` still win. cart and checkout have no default
// capture and keep refusing until one is made. `{width}` expands to this run's.
const LIVE_PNG =
  defaultBaselineFor(page, {
    live: argOf('live', null),
    livePng: ARGS.baseline?.path ?? argOf('live-png', null),
  })?.replaceAll('{width}', String(VIEW.width)) ?? null

// `--widths=380,768,1440` is one run per width, in order, each a child with the
// same arguments and a singular `--width=`. The parent exits with the first
// non-zero code. Nothing else is shared: each child shoots, diffs and writes
// its own ledger row, exactly as a hand-typed run would.
if (ARGS.widths.length > 1) {
  const rest = process.argv.slice(2).filter((a) => !a.startsWith('--widths='))
  for (const w of ARGS.widths) {
    const code = await new Promise((done) =>
      spawn(process.execPath, [process.argv[1], ...rest, `--width=${w}`], {
        stdio: 'inherit',
        cwd: process.cwd(),
      }).on('exit', done),
    )
    if (code !== 0) process.exit(code ?? 1)
  }
  process.exit(0)
}
const LOCAL = process.env.LOCAL_BASE ?? 'http://localhost:3000'
const LIVE_HOME = 'https://kenyonexpress.co.il/'
const LIVE_PRODUCT = 'https://kenyonexpress.co.il/product/מוצר-לדוגמא/'
// The category reference is the same archive the tokens in refs/category-tokens.json
// were extracted from, so measurements and the pixel diff describe one page.
const LIVE_CATEGORY = 'https://kenyonexpress.co.il/product-category/hot-deals/'
const LOCAL_CATEGORY_SLUG = process.env.COMPARE_CATEGORY_SLUG ?? 'hot-deals'
// Which local product the product run screenshots. It defaults to the SAME slug
// as LIVE_PRODUCT above, because the live reference and our copy of it are the
// only pair whose difference is a fidelity score at all. The default used to be
// "discover one", which is reproducible only while the catalogue keeps its
// order -- and [66] imported 19 products and changed it. Measured on 2026-08-07
// against one build and one server: discovery picked `צימר-מאסטר` and reported
// 18.73%, the pinned reference product reported 14.08%. Nothing in the page
// differed; 4.65 points were the pick.
const COMPARE_PRODUCT_SLUG = process.env.COMPARE_PRODUCT_SLUG ?? 'מוצר-לדוגמא'
// /products is our rebuild of the live /shop/ archive.
const LIVE_PRODUCTS = 'https://kenyonexpress.co.il/shop/'
// Live search is a WordPress query string, not a route.
const COMPARE_QUERY = process.env.COMPARE_SEARCH_Q ?? 'אוזניות'
const LIVE_SEARCH = `https://kenyonexpress.co.il/?s=${encodeURIComponent(COMPARE_QUERY)}&post_type=product`
const LIVE_CHECKOUT = 'https://kenyonexpress.co.il/checkout/'
const LIVE_CART = 'https://kenyonexpress.co.il/cart/'
// WooCommerce's plain add-to-cart GET. Any published product works; this one is
// the same id refs/checkout-measured.json was measured against, so the order
// panel holds one line on both runs.
const LIVE_ATC_ID = process.env.LIVE_ATC_ID ?? '6166'
// THE LIVE REFERENCE NO LONGER EXISTS, AND THE CONSTANTS ABOVE ARE NOW ARCHIVE
// LABELS RATHER THAN FETCH TARGETS.
//
// kenyonexpress.co.il stopped serving WordPress: the DNS was cut to Vercel and
// the host now serves THIS app. Measured 2026-09-08 - zero `wp-content`
// markers, 158 `_next/static` ones, and every /wp-content/uploads/ path
// answering 403. Left pointing at the network, this gate compared our local
// build against our own production deployment and still printed a percentage:
// 39.76% at 380px, with the height-ratio guard firing at 1.80x.
//
// A fidelity score against yourself is worse than no score, so the default is
// now the snapshot taken while the site WAS live, localized by
// scripts/localize-live-refs.mjs so its imagery resolves from refs/live-assets/
// instead of from a host that 403s.
//
// `--live=<url>` still overrides, and `COMPARE_USE_NETWORK=1` restores the old
// behaviour for the day the reference is hosted somewhere again.
//
// THE SNAPSHOT IS DEGRADED, AND THE NUMBER IT PRODUCES IS NOT THE OLD NUMBER.
// Measured 2026-09-08 by loading refs/localized/ke_live_home.html in Chromium:
// 49 images, ZERO broken - the localizer did its job on imagery - but 96 failed
// requests. `localize-live-refs.mjs` rewrites only `IMAGE_EXT`, so everything
// else still resolves to kenyonexpress.co.il/wp-content/, which is gone.
//
// CORRECTED 2026-09-08, same day, by counting them instead of describing them.
// This block said all 96 were fonts. The count was right and the attribution
// was not. Deterministic over four runs at 380 and 1440:
//
//   37  font        Open Sans and two Font Awesome families
//   57  script      Elementor Pro element-handlers, Electro's theme bundles,
//                   handlebars, typeahead, iziModal, the minified cache bundles
//    1  stylesheet  the cached Google-Fonts CSS
//    1  xhr
//
// So the reference does not merely render in fallback type: IT RUNS NONE OF THE
// THEME'S JAVASCRIPT. Carousels, tabs, the mega-menu and the sticky header
// never initialise, and the body measures 18146px at 380 against 5492px at
// 1440. A layout difference read off this snapshot is partly OUR layout and
// partly a page that never finished becoming itself, and nothing here can say
// how the two divide. Every run now prints the shortfall next to its
// percentage, and writes it into the report row, so the figure cannot be
// quoted bare.
//
// Three numbers exist for home at 380 and none of them is interchangeable:
//   10.68%  historical, against the real WordPress site while it was live
//   39.76%  network mode today: our build against our own production
//   30.26%  this snapshot: our build against a reference missing its fonts
// Read the third as a floor on the diff, not as the gate's 11%.
const localizedRef = (name) => {
  const file = resolve(`refs/localized/${name}`)
  return existsSync(file) ? pathToFileURL(file).href : null
}

// NO SILENT FALLBACK TO THE NETWORK. `?? networkUrl` was the first shape of this
// and it re-created the exact bug the block above describes: refs/ is gitignored
// in its entirety, so refs/localized/ cannot exist on a CI runner, and the
// fallback would have quietly pointed the gate back at kenyonexpress.co.il -
// which serves THIS app - and printed a fidelity score against ourselves.
//
// That was not hypothetical. The pixel-gate job skips today only because
// CI_SUPABASE_URL is unset, and setting it is an open MANUAL item. The trap was
// armed to spring on the day someone did the thing they are being asked to do.
const REFERENCE = (name, networkUrl) => {
  if (process.env.COMPARE_USE_NETWORK === '1') return networkUrl
  const local = localizedRef(name)
  if (local) return local
  // One template literal, not concatenated pieces: joining them with `+` is a
  // recorded way to lose text in this repo.
  throw new Error(
    `compare: refs/localized/${name} is missing, so there is nothing to compare against.
refs/ is gitignored, so this is the expected state on a fresh checkout or a CI runner.
Rebuild it with scripts/localize-live-refs.mjs, or pass --live=<url> explicitly.
COMPARE_USE_NETWORK=1 restores the old behaviour, but ${networkUrl} now serves THIS app,
so that measures the build against its own deployment and the percentage is meaningless.`,
  )
}

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache
}

const STORAGE_STATE = process.env.COMPARE_STORAGE_STATE ?? null

const b = await chromium.launch()
const ctx = await b.newContext({
  viewport: VIEW,
  deviceScaleFactor: 1,
  // The production CSP is style-src 'self' + nonce, which refuses the harness's own
  // addStyleTag (hides the dev badge). The harness is not the page under test.
  bypassCSP: true,
  ...(STORAGE_STATE && existsSync(STORAGE_STATE) ? { storageState: STORAGE_STATE } : {}),
})

// A FIRST VISIT'S CONSENT BANNER IS NOT A DESIGN DIFFERENCE.
//
// Measured 22.09.2026: an unhandled first visit to `mine` renders the
// analytics consent prompt (`src/components/analytics/ConsentBanner.tsx`)
// over the top of whatever card sits in its way -- at 380px it landed
// squarely on a deals-grid price and cart button. The frozen reference has
// no equivalent element in the same crop, so every run before this one
// scored that overlap as a real layout defect. It is a real element, just
// not the one this gate exists to catch: a returning visitor, or the
// reference captured past its own equivalent prompt, would not show it
// either. `e2e/home.spec.ts` and `scripts/_lcp-probe.mjs` already carry a
// consented cookie for the same reason; this brings compare.mjs in line
// with both rather than inventing a third way to do it.
//
// The value is hardcoded, not imported from `src/lib/analytics/consent.ts`:
// this script runs as plain Node ESM with no path aliasing and no TS loader,
// and every other script here that needs this cookie (`_lcp-probe.mjs`)
// already hardcodes it rather than add one. KEEP THE VERSION NUMBER IN SYNC
// WITH `CONSENT_WORDING_VERSION` THERE -- a stale version here silently
// starts failing this exact check again, the same way an unbumped version
// there re-asks every real visitor.
await ctx.addCookies([
  {
    name: 'ke_consent',
    value: encodeURIComponent('granted.2'),
    domain: new URL(LOCAL).hostname,
    path: '/',
  },
])

let liveUrl = argOf('live', null)
// `--live-url=` is the goal queue's name for the SERVER UNDER TEST, i.e. our
// build, while `--live=` above is the gate's name for the REFERENCE. Opposite
// words for opposite sides; see compare-args.mjs. Said aloud so the console
// shows which side the URL went to.
let mineUrl = argOf('mine', null) ?? ARGS.underTest
if (ARGS.underTest)
  console.log(
    `--live-url=${ARGS.underTest} is the page under test (ours); the reference is unchanged`,
  )

// A frozen capture is the reference: nothing navigates to a live host for it.
if (LIVE_PNG) liveUrl ??= `file://${resolve(LIVE_PNG)}`

if (page === 'home') {
  liveUrl ??= REFERENCE('ke_live_home.html', LIVE_HOME)
  mineUrl ??= `${LOCAL}/`
} else if (page === 'product') {
  liveUrl ??= REFERENCE('ke_live_product.html', LIVE_PRODUCT)
  if (!mineUrl) {
    const probe = await ctx.newPage()
    // Pin the local product, the way the category run pins its slug. Falling
    // straight to "first product link on /products" makes this run compare two
    // UNRELATED products and call the difference a fidelity score: the number
    // moves whenever the catalogue reorders, with nothing in the page changed.
    // That is not hypothetical. On 2026-08-01 it read 16.59% against 10.71% on
    // record, and the whole delta was the pick: live's reference is a sample
    // product with no image at all, and the local side had landed on a room
    // listing with a large photo.
    const preferred = COMPARE_PRODUCT_SLUG ? `${LOCAL}/product/${COMPARE_PRODUCT_SLUG}` : null
    const res = preferred
      ? await probe.goto(preferred, { waitUntil: 'domcontentloaded' }).catch(() => null)
      : null
    if (res?.ok()) {
      mineUrl = preferred
    } else {
      if (preferred) console.log(`product: ${COMPARE_PRODUCT_SLUG} did not resolve, discovering`)
      await probe.goto(`${LOCAL}/products`, { waitUntil: 'networkidle' }).catch(() => {})
      const href = await probe
        .evaluate(() => {
          const a = document.querySelector('a[href*="/product/"]')
          return a ? a.getAttribute('href') : null
        })
        .catch(() => null)
      mineUrl = href ? `${LOCAL}${href.startsWith('/') ? '' : '/'}${href}` : `${LOCAL}/product/`
      console.log(`product: discovered local slug -> ${mineUrl}`)
    }
    await probe.close()
  }
} else if (page === 'category') {
  liveUrl ??= REFERENCE('ke_live_category.html', LIVE_CATEGORY)
  if (!mineUrl) {
    // hot-deals is the live archive's slug and does not exist in the local
    // database, whose categories are baby-kids / vacation / pets / ... . Hard
    // coding it meant the category run had been screenshotting a 404 page and
    // reporting the diff against it as a fidelity score. Fall back to whatever
    // category the local catalogue actually links to.
    const probe = await ctx.newPage()
    const preferred = `${LOCAL}/category/${LOCAL_CATEGORY_SLUG}`
    const res = await probe.goto(preferred, { waitUntil: 'domcontentloaded' }).catch(() => null)
    if (res?.ok()) {
      mineUrl = preferred
    } else {
      await probe.goto(`${LOCAL}/products`, { waitUntil: 'networkidle' }).catch(() => {})
      const href = await probe
        .evaluate(() => document.querySelector('a[href^="/category/"]')?.getAttribute('href'))
        .catch(() => null)
      mineUrl = href ? `${LOCAL}${href}` : preferred
      console.log(`category: ${LOCAL_CATEGORY_SLUG} is not local, discovered -> ${mineUrl}`)
    }
    await probe.close()
  }
} else if (page === 'products') {
  liveUrl ??= REFERENCE('ke_live_products.html', LIVE_PRODUCTS)
  mineUrl ??= `${LOCAL}/products`
} else if (page === 'search') {
  liveUrl ??= REFERENCE('ke_live_search.html', LIVE_SEARCH)
  mineUrl ??= `${LOCAL}/search?q=${encodeURIComponent(COMPARE_QUERY)}`
} else if (page === 'checkout') {
  // Both checkouts redirect an empty cart away, so neither side can be
  // screenshotted cold. Each is seeded in its own context first, and the shoot
  // below refuses anything that did not land on /checkout: a picture of the
  // cart scored against a picture of the cart is a low number and no
  // measurement.
  liveUrl ??= REFERENCE('ke_live_checkout.html', LIVE_CHECKOUT)
  mineUrl ??= `${LOCAL}/checkout`
} else if (page === 'cart') {
  // Unlike checkout, neither cart REDIRECTS when it is empty: both render an
  // empty-cart panel. That is what makes this page the trap it is. A filled
  // live cart scored against an empty local one produces a number, and the
  // number is meaningless. Both sides are seeded, and the guard below refuses
  // to score the two states against each other. COMPARE_CART_EMPTY=1 measures
  // the empty state on purpose, which is the only run available while the
  // local add-to-cart is blocked by the stock Supabase demo key.
  liveUrl ??= REFERENCE('ke_live_cart.html', LIVE_CART)
  mineUrl ??= `${LOCAL}/cart`
} else if (page === 'account') {
  // Account page has no default reference (new Next.js functionality).
  // Must be measured with explicit --baseline (e.g., Wayback Machine snapshot).
  // The liveUrl comes from the baseline file, mineUrl is the page under test.
  if (!ARGS.baseline) {
    console.error(
      'compare: --page=account requires --baseline (no default reference exists).\nExample: --baseline=wayback_account_380.png --live-url=http://localhost:3311/account',
    )
    process.exit(2)
  }
  liveUrl ??= `file://${ARGS.baseline.path}`
  mineUrl ??= `${LOCAL}/account`
} else if (page === 'supplier') {
  // Supplier page has no WordPress reference (feature didn't exist in WooCommerce).
  // Must be measured with explicit --baseline (e.g., Next.js baseline).
  // The liveUrl comes from the baseline file, mineUrl is the page under test.
  if (!ARGS.baseline) {
    console.error(
      'compare: --page=supplier requires --baseline (no default reference exists).\nExample: --baseline=nextjs_supplier_380.png --live-url=http://localhost:3311/supplier',
    )
    process.exit(2)
  }
  liveUrl ??= `file://${ARGS.baseline.path}`
  mineUrl ??= `${LOCAL}/supplier`
} else {
  console.error(
    `unknown --page=${page} (use home, product, category, products, search, cart, checkout, account or supplier)`,
  )
  process.exit(2)
}

const CART_EMPTY_ONLY = process.env.COMPARE_CART_EMPTY === '1'

// Puts one line in the cart the page under test will read. Live takes the
// WooCommerce GET; ours has no such route, so the local seed drives the real
// add-to-cart control on a product page, which is also the only way to be sure
// the button still works.
const seedCart = async (target) => {
  const p = await ctx.newPage()
  try {
    if (target === 'live') {
      // 'commit' again, and for a sharper reason here: the only thing this
      // navigation is for is the cart cookie WooCommerce sets on the response.
      // Waiting for the 4.5MB homepage behind it to finish loading is waiting
      // for something the seed does not use, and it was timing out at two
      // minutes doing exactly that.
      await p.goto(`https://kenyonexpress.co.il/?add-to-cart=${LIVE_ATC_ID}&quantity=1`, {
        waitUntil: 'commit',
        timeout: 60000,
      })
      await p.waitForTimeout(3000)
    } else {
      // domcontentloaded, not networkidle: the catalogue's remote images are
      // blocked by our own img-src, so those requests stay pending and the
      // network never goes idle. Waiting for idle here spent the full timeout
      // on a page that had finished rendering in a second.
      // waitUntil 'commit' throughout. Neither 'networkidle' nor even
      // 'domcontentloaded' resolves reliably on these pages: the catalogue's
      // remote images are refused by our own img-src and the router's prefetches
      // abort, so the load milestones never arrive on a page that curl fetches
      // in a few seconds. 'commit' returns on the first byte and the waits below
      // are on the elements actually being driven, which is what the seed cares
      // about.
      await p.goto(`${LOCAL}/products`, { waitUntil: 'commit', timeout: 60000 })
      const link = p.locator('a[href*="/product/"]').first()
      await link.waitFor({ state: 'attached', timeout: 45000 })
      const href = await link.getAttribute('href')
      if (!href) throw new Error('no product link on /products to seed the cart with')
      await p.goto(`${LOCAL}${href.startsWith('/') ? '' : '/'}${href}`, {
        waitUntil: 'commit',
        timeout: 60000,
      })
      const atc = p.locator('.pdp-buy__atc').first()
      await atc.waitFor({ state: 'visible', timeout: 45000 })
      await atc.click({ timeout: 30000 })
      // The add is a server action; give it a round trip before moving on.
      await p.waitForTimeout(5000)
    }
  } finally {
    await p.close()
  }
}

/**
 * What each side FAILED to load while it was being photographed.
 *
 * Filled by `shoot` and printed with the percentage, because a fidelity score
 * against a reference that did not finish rendering is not the number it looks
 * like, and the caveat has to travel with the figure rather than live in a
 * comment nobody reads at the moment of quoting.
 *
 * MEASURED 2026-09-08, and it corrects the note above. The reference drops 96
 * requests, which that note recorded correctly and then described as "every one
 * a font". Deterministic across four runs at two widths: 37 fonts, 57 SCRIPTS,
 * 1 stylesheet, 1 xhr. Elementor Pro's element handlers and the Electro theme's
 * bundles are among the 57, so the reference renders with none of the theme's
 * JavaScript - carousels, tabs and the sticky header never initialise. That is
 * a much larger degradation than missing type, and it is the reason the mobile
 * figure cannot be attributed to our layout on this evidence alone.
 */
const missedLoads = { live: [], mine: [] }
// How wide OUR document actually was at capture. A page wider than the
// viewport it was shot at is a page whose layout had not settled (measured
// 2026-10-21: an unhydrated home was 1490px at 1440), and the row must say so.
const ownGeometry = { viewport: VIEW.width, scrollWidth: undefined }

/**
 * THE CONSENT SHEET IS NOT PART OF THE DESIGN, AND IT WAS INSIDE THE WINDOW.
 *
 * Our page ships the cookie-consent banner fixed to the bottom of the viewport
 * for every visitor who has not decided, and the viewport here is 2600px tall,
 * so the banner painted across y2350-2600 of OUR screenshot and was diffed
 * against live's product cards. Measured 2026-10-20 at 380: bands y2200-2500
 * carried it on top of the grid mismatch.
 *
 * The cookie is set on the LOCAL side only. The reference is a WordPress
 * archive with no such banner, and the cookie is scoped to the local host
 * anyway, so the live capture cannot see it. The decision is `denied`: it hides
 * the banner without turning on any analytics in the measured build.
 *
 * The wording version is read from src/lib/analytics/consent.ts rather than
 * hardcoded, because a stale version is exactly the case the banner is built to
 * re-ask on: `granted.1` stopped hiding it when the wording moved to 2, and a
 * script carrying the old number would have put the sheet back into the
 * window with no error and a worse score that looked like a layout regression.
 */
const consentWordingVersion = () => {
  const src = readFileSync(resolve('src/lib/analytics/consent.ts'), 'utf8')
  const m = src.match(/CONSENT_WORDING_VERSION\s*=\s*(\d+)/)
  if (!m)
    throw new Error('compare: CONSENT_WORDING_VERSION not found in src/lib/analytics/consent.ts')
  return Number(m[1])
}

const presetConsentDecided = async (url) => {
  const u = new URL(url)
  await ctx.addCookies([
    {
      name: 'ke_consent',
      value: encodeURIComponent(`denied.${consentWordingVersion()}`),
      domain: u.hostname,
      path: '/',
    },
  ])
}

const shoot = async (url, out, side = null) => {
  const p = await ctx.newPage()
  if (side === 'mine') await presetConsentDecided(url)
  if (side) {
    const note = (type, url) => missedLoads[side]?.push({ type, url })
    p.on('requestfailed', (r) => note(r.resourceType(), r.url()))
    p.on('response', (r) => {
      if (r.status() >= 400) note(r.request().resourceType(), r.url())
    })
  }
  // The live host intermittently drops a navigation into chrome-error, which
  // used to abort the whole run after the seeding had already been paid for.
  // A transport flake is not a measurement failure; a page that will not load
  // after three tries is, and that still aborts.
  let lastError = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await p.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
      lastError = null
      break
    } catch (networkIdleError) {
      lastError = networkIdleError
      try {
        await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
        lastError = null
        break
      } catch (domError) {
        lastError = domError
        console.log(`  retry ${attempt}/3 for ${url}: ${String(domError.message).split('\n')[0]}`)
        await p.waitForTimeout(3000 * attempt)
      }
    }
  }
  if (lastError) throw lastError

  // THE PAGE MUST BE STYLED BEFORE IT IS WORTH PHOTOGRAPHING.
  //
  // The retry ladder above falls back to `domcontentloaded`, which fires BEFORE
  // stylesheets are applied. That fallback is load-bearing for a flaky live
  // host, but it means a slow run can screenshot a flash of unstyled content
  // and the diff then reports a number that has nothing to do with the design.
  //
  // Measured on 2026-08-10: the same product page, same build, same pinned
  // slug, three runs -> 9.79%, 15.47%, 95.07%. The 95% capture was the product
  // gallery image at full 1440x2600 with no layout at all. Nothing had changed
  // but the timing, and two of those numbers were reported as if they were
  // fidelity measurements.
  //
  // So: wait until a stylesheet has actually parsed into rules, and until web
  // fonts have settled, before anything is measured. Cross-origin sheets throw
  // on .cssRules, which is why the probe counts those as "present" rather than
  // treating a SecurityError as "not ready" and spinning until timeout.
  await p
    .waitForFunction(
      () => {
        if (document.readyState !== 'complete') return false
        const sheets = Array.from(document.styleSheets)
        if (sheets.length === 0) return false
        return sheets.some((sheet) => {
          try {
            return (sheet.cssRules?.length ?? 0) > 0
          } catch {
            return true // cross-origin: parsed, just not readable from here
          }
        })
      },
      { timeout: 30000 },
    )
    .catch(() => {
      // Loud, and it does not abort: a run that cannot confirm styles is still
      // worth completing, but the number it produces must not be trusted as a
      // gate result. Silence here is what let 95.07% look like a real answer.
      console.log(`  WARNING: styles never confirmed for ${url}; treat any diff as unmeasured`)
    })
  await p.evaluate(() => document.fonts?.ready).catch(() => {})

  const external = side === 'live'

  // IS THE LEFT-HAND SIDE STILL THE REFERENCE? See enforceReference above. The
  // page is already loaded here, so the check costs no extra navigation.
  if (external) {
    await enforceReference(url, await p.evaluate(READ_REFERENCE_MARKERS))
  }

  // Local pages proxy remote product images through /_next/image on first
  // request, which is slower than the 2s this used to allow: cards were being
  // screenshotted mid-load and their broken-image glyphs scored as layout
  // difference. Waiting for the network to settle measures the page, not the
  // optimizer's cold start.
  await p.waitForTimeout(external ? 4000 : 6000)
  if (!external) await p.waitForLoadState('networkidle').catch(() => {})
  // The Next dev overlay renders a route badge into <nextjs-portal> and it was
  // being counted as page content: a ~150x45 box in the bottom-left of every
  // local screenshot that has no counterpart on live and does not exist in a
  // production build. It is dev tooling, not the page under comparison.
  if (!external) {
    // THE LOCAL-ENVIRONMENT RIBBON IS NOT PART OF THE PAGE UNDER COMPARISON.
    //
    // Same rule as <nextjs-portal> above, and it cost far more. `next start` on
    // a laptop is NODE_ENV=production with no VERCEL_ENV, so
    // EnvironmentBanner renders its 36px amber ribbon on the very server this
    // gate measures. It is correct there -- it exists to stop a real card being
    // typed into a sandbox -- and it renders nothing in production, so the
    // reference has no counterpart to it and never will.
    //
    // What it does to the number is not 36px worth. It sits ABOVE everything in
    // flow, so it shifts the entire page down relative to the capture, and a
    // band diff compares row y against row y: every band below the header is
    // then scoring our content against live's content one ribbon-height out of
    // register. Measured 2026-09-18, --page=home --width=1440, one build and
    // one server, hiding this element the only change: 21.31% -> see
    // docs/UI-PARITY-REPORT.md for the row.
    //
    // ALSO HIDDEN, SAME REASON, SINCE 22.09.2026: `[data-bottom-tab-bar]`
    // (`BottomTabBarView`) and `[data-testid="whatsapp-float"]`
    // (`WhatsAppFloatSheet`). Both are `position: fixed`, and a full-page
    // screenshot cannot represent a fixed element honestly at all -- it
    // belongs at every scroll position, and a single flattened capture can
    // only paint it at one, which lands wherever the first viewport height
    // happens to end. Measured: with the element visible, it painted directly
    // on top of a deals-grid card's price and cart button at 380px, and
    // scored as a content mismatch against whatever the reference happens to
    // show in that same band. Neither element is dev tooling and both are
    // real, correct UI for an actual visitor scrolling the real page; the
    // artifact is specific to flattening a fixed element into one static
    // image, the same category of problem the ribbon above already is.
    await p.addStyleTag({
      content:
        'nextjs-portal, [data-environment-banner], [data-bottom-tab-bar], [data-testid="whatsapp-float"] { display: none !important; }',
    })
    await p.waitForTimeout(200)
    // Refuse to score an error page. Twice now a percentage has been recorded
    // in STATE against a page that never rendered -- once a blank product page,
    // once a 404 category -- and both numbers looked plausible enough to be
    // believed. A comparison against nothing is not a low number, it is no
    // measurement at all.
    const notFound = await p.evaluate(
      () =>
        document.title.includes('404') ||
        /This page could not be found|לא נמצא/.test(document.body?.innerText ?? ''),
    )
    if (notFound) {
      console.error(`REFUSING to measure: ${url} rendered a not-found page.`)
      process.exit(3)
    }
  }
  // Same rule as the not-found guard above, for the redirect this page has:
  // an empty cart is sent to /cart on both sides, and two cart screenshots
  // score as an excellent checkout.
  if (page === 'checkout' && !p.url().includes('/checkout')) {
    console.error(`REFUSING to measure: ${url} redirected to ${p.url()} (cart did not stick).`)
    process.exit(3)
  }
  // The cart page answers whether it is empty in words rather than by
  // redirecting, so the state is read off the rendered text on both sides and
  // reconciled after both shots.
  if (page === 'cart') {
    cartEmptiness[external ? 'live' : 'mine'] = await p.evaluate(() => {
      const text = document.body?.innerText ?? ''
      // Live says "סל הקניות שלך ריק כרגע", ours says "העגלה שלך ריקה", and the
      // theme also prints "אין מוצרים בסל הקניות" in the header widget. Match
      // the shape rather than any one wording.
      return /(סל|עגל)[^.]{0,20}ריק|אין מוצרים בסל|cart is currently empty/i.test(text)
    })
  }
  // Same rule as the cart guard above, for the page where it bites hardest.
  //
  // MEASURED, 2026-08-19: `--page=category` scored 17.26% against
  // /product-category/hot-deals/ and the number was not a design measurement at
  // all. Live holds TWO products in that category and says so
  // ("מציגים את כל 2 התוצאות"); our seed holds THIRTEEN and paginates
  // ("מציג 1-12 מתוך 13 תוצאות"). One row of cards was being scored against
  // three rows of cards, so most of the mismatch was the grid existing where
  // live has footer, and none of it was a token anybody could move.
  //
  // The counts are read off the two shapes the sides actually use: WooCommerce
  // renders `li.product`, ours renders `article`. Neither side has both, so the
  // union counts each card exactly once.
  //
  // A COUNT IS NOT A CATALOGUE. Equal counts pass this guard while the two
  // grids hold entirely different merchandise, and that is not hypothetical:
  // on 2026-08-19 `--page=products` stopped refusing (both sides counted the
  // same) and scored 31.92%, and the band crop at y900-1100 showed live's
  // restaurant dishes against our bags, phones and wine. So the titles come
  // back too, and the guard below reads them.
  // THE PRODUCT PAGE, AND THE PHOTO THAT IS LOADED, LAID OUT AND INVISIBLE.
  //
  // MEASURED 2026-08-19. `--page=product` scored 16.17% and the top bands read
  // 24% to 52%. That region is the gallery, and on LIVE it is white: the
  // element carries an INLINE `opacity: 0`, no stylesheet rule anywhere on the
  // page sets it back, and `jQuery.fn.wc_product_gallery` is undefined -- the
  // theme swapped WooCommerce's gallery script for its own carousel, so the
  // line that would restore the opacity is not loaded. `refs/ke_live_product.html`,
  // an older capture, still carries `.woocommerce-product-gallery{opacity:1
  // !important}` twice. The live page today does not.
  //
  // It is not headless and it is not lazy loading: the image is `complete`
  // with `naturalWidth` 600, its box is 470x478 at x835 y250, and the opacity
  // stays 0 at 900px and 2600px of viewport height, at 0s, 3s and 5s, after
  // `load`, `resize`, `scroll`, jQuery `ready` and a real scroll. It is live's
  // own regression, and the only way for our page to match it is to stop
  // showing the product.
  //
  // Forcing `opacity: 1` on live and rerunning: 16.17% -> 12.56%, and 9.06% at
  // the 22px offset. So a QUARTER of what this page was charged is one blank
  // rectangle on the reference. That is the same defect as the grid guards
  // above -- a content difference wearing a fidelity number -- so it refuses
  // the same way instead of printing a number nobody can act on.
  if (page === 'product') {
    heroImages[external ? 'live' : 'mine'] = await p.evaluate(() => {
      // Painted, not merely present. A box is what a pixel diff can see, so
      // the check is the effective opacity down the whole ancestor chain
      // rather than the element's own: live's image is fully opaque inside a
      // container that is not.
      const painted = (el) => {
        for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
          const cs = getComputedStyle(n)
          if (cs.display === 'none' || cs.visibility === 'hidden') return false
          if (Number(cs.opacity) < 0.01) return false
        }
        return true
      }
      return [...document.querySelectorAll('img')].filter((img) => {
        const r = img.getBoundingClientRect()
        // The main product shot on both sides is ~470 square near the top. The
        // floor is well under that and the ceiling on y keeps related-product
        // thumbnails and the footer out of the answer.
        if (r.width < 250 || r.height < 250) return false
        if (r.top + window.scrollY > 1000) return false
        return painted(img)
      }).length
    })
  }
  // EVERY IMAGE BELOW THE FOLD MUST BE ASKED FOR BEFORE THE PAGE IS SHOT.
  //
  // `fullPage: true` captures past the viewport without ever scrolling, so
  // nothing below the fold is intersected and nothing lazy is fetched. Both
  // sides lazy-load: live is WooCommerce with `loading="lazy"` on the catalogue,
  // ours is next/image, which does the same. The capture therefore contains
  // whichever images happened to be in flight when the timer expired, and that
  // set is different on every run.
  //
  // Measured on 2026-08-19, same build, same URLs, no scroll pass:
  // --page=category returned 17.26% and 18.51% on two consecutive runs, and the
  // band crop showed live's product grid as blank boxes where ours had photos.
  // The 8.45% recorded for the same page earlier the same morning was produced
  // the same way. A gate cannot swing nine points on which images loaded.
  //
  // Scroll the whole page in viewport steps, wait for the images to actually
  // finish, then return to the top. Placed before the hero freeze on purpose:
  // scrolling advances live's slider, so the freeze has to be the last thing
  // that happens before the shutter.
  // BOUNDED FROM THIS SIDE TOO, AS A GUARANTEE RATHER THAN A FIX.
  //
  // The fix is that nothing inside the evaluate can wait forever any more. This
  // bound is here because `page.evaluate` has no timeout of its own, so a future
  // edit that reintroduces an unsettleable promise would reintroduce a silent
  // infinite hang rather than a loud slow run. 90s is far above the ~20s the
  // sweep takes on the tallest page measured.
  //
  // Not fatal: a sweep that timed out has still scrolled the page and asked for
  // its images, and the pending-image guard below is what decides whether the
  // result is measurable.
  const sweep = p
    .evaluate(async () => {
      const step = window.innerHeight
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

      // BOUNDED, THOUGH NOT FOR THE REASON THIS COMMENT FIRST GAVE.
      //
      // The loop read `y < document.body.scrollHeight` with the height
      // re-evaluated each iteration, and the first version of this comment said
      // that was why a --width=380 run hung: lazy images load, the page grows,
      // the bound recedes. THAT IS MEASURED FALSE and is corrected here rather
      // than quietly deleted, because it was committed and is wrong.
      //
      // Measured against the live homepage, both widths:
      //
      //   width 1440   height before 5492   after 5492   grew 0   1.5s
      //   width  380   height before 17791  after 17791  grew 0   2.0s
      //
      // The page does not grow during the sweep at either width, so the
      // original loop terminated. The bound below is therefore a guarantee
      // rather than a fix: it costs nothing and it removes a shape that CAN
      // fail to terminate on a page that does lazily extend.
      //
      // THE HANG IS FOUND, AND IT WAS NOT THE SCROLL LOOP OR THE WIDTH.
      //
      // The measurements below stand, and they are why this loop was never the
      // culprit:
      //
      //   live 1440 fullPage screenshot   1.5MB in 0.3s
      //   live  380 fullPage screenshot   2.9MB in 0.4s
      //   mine 1440 (h=5695)              2.6MB in 0.4s
      //   mine  380 (h=10358)             1.2MB in 0.2s
      //
      // Load, height and capture are all fast at every width. The claim that
      // went with them -- "every wait in this file carries a timeout, so
      // nothing here should block forever" -- was the false step. `settle()`
      // below awaited `img.decode()` on images that can never load, and
      // `page.evaluate()` has NO default timeout in Playwright. See the note on
      // `settle()` for the mechanism and the per-width counts.
      //
      // It was never a property of 380. It is a property of any width where the
      // desktop side-banner column is display:none, which is 380 and 768 and
      // not 1440, and 380 happens to escape it because those images are not in
      // its layout at all.
      const MAX_SWEEPS = 4
      let previousHeight = 0
      for (let sweep = 0; sweep < MAX_SWEEPS; sweep += 1) {
        const height = document.body.scrollHeight
        if (height <= previousHeight) break
        // From 0 each sweep, not from previousHeight: the original always
        // walked the page from the top, and an image low in the viewport can
        // need the ones above it laid out first. Resuming part-way changed the
        // measured diff on the home page from 9.83% to 11.05%, deterministically.
        for (let y = 0; y < height; y += step) {
          window.scrollTo(0, y)
          await sleep(120)
        }
        previousHeight = height
      }
      window.scrollTo(0, document.body.scrollHeight)
      await sleep(300)
      // decode() rather than the `complete` flag: a lazy image that has just
      // been asked for reports complete=false, and one that failed reports
      // complete=true with zero natural width. Both are settled states and
      // neither is worth waiting on, so failures resolve rather than reject.
      // A decode() THAT CAN NEVER RESOLVE, AWAITED WITHOUT A TIMEOUT.
      //
      // MEASURED 2026-09-01, and this is the 380/768 hang that three commits
      // looked for in the wrong place. The homepage carries
      // `div.slider-das-block`, a desktop side-banner column that Tailwind
      // `hidden` sets to `display:none` below lg. It holds three
      // `loading="lazy"` images. A lazy image inside a display:none subtree is
      // never intersected, so the browser never issues the request, so it sits
      // at `complete=false, naturalWidth=0` forever -- and `img.decode()` on it
      // returns a promise that NEVER SETTLES. Not rejects. Never settles.
      //
      //   width  380  0 such images   run completes in 25s
      //   width  768  3 such images   run never completes
      //   width 1440  0 such images (the column is displayed, they load)
      //
      // `page.evaluate()` has no default timeout in Playwright, so the
      // unsettled promise blocked the whole run with the live shot already on
      // disk. That is the signature every hung run left behind: a
      // `refs/.run-<pid>-live.png` with no `-mine.png` beside it.
      //
      // Race every decode. A picture that has not decoded in two seconds is not
      // worth the run, and 'settled' here means 'stopped being worth waiting
      // for', which is the only thing the caller does with it.
      const DECODE_TIMEOUT_MS = 2000
      const settle = () =>
        Promise.all(
          [...document.images].map((img) =>
            img.decode
              ? Promise.race([
                  img.decode().catch(() => {}),
                  new Promise((r) => setTimeout(r, DECODE_TIMEOUT_MS)),
                ])
              : Promise.resolve(),
          ),
        )
      await settle()
      // A LAZY IMAGE THAT NEVER ARRIVED IS A PAGE THAT NEVER FINISHED.
      //
      // MEASURED, 2026-08-19. Three `--page=home` runs, one build, one live URL:
      //
      //   live 5492px -> 9.83%   live 5492px -> 9.83%   live 3730px -> 34.54%
      //
      // The 34.54% is not a regression and not noise in the diff. It is the
      // live homepage shot while 1762px of it was missing, because a lazy
      // `<img>` that has not loaded has no intrinsic height and collapses the
      // block it sits in. Our footer was then scored against live's mid-page.
      // `--page=category` threw the same 3730px capture the same morning and
      // printed 25.58% for it.
      //
      // Neither guard already here could catch it. The structural guard
      // compares the two SIDES to each other and 3730/5679 is 0.66, inside its
      // 0.62-1.6 band. The scroll pass above fixes WHICH images are asked for
      // and says nothing about whether the answers came back.
      //
      // So the scroll is repeated while any image is still incomplete, and the
      // count that remains is handed to the caller, which refuses to score a
      // live capture that still has holes in it.
      // AN IMAGE THAT IS NOT RENDERED IS NOT A HOLE IN THE PAGE.
      //
      // The guard this feeds refuses to score a capture with unloaded images,
      // because an unloaded image collapses its block and shortens the page.
      // That reasoning holds only for an image the layout actually shows. The
      // three lazy images inside the display:none side-banner column above are
      // CORRECTLY not loaded: they occupy no space, they collapse nothing, and
      // counting them makes the guard refuse a run that is perfectly good.
      //
      // So count only images the page is actually trying to display.
      const rendered = (img) => {
        if (img.getBoundingClientRect().width > 0) return true
        for (let n = img; n && n !== document.documentElement; n = n.parentElement) {
          if (getComputedStyle(n).display === 'none') return false
        }
        return true
      }
      const stillLoading = () =>
        [...document.images].filter((img) => !img.complete && rendered(img)).length
      for (let attempt = 0; attempt < 4 && stillLoading() > 0; attempt++) {
        for (let y = 0; y < document.body.scrollHeight; y += step) {
          window.scrollTo(0, y)
          await sleep(120)
        }
        await sleep(500)
        await settle()
      }
      window.__comparePendingImages = stillLoading()
      window.scrollTo(0, 0)
      await sleep(400)
    })
    .catch(() => {})

  const SWEEP_TIMEOUT_MS = 90000
  const sweepTimedOut = Symbol('sweep-timeout')
  const sweepResult = await Promise.race([
    sweep.then(() => null),
    new Promise((r) => setTimeout(() => r(sweepTimedOut), SWEEP_TIMEOUT_MS)),
  ])
  if (sweepResult === sweepTimedOut) {
    console.log(
      `  WARNING: the scroll/settle sweep for ${url} did not finish in ${SWEEP_TIMEOUT_MS}ms; continuing to the shutter.`,
    )
  }

  pendingImages[external ? 'live' : 'mine'] = await p
    .evaluate(() => window.__comparePendingImages ?? 0)
    .catch(() => 0)

  // Stop the hero before shooting.
  //
  // OUR slider no longer autoplays unless the visitor has pressed something
  // (see the autoplay effect in HeroSlider.tsx - revealing a slide was setting
  // the homepage's LCP), and the synthetic events below are not trusted input,
  // so locally this is already holding slide 1 by the time we arrive. It stays
  // because LIVE still autoplays every 5s against our 6s wait, and because a
  // fullPage capture is slow enough to advance mid-scroll: without this the
  // reference moves under us even when our side is frozen.
  //
  // Pointer-enter is the component's own supported way to hold a slide, so use
  // that rather than reaching into its state. Pages without a hero match
  // nothing and are untouched.
  //
  // SYNTHETIC EVENTS DO NOT HOLD LIVE'S SLIDER, AND THAT MADE THE 380 GATE A
  // COIN FLIP. Measured 2026-09-03, same build, same server, three consecutive
  // `--page=home --width=380` runs:
  //
  //   run 1   live 17825   mine 18257   10.96%
  //   run 2   live 17825   mine 18257   10.96%
  //   run 3   live 17791   mine 18257   28.25%
  //
  // Our side is byte-identical across all three; the reference is what moved.
  // Probing the live page directly found the movers, and they are all Revolution
  // Slider internals -- `rs-mask-wrap` 4337px against 5896px, a single `rs-layer`
  // 137px against 800px, `rs-loader.spinner0` 40px against 0. The slider was
  // simply on a different slide when the shutter fired. A gate that swings from
  // 10.96% to 28.25% on carousel phase is not measuring layout, and 10.96% was
  // never a pass -- it was one face of a coin.
  //
  // The bullet click above is why. `rs-bullet` is painted by the slider engine,
  // but an untrusted synthetic click is not how that engine changes slide, so
  // the call was a no-op that looked like a fix. Revolution Slider publishes a
  // real API instead: a `window.revapi<N>` jQuery object carrying `revpause`
  // and `revshowslide`. Verified present on the live homepage as `revapi6`
  // (`rev_slider_6_1`, five slides), and driving it pins the reference exactly
  // -- three consecutive loads returned slide 1, mask 137px, module 193px,
  // body 17791, spinner 0, with no variation at all.
  //
  // Pause, then show slide 1, then pause again: `revshowslide` restarts the
  // autoplay timer on its way in, so a single pause before it holds the wrong
  // slide and a single pause after it races the transition.
  await p
    .evaluate(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

      const hero = document.querySelector(
        '[data-hero-slider], .home-v1-slider, rs-module, [class*="hero"]',
      )
      // Pause first, then put slide 1 back. Pausing alone is not enough for the
      // live reference: its wait above is 6s and its autoplay fires at 5s, so
      // by the time we get here it has already advanced once and pausing would
      // just hold the wrong slide.
      hero?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, view: window }))
      const firstSlide =
        document.querySelector('rs-bullet') ??
        document.querySelector('button[aria-label="שקופית 1"]')
      firstSlide?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, view: window }),
      )

      // Every Revolution Slider on the page, by its own API. Discovered rather
      // than hardcoded to `revapi6`: the number is assigned by the plugin and
      // changes when the slider is rebuilt in WordPress.
      const apis = Object.keys(window)
        .filter((k) => /^revapi\d+$/.test(k))
        .map((k) => window[k])
        .filter((a) => a && typeof a.revpause === 'function')

      for (const a of apis) {
        try {
          a.revpause()
        } catch {}
      }
      for (const a of apis) {
        try {
          a.revshowslide(1)
        } catch {}
      }
      await sleep(900)
      for (const a of apis) {
        try {
          a.revpause()
        } catch {}
      }
    })
    .catch(() => {})
  // 700ms opacity transition on our slider, plus room for live's.
  await p.waitForTimeout(1200)

  // THE FREEZE HAS TO BE PROVEN, NOT ASSUMED.
  //
  // The bullet click was silently a no-op for months and the gate still printed
  // a number, which is the failure worth guarding: a frozen-looking reference
  // that is still moving produces a score with no meaning, and it produces it
  // quietly. Sample the hero geometry twice, 600ms apart, and record whether it
  // held. `heroFrozen` is read at the bottom of the run, next to the other
  // refusals, so a moving hero is reported rather than scored.
  const heroGeometry = () =>
    p
      .evaluate(() => {
        const el =
          document.querySelector('rs-module') ??
          document.querySelector('[data-hero-slider], .home-v1-slider')
        if (!el) return 'no-hero'
        const r = el.getBoundingClientRect()
        const mask = document.querySelector('rs-mask-wrap')
        return [
          Math.round(r.height),
          Math.round(mask ? mask.getBoundingClientRect().height : 0),
          document.body.scrollHeight,
        ].join('/')
      })
      .catch(() => 'unreadable')

  const heroBefore = await heroGeometry()
  await p.waitForTimeout(600)
  const heroAfter = await heroGeometry()
  heroStability[external ? 'live' : 'mine'] = { before: heroBefore, after: heroAfter }

  // COUNTED AT THE SHUTTER, NOT BEFORE IT. This block used to run right after
  // load, several waits earlier than the screenshot. Our related-products row
  // streams in, so on `--page=product` it counted ZERO cards while the picture
  // taken moments later holds four - a guard reading a different page from the
  // one it is guarding. Measured 2026-08-20: 0 cards at the old point, 4 in the
  // shot. Counting here reads exactly what the diff will score.
  if (COUNTED_GRIDS.has(page)) {
    const grid = await p.evaluate(() => {
      // Three shapes, because the two sides do not agree and neither do we
      // with ourselves: WooCommerce renders `li.product`, our grids render
      // `article.p_con`, and the product page's related row renders plain
      // divs from its own card. Measured 2026-08-20: without the third
      // selector this counted ZERO related cards on a page whose screenshot
      // holds four, so the guard passed a catalogue difference through as a
      // fidelity number. No side has more than one of the three shapes, so
      // the union still counts each card exactly once.
      const cards = [...document.querySelectorAll('li.product, article, .pdp-related__grid > *')]
      const titles = cards
        .map((c) =>
          (c.querySelector('h2, h3, .woocommerce-loop-product__title')?.textContent ?? '')
            .trim()
            .replace(/\s+/g, ' ')
            .toLowerCase(),
        )
        .filter(Boolean)
      return { count: cards.length, titles }
    })
    gridCounts[external ? 'live' : 'mine'] = grid.count
    gridTitles[external ? 'live' : 'mine'] = grid.titles
  }

  if (side === 'mine') {
    ownGeometry.scrollWidth = await p
      .evaluate(() => document.documentElement.scrollWidth)
      .catch(() => undefined)
  }
  await p.screenshot({ path: out, fullPage: true })
  await p.close()
  console.log(`${out} written (${url})`)
}

const cartEmptiness = { live: null, mine: null }
const gridCounts = { live: null, mine: null }
const gridTitles = { live: [], mine: [] }
const heroImages = { live: null, mine: null }
// Filled by the freeze block: whether each side's hero held still across a
// 600ms sample. A side that moved makes the score meaningless -- see the
// refusal near the bottom of this file.
const heroStability = { live: null, mine: null }
// THE SEARCH PAGE BELONGS HERE TOO, AND LEAVING IT OUT COST A DAY OF NUMBERS.
//
// The rule below was written for /category and /shop. `--page=search` scores
// the same shape - a grid of product cards over two catalogues that do not hold
// the same products - and it was reporting the difference as a fidelity score.
// Measured on 2026-08-19, one build, one server, no code change between runs:
// 15.10, 15.09, 9.84, 15.08, 10.30, 15.33. Bimodal, not drift, which is what a
// content difference looks like when the two sides settle differently.
//
// The counts for `צימר`: live 4 cards and "showing all 4 results", ours 2 cards
// and "found 2 products". Same query, same day, different catalogue.
// `product` is in this set for its RELATED-PRODUCTS row, and it was the last
// page whose catalogue difference was still being reported as a design number.
// Measured 2026-08-20 on a freshly built server: `--page=product` scored
// 14.18% against a gate CLAUDE.md sets at 11%, and cropping the two worst
// bands showed why - live renders ONE related card (a barbershop coupon, in a
// single narrow column with the rest of the row blank) against our FOUR, none
// of which is the same product. The rest of the page matches closely enough
// that the same crop at y520-770 shows the gallery, the quantity box, both
// buttons and the tag line in the same places, offset by about 58px.
const COUNTED_GRIDS = new Set(['category', 'products', 'search', 'product'])
const pendingImages = { live: 0, mine: 0 }

// ASK BEFORE SEEDING, NOT AFTER. `seedCart('live')` drives an add-to-cart
// against whatever the live host is, and the live host is our own production
// deployment now. Refusing at shot time would already have sent a WooCommerce
// add-to-cart GET at the real site and paid for two cart seedings first. This
// probe answers identity only -- the archive-renders-unstyled half needs a
// settled page, and it gets one in shoot().
// A FROZEN CAPTURE MEANS NO LIVE NAVIGATION, HERE TOO. `--baseline` was wired
// into the frozen block below, which the home page reaches first; cart and
// checkout reached this probe and `seedCart('live')` before it, and with the
// domain unresolvable (registrar NS, 25.09) both died on the goto and the gate
// never got to the capture it was handed. The capture IS the live side, so the
// identity probe has nothing to classify and the live seed has nothing to seed.
if ((page === 'checkout' || page === 'cart') && isExternal(liveUrl) && !LIVE_PNG) {
  const probe = await ctx.newPage()
  await probe.goto(liveUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
  const markers = await probe.evaluate(READ_REFERENCE_MARKERS)
  await probe.close()
  await enforceReference(liveUrl, markers)
}

if (page === 'checkout' || (page === 'cart' && !CART_EMPTY_ONLY)) {
  // Local first. Seeding live first left the next navigation in this context
  // waiting out its full timeout on a page that answers in under a second
  // cold, and the order costs nothing to get right.
  await seedCart('mine')
  if (!LIVE_PNG) await seedCart('live')
}

// TWO AGENTS RUNNING THIS SCRIPT IN ONE WORKING DIRECTORY OVERWRITE EACH
// OTHER'S EVIDENCE.
//
// `refs/live.png` and `refs/mine.png` are fixed names, and there is a window of
// tens of seconds between writing them and diff-bands reading them. A second
// run landing inside that window replaces one of the two files, and the diff is
// then computed across two different pages. It does not error: it prints a
// percentage that looks like every other percentage.
//
// CAUGHT IN THE ACT, 2026-08-19: a `--page=cart` run reported 24.51% with
// `live: 1440x5492`, which is the height of the live HOMEPAGE and not of any
// cart. `refs/live-home.png` carries an mtime of 11:17:53, between that run's
// two shots, and no `--page=home` was started from this session. Three of the
// morning's outliers - cart 24.51%, search 24.5%, and the checkout run that
// first raised the structural warning - are all the same substitution.
//
// The shots are per-process from here, so a concurrent run cannot reach them.
// The stable names are still written afterwards, because every other tool and
// every note in STATE.md refers to them.
/**
 * Width and height of a PNG, read through the browser that is already open.
 *
 * No image library is added for this. diff-bands.mjs decodes its two PNGs the
 * same way -- a data: URL into an <img> in headless chromium -- so the size
 * this reports is by construction the size that will be scored, rather than a
 * second decoder's opinion of the same file.
 *
 * @param {string} file
 * @returns {Promise<{width: number, height: number}>}
 */
const probeCaptureWidth = async (file) => {
  const dataUrl = `data:image/png;base64,${readFileSync(resolve(file)).toString('base64')}`
  const p = await ctx.newPage()
  try {
    await p.goto('about:blank')
    return await p.evaluate(
      (src) =>
        new Promise((res, rej) => {
          const img = new Image()
          img.onload = () => res({ width: img.naturalWidth, height: img.naturalHeight })
          img.onerror = () => rej(new Error('not a decodable image'))
          img.src = src
        }),
      dataUrl,
    )
  } finally {
    await p.close()
  }
}

const runShot = (side) => `refs/.run-${process.pid}-${side}.png`

// A RUN THAT CANNOT SHOOT IS A RESULT, AND IT GETS RECORDED LIKE ONE.
//
// Everything below this point assumes two screenshots exist. When the live
// reference refuses the connection, `shoot` throws here and the process dies
// with a stack trace, having written nothing to the report. The newest row in
// docs/UI-PARITY-REPORT.md then stays whatever last succeeded, which is how two
// dead runs on 2026-09-08 left six PASS rows from the day before standing as
// the gate's latest word. See appendParityFailure in parity-log.mjs.
try {
  if (LIVE_PNG) {
    // A frozen reference, by request or by default. No archive shot, no load
    // shortfall to report, and the ledger row says so (COMPARE_NOTES below).
    if (!existsSync(LIVE_PNG)) {
      console.error(`REFUSING to measure: --live-png=${LIVE_PNG} does not exist.`)
      const hint = recaptureHint(LIVE_PNG)
      if (hint)
        console.error(`refs/ is not tracked, so a fresh checkout has no capture. Make one: ${hint}`)
      appendParityFailure({ page, width: VIEW.width, reason: 'frozen capture not found' })
      await b.close()
      process.exit(5)
    }
    copyFileSync(LIVE_PNG, runShot('live'))
    console.log(
      `${runShot('live')} copied from ${LIVE_PNG} (frozen baseline, not a fresh shot of the archive)`,
    )
  } else {
    await shoot(liveUrl, runShot('live'), 'live')
  }
  await shoot(mineUrl, runShot('mine'), 'mine')
} catch (err) {
  appendParityFailure({
    page,
    width: VIEW.width,
    reason: `screenshot failed: ${err?.message ?? err}`,
  })
  throw err
}

// Two carts in different states are not a comparison. This is the same rule as
// the not-found and the checkout-redirect guards: refuse rather than print a
// percentage nobody can act on.
// With a frozen capture nothing reads the live cart, so `cartEmptiness.live`
// stays undefined and `undefined !== false` refused every frozen cart run with
// a message calling the unread side "filled". The state of a capture cannot be
// checked here; it is named in the notes column instead, and the reader pairs
// the file with the seed on purpose.
if (page === 'cart' && LIVE_PNG) {
  console.log(
    `cart: frozen capture, live cart state not checked; local cart is ${cartEmptiness.mine ? 'EMPTY' : 'filled'}.`,
  )
}
if (page === 'cart' && !LIVE_PNG && cartEmptiness.live !== cartEmptiness.mine) {
  const describe = (v) => (v ? 'empty' : 'filled')
  console.error(
    `REFUSING to measure: live cart is ${describe(cartEmptiness.live)} and the local cart is ${describe(cartEmptiness.mine)}.`,
  )
  console.error(
    'Seed both, or run with COMPARE_CART_EMPTY=1 to compare the empty state deliberately.',
  )
  process.exit(3)
}
if (page === 'cart' && cartEmptiness.mine) {
  console.log('cart: measuring the EMPTY state on both sides.')
}

// A grid of 13 scored against a grid of 2 produces a percentage, and the
// percentage is about the catalogue rather than the design. Refuse it, the same
// way the cart refuses two different cart states, and name both counts so the
// reader can see which side to change. COMPARE_ALLOW_GRID_MISMATCH=1 measures
// it anyway, for the run that only wants the header and footer bands.
// The live side is the one that arrives over the internet, so it is the one
// that shows up half-loaded. Ours is a `next start` on loopback and has never
// been seen with a hole in it, but both are named because a hole on our side
// would be the same lie in the other direction.
if (
  (pendingImages.live > 0 || pendingImages.mine > 0) &&
  process.env.COMPARE_ALLOW_PENDING_IMAGES !== '1'
) {
  console.error(
    `REFUSING to measure: ${pendingImages.live} image(s) on live and ${pendingImages.mine} on the local page had still not loaded when the shutter fired.`,
  )
  console.error(
    'The unloaded blocks collapse and the page is short, which scores as a design difference. Re-run; set COMPARE_ALLOW_PENDING_IMAGES=1 to score it anyway.',
  )
  process.exit(3)
}

// With a frozen capture nothing reads the live grid, so `gridCounts.live`
// stays null and `null !== 4` refused every frozen product run as "live shows
// null product cards" -- the same defect the cart guard above already names,
// and this one wrote no ledger row on the way out. A capture's grid cannot be
// counted here; the notes column names the file, and the reader pairs it with
// the slug on purpose.
if (COUNTED_GRIDS.has(page) && LIVE_PNG) {
  console.log(
    `${page}: frozen capture, live grid not counted; the local page shows ${gridCounts.mine} product card(s).`,
  )
}
if (
  COUNTED_GRIDS.has(page) &&
  !LIVE_PNG &&
  gridCounts.live !== gridCounts.mine &&
  process.env.COMPARE_ALLOW_GRID_MISMATCH !== '1'
) {
  console.error(
    `REFUSING to measure: live shows ${gridCounts.live} product cards and the local page shows ${gridCounts.mine}.`,
  )
  console.error(
    'Seed the two catalogues to the same count, pin a category that already matches, or run with COMPARE_ALLOW_GRID_MISMATCH=1 to score the mismatch deliberately.',
  )
  process.exit(3)
}

// SAME COUNT, DIFFERENT PRODUCTS, AND THE COUNT CANNOT SEE IT.
//
// MEASURED 2026-08-19 on `--page=products`: both grids held exactly 24 cards,
// so the count guard above passed and the run scored 31.92% as though that were
// a fidelity number. The titles say otherwise. Both sides sort alphabetically,
// 14 of the 24 products exist on both, and the local catalogue carries 10 that
// live does not while missing 9 that it has -- so from the fourth card on,
// every slot holds a different product, and only 7 of 24 slots agree.
//
// The test is POSITIONAL and not set overlap, because position is what pixels
// are: a product that exists on both sides but sits two rows lower contributes
// exactly as much mismatch as one that does not exist at all. Set overlap was
// 58% on the run that produced 31.92%, which would have passed a threshold on
// overlap and taught the next reader that the shop page has a design problem.
if (
  COUNTED_GRIDS.has(page) &&
  gridTitles.live.length > 0 &&
  gridTitles.mine.length > 0 &&
  process.env.COMPARE_ALLOW_GRID_MISMATCH !== '1'
) {
  const slots = Math.min(gridTitles.live.length, gridTitles.mine.length)
  let aligned = 0
  for (let i = 0; i < slots; i++) if (gridTitles.live[i] === gridTitles.mine[i]) aligned++
  const share = aligned / slots
  if (share < 0.8) {
    const inBoth = new Set(gridTitles.live)
    const shared = gridTitles.mine.filter((t) => inBoth.has(t)).length
    console.error(
      `REFUSING to measure: the two grids hold ${gridCounts.live} cards each, but only ${aligned} of ${slots} slots hold the same product (${Math.round(share * 100)}%). ${shared} of the products exist on both sides, in different places.`,
    )
    console.error(
      'A percentage between two catalogues in different order is a content difference wearing a fidelity number. Seed the local catalogue from live, or run with COMPARE_ALLOW_GRID_MISMATCH=1 to score it deliberately.',
    )
    process.exit(3)
  }
}

// ONE SIDE SHOWS THE PRODUCT, THE OTHER SHOWS WHITE.
//
// The reasoning and the measurements are with the probe in `shoot()`. In short:
// live's gallery carries an inline `opacity: 0` that nothing on the page clears
// any more, so a 470x478 rectangle of the reference is blank where our page has
// the product photo, and it was worth 3.61 points of the 16.17% this page
// scored. Matching that reference means removing the photo.
//
// The flag is the same one, because it is the same kind of refusal: a content
// difference, not a design one.
if (
  page === 'product' &&
  heroImages.live !== null &&
  heroImages.mine !== null &&
  (heroImages.live === 0) !== (heroImages.mine === 0) &&
  process.env.COMPARE_ALLOW_GRID_MISMATCH !== '1'
) {
  const blank = heroImages.live === 0 ? 'live' : 'the local page'
  const shown = heroImages.live === 0 ? 'the local page' : 'live'
  console.error(
    `REFUSING to measure: ${shown} paints a main product image and ${blank} paints none (live ${heroImages.live}, mine ${heroImages.mine}).`,
  )
  console.error(
    `Live's gallery holds a loaded, laid-out image under an inline opacity: 0 that no rule on the page clears. Fix it there, or run with COMPARE_ALLOW_GRID_MISMATCH=1 to score a product page against a blank one deliberately.`,
  )
  process.exit(3)
}
// A HERO THAT IS STILL MOVING MAKES THE SCORE MEANINGLESS.
//
// This is the refusal that the 10.96%/28.25% split earned. Both numbers were
// printed by a run that believed it had frozen the slider; only the second one
// looked wrong. Refusing here is what makes the difference visible at the time
// rather than three commits later, when a page has been "tuned" against a
// reference that was never holding still.
//
// Escape hatch on the same pattern as the grid mismatch above, because a
// deliberate run against a moving hero is occasionally what you want.
const heroMoved = ['live', 'mine'].filter(
  (side) =>
    heroStability[side] !== null &&
    heroStability[side].before !== 'no-hero' &&
    heroStability[side].before !== 'unreadable' &&
    heroStability[side].before !== heroStability[side].after,
)
if (heroMoved.length > 0 && process.env.COMPARE_ALLOW_MOVING_HERO !== '1') {
  for (const side of heroMoved) {
    const { before, after } = heroStability[side]
    console.error(
      `REFUSING to measure: ${side}'s hero moved between two samples 600ms apart (${before} -> ${after}, as module/mask/body height).`,
    )
  }
  console.error(
    'The freeze did not take. Live is driven through window.revapi<N>.revpause()/revshowslide(1); if that API is gone or renamed the reference is on an arbitrary slide and the score is carousel phase, not layout. Re-run, or set COMPARE_ALLOW_MOVING_HERO=1 to score it anyway.',
  )
  await b.close()
  process.exit(4)
}

for (const side of ['live', 'mine']) {
  copyFileSync(runShot(side), `refs/${side}-${page}.png`)
  copyFileSync(runShot(side), `refs/${side}.png`)
}

await b.close()

/**
 * One line per side, naming what did not load while it was photographed.
 *
 * A percentage is only a fidelity score if both sides finished rendering, and
 * the reference does not: it is a snapshot of a host that no longer exists, so
 * every absolute URL in it now 404s. Printing the shortfall next to the figure
 * is the same rule measure-live-vitals follows for its build bracket - the
 * caveat travels with the number, because a number quoted without it reads as
 * "our layout differs by this much" when part of it is the reference failing.
 */
console.log(`=== compare --page=${page} ===`)
console.log(`  reference: ${loadShortfall(missedLoads.live)}`)
console.log(`  ours     : ${loadShortfall(missedLoads.mine)}`)
// Loud, and it does not abort: the run completes and the row carries the caveat.
const ownCaveat = ownSideCaveat(missedLoads.mine, ownGeometry)
if (ownCaveat) console.log(`  WARNING: ${ownCaveat}`)
await new Promise((resolvePromise, reject) => {
  const child = spawn(process.execPath, [resolve('scripts/diff-bands.mjs')], {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: {
      ...process.env,
      COMPARE_PAGE: page,
      // The viewport this run was shot at. `report.W` in the child is the
      // narrower of the two images, which is not the same thing when the live
      // page and ours differ in width.
      COMPARE_WIDTH: String(VIEW.width),
      // A number measured against a frozen capture must say so in the report.
      // Read a month from now, a bare percentage in UI-PARITY-REPORT.md is
      // indistinguishable from one taken against the real site, and the two
      // mean different things.
      ...(LIVE_PNG ? { COMPARE_NOTES: `live side: frozen capture \`${LIVE_PNG}\`` } : {}),
      // Read the per-process shots, not the shared names. Without this the
      // isolation above buys nothing: the diff would still be taken across
      // whatever refs/live.png happens to hold by the time the child starts.
      COMPARE_LIVE_PNG: runShot('live'),
      COMPARE_MINE_PNG: runShot('mine'),
      // The reference's shortfall rides into docs/UI-PARITY-REPORT.md with the
      // row, after a caller's own note rather than instead of it. A row saying
      // 30.26% with nothing beside it has been read as our layout's divergence
      // before, and the reference was missing 57 scripts at the time.
      COMPARE_NOTES: [
        process.env.COMPARE_NOTES,
        // Before the reference shortfall: the cell is clipped at 160 characters
        // and this is the caveat that changes what the number means.
        ownCaveat,
        ARGS.baseline
          ? `baseline ${ARGS.baseline.name} (frozen PNG, ${statSync(ARGS.baseline.path).mtime.toISOString()}), not a fresh archive shot`
          : `ref ${loadShortfall(missedLoads.live)}`,
      ]
        .filter(Boolean)
        .join('; '),
    },
  })
  child.on('exit', (code) =>
    code === 0 ? resolvePromise() : reject(new Error(`diff-bands exited ${code}`)),
  )
})

// The stable copies above are the ones anybody looks at; these two only existed
// to keep a concurrent run out of this one's diff.
for (const side of ['live', 'mine']) rmSync(runShot(side), { force: true })
