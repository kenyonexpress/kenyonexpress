import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'
import { PROPS, collectComputed } from './lib/computed.mjs'
import { freezeHero, loadLazyContent } from './lib/settle.mjs'
import { compareProfiles, profilePage } from './lib/token-profile.mjs'

// Usage: node scripts/compare.mjs [--page=home|product|category|products|search|cart|checkout]
//                                 [--live-source=refs|network] [--live=<url>] [--mine=<url>]
//
// THE REFERENCE IS refs/, NOT THE LIVE SITE.
//
// Every project rule says the visual source of truth is refs/, produced by
// scripts/snapshot-live.mjs. This script used to contradict that: it opened
// https://kenyonexpress.co.il on every run and scored the local page against
// whatever came back at that moment. Three things were wrong with it.
//
//  1. It was not reproducible. The live homepage autoplays a hero every 5s and
//     is fronted by Cloudflare; two runs of an unchanged local build could not
//     be assumed to produce the same number, and the retry ladder below exists
//     entirely because the live host intermittently drops navigations.
//  2. It could not run without the network, and it paid a WooCommerce cart
//     seeding round trip on /cart and /checkout for a reference the snapshot
//     engine had already captured with the cart seeded.
//  3. Nothing read refs/ke_live_computed.json, so the 6MB of per-element
//     geometry the snapshot engine writes was decorative.
//
// The default is now --live-source=refs: the live side comes from
// refs/ke_live_<page>_1440.png and refs/ke_live_computed.json, both written by
// snapshot-live.mjs. Pass --live-source=network (or an explicit --live=<url>)
// to score against the live site directly, which is still the right thing when
// the question is "has the live site changed since we snapshotted it".
//
// Writes refs/live.png + refs/mine.png (consumed by diff-bands.mjs), plus
// page-suffixed copies refs/live-<page>.png / refs/mine-<page>.png, and
// refs/mine_computed.json with the local side of the computed-style walk.

const argOf = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : dflt
}
const page = argOf('page', 'home')
// 1440 is not a free choice any more: it is the widest viewport
// snapshot-live.mjs captures, so it is the only width the stored reference PNG
// and the stored computed styles exist at.
const REF_WIDTH = 1440
const VIEW = { width: REF_WIDTH, height: 2600 }
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
// The URLs above are used only by --live-source=network now, and they are also
// the URLs snapshot-live.mjs captured the stored reference from. Kept in step
// with that list deliberately: if the two drift, the reference stops being of
// the page being measured.
//
// Do NOT point --live at refs/ke_live_singlefile.html to get an offline run.
// Reopening that saved DOM from file:// renders a collapsed masthead -- 1px,
// no 110px header row -- because the theme rebuilds the header on the client
// and none of that runs again from a file. That is why the offline reference is
// the PNG the snapshot took of the real render, not the HTML it saved next to it.

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache
}

const STORAGE_STATE = process.env.COMPARE_STORAGE_STATE ?? null

const b = await chromium.launch()
const ctx = await b.newContext({
  viewport: VIEW,
  deviceScaleFactor: 1,
  ...(STORAGE_STATE && existsSync(STORAGE_STATE) ? { storageState: STORAGE_STATE } : {}),
})

let liveUrl = argOf('live', null)
let mineUrl = argOf('mine', null)

// An explicit --live=<url> is a request to score against that URL, so it picks
// the network path on its own. Everything else defaults to the stored refs.
const LIVE_SOURCE = argOf('live-source', liveUrl ? 'network' : 'refs')
if (LIVE_SOURCE !== 'refs' && LIVE_SOURCE !== 'network') {
  console.error(`unknown --live-source=${LIVE_SOURCE} (use refs or network)`)
  process.exit(2)
}
const USE_REFS = LIVE_SOURCE === 'refs'

if (page === 'home') {
  liveUrl ??= LIVE_HOME
  mineUrl ??= `${LOCAL}/`
} else if (page === 'product') {
  liveUrl ??= LIVE_PRODUCT
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
  liveUrl ??= LIVE_CATEGORY
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
  liveUrl ??= LIVE_PRODUCTS
  mineUrl ??= `${LOCAL}/products`
} else if (page === 'search') {
  liveUrl ??= LIVE_SEARCH
  mineUrl ??= `${LOCAL}/search?q=${encodeURIComponent(COMPARE_QUERY)}`
} else if (page === 'checkout') {
  // Both checkouts redirect an empty cart away, so neither side can be
  // screenshotted cold. Each is seeded in its own context first, and the shoot
  // below refuses anything that did not land on /checkout: a picture of the
  // cart scored against a picture of the cart is a low number and no
  // measurement.
  liveUrl ??= LIVE_CHECKOUT
  mineUrl ??= `${LOCAL}/checkout`
} else if (page === 'cart') {
  // Unlike checkout, neither cart REDIRECTS when it is empty: both render an
  // empty-cart panel. That is what makes this page the trap it is. A filled
  // live cart scored against an empty local one produces a number, and the
  // number is meaningless. Both sides are seeded, and the guard below refuses
  // to score the two states against each other. COMPARE_CART_EMPTY=1 measures
  // the empty state on purpose, which is the only run available while the
  // local add-to-cart is blocked by the stock Supabase demo key.
  liveUrl ??= LIVE_CART
  mineUrl ??= `${LOCAL}/cart`
} else {
  console.error(
    `unknown --page=${page} (use home, product, category, products, search, cart or checkout)`,
  )
  process.exit(2)
}

const CART_EMPTY_ONLY = process.env.COMPARE_CART_EMPTY === '1'

// ---------------------------------------------------------------------------
// The stored reference
// ---------------------------------------------------------------------------

const REF_SHOT = `refs/ke_live_${page}_${REF_WIDTH}.png`
const REF_HTML = `refs/ke_live_${page}.html`
const REF_COMPUTED = 'refs/ke_live_computed.json'
const REBUILD = `node scripts/snapshot-live.mjs --page=${page}`

/** Live-side elements at REF_WIDTH, read from refs; null in network mode. */
let liveElements = null

if (USE_REFS) {
  // Fail here, before a browser is launched and before the local cart is
  // seeded. A missing reference is a setup problem, and finding it out after
  // two minutes of seeding is the kind of thing that gets a run abandoned
  // rather than fixed.
  const missing = [REF_SHOT, REF_COMPUTED].filter((file) => !existsSync(file))
  if (missing.length > 0) {
    console.error(`REFUSING to measure: no stored reference for --page=${page}.`)
    for (const file of missing) console.error(`  missing ${file}`)
    console.error(`Build it with:  ${REBUILD}`)
    console.error('Or score against the live site directly with --live-source=network.')
    process.exit(3)
  }

  const stored = JSON.parse(readFileSync(REF_COMPUTED, 'utf8'))
  liveElements = stored?.[page]?.[String(REF_WIDTH)]
  if (!Array.isArray(liveElements) || liveElements.length === 0) {
    console.error(`REFUSING to measure: ${REF_COMPUTED} has no ${page} at ${REF_WIDTH}px.`)
    console.error(`Build it with:  ${REBUILD}`)
    process.exit(3)
  }

  // Not a failure, because an old reference is still a reference and the live
  // site is not redesigned weekly. It is said out loud because a number scored
  // against a stale snapshot looks exactly like a number scored against a fresh
  // one, and the difference has been mistaken for a regression before.
  const ageDays = (Date.now() - statSync(REF_SHOT).mtimeMs) / 86_400_000
  if (ageDays > 14) {
    console.log(`  NOTE: ${REF_SHOT} is ${Math.round(ageDays)} days old. Re-snapshot: ${REBUILD}`)
  }
}

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

const shoot = async (url, out) => {
  const p = await ctx.newPage()
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

  const external = url.startsWith('file:') || url.includes('kenyonexpress.co.il')
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
    await p.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })
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
  // Settle the page, exactly as snapshot-live.mjs settles the reference: pull
  // in everything that loads on approach, then stop the hero on slide 1. Both
  // steps live in scripts/lib/settle.mjs so the two scripts cannot drift.
  //
  // OUR slider no longer autoplays unless the visitor has pressed something
  // (see the autoplay effect in HeroSlider.tsx - revealing a slide was setting
  // the homepage's LCP), and synthetic events are not trusted input, so locally
  // this is already holding slide 1 by the time we arrive. It stays because
  // LIVE still autoplays every 5s against our 6s wait.
  await p.evaluate(loadLazyContent).catch(() => {})
  if (!external) await p.waitForLoadState('networkidle').catch(() => {})
  await p.evaluate(freezeHero).catch(() => {})
  // 700ms opacity transition on our slider, plus room for live's.
  await p.waitForTimeout(1200)

  await p.screenshot({ path: out, fullPage: true })
  // The same walk snapshot-live.mjs ran against the reference, run here against
  // the page being scored. Taken after the screenshot so both describe the same
  // frozen state of the page.
  const elements = await p.evaluate(collectComputed, PROPS)
  await p.close()
  console.log(`${out} written (${url}) - ${elements.length} boxes`)
  return elements
}

const cartEmptiness = { live: null, mine: null }

// snapshot-live.mjs seeds the WooCommerce cart before it captures /cart and
// /checkout, so a stored reference for either page is the FILLED state by
// construction. Confirmed against the text rather than assumed: the shipped
// refs/ke_live_cart.html carries three cart_item rows and none of the three
// empty-cart wordings. Reading it here keeps the guard honest if that ever
// changes -- a reference that says "empty" now refuses the run instead of
// quietly scoring an empty page against a filled one.
const refCartIsEmpty = () => {
  if (!existsSync(REF_HTML)) return null
  const text = readFileSync(REF_HTML, 'utf8').replace(/<[^>]*>/g, ' ')
  return /(סל|עגל)[^.]{0,20}ריק|אין מוצרים בסל|cart is currently empty/i.test(text)
}

if (USE_REFS && page === 'cart' && CART_EMPTY_ONLY) {
  console.error(
    'REFUSING to measure: COMPARE_CART_EMPTY=1 has no stored reference to score against.',
  )
  console.error(
    'The reference cart is captured with a line in it. Use --live-source=network for the empty state.',
  )
  process.exit(3)
}

if (page === 'checkout' || (page === 'cart' && !CART_EMPTY_ONLY)) {
  // Local first. Seeding live first left the next navigation in this context
  // waiting out its full timeout on a page that answers in under a second
  // cold, and the order costs nothing to get right.
  await seedCart('mine')
  // In refs mode the live cart was already seeded, by snapshot-live.mjs, at the
  // moment the reference was captured. Seeding it again here would be a minute
  // of network for a page this run never opens.
  if (!USE_REFS) await seedCart('live')
}

if (USE_REFS) {
  copyFileSync(REF_SHOT, 'refs/live.png')
  cartEmptiness.live = refCartIsEmpty()
  console.log(`refs/live.png <- ${REF_SHOT} (${liveElements.length} boxes from ${REF_COMPUTED})`)
} else {
  liveElements = await shoot(liveUrl, 'refs/live.png')
}
const mineElements = await shoot(mineUrl, 'refs/mine.png')

// Two carts in different states are not a comparison. This is the same rule as
// the not-found and the checkout-redirect guards: refuse rather than print a
// percentage nobody can act on.
if (page === 'cart' && cartEmptiness.live === null) {
  console.log(
    `cart: ${REF_HTML} is missing, so the reference state could not be read. Rebuild: ${REBUILD}`,
  )
} else if (page === 'cart' && cartEmptiness.live !== cartEmptiness.mine) {
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
copyFileSync('refs/live.png', `refs/live-${page}.png`)
copyFileSync('refs/mine.png', `refs/mine-${page}.png`)

await b.close()

// The local half of what refs/ke_live_computed.json holds for the live half.
// Written per page rather than accumulated, because a run measures one page and
// a file that mixed a fresh page with six stale ones would be a trap.
writeFileSync(
  'refs/mine_computed.json',
  JSON.stringify({ page, width: REF_WIDTH, elements: mineElements }),
)

console.log(`=== compare --page=${page} (live from ${USE_REFS ? REF_SHOT : liveUrl}) ===`)
await new Promise((resolvePromise, reject) => {
  const child = spawn(process.execPath, [resolve('scripts/diff-bands.mjs')], {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: { ...process.env, COMPARE_PAGE: page },
  })
  child.on('exit', (code) =>
    code === 0 ? resolvePromise() : reject(new Error(`diff-bands exited ${code}`)),
  )
})

// ---------------------------------------------------------------------------
// The second measurement: what the pixels cannot say
//
// The band diff answers "do these two images differ", which is the gate. It
// cannot say WHY, and on a page whose blocks sit at different heights it says
// 40% for a design that is right and shifted. The computed styles answer the
// other half: which type sizes, weights, families, colours and radii the two
// pages spend their area on. A shifted-but-correct page scores near 0 here.
// ---------------------------------------------------------------------------

const liveProfile = profilePage(liveElements)
const mineProfile = profilePage(mineElements)
const tokens = compareProfiles(liveProfile, mineProfile)
const pct = (n) => `${(100 * n).toFixed(1)}%`

console.log(`\n=== computed styles, ${REF_WIDTH}px ===`)
console.log(
  `boxes:  live ${liveProfile.count}  mine ${mineProfile.count}` +
    `   (${mineProfile.count - liveProfile.count >= 0 ? '+' : ''}${mineProfile.count - liveProfile.count})`,
)
const heightDelta = mineProfile.pageHeight - liveProfile.pageHeight
const heightPct = liveProfile.pageHeight > 0 ? (100 * heightDelta) / liveProfile.pageHeight : 0
console.log(
  `height: live ${liveProfile.pageHeight}px  mine ${mineProfile.pageHeight}px` +
    `   (${heightDelta >= 0 ? '+' : ''}${heightDelta}px, ${heightPct >= 0 ? '+' : ''}${heightPct.toFixed(1)}%)`,
)
// A page shorter than the window still has a root box the height of the window,
// so `2600` here is the viewport and not the content. Said out loud because
// four of the seven pages report exactly that, and reading the difference
// between one capped side and one real one as a layout regression is the sort
// of number this whole script exists to stop producing.
if (liveProfile.pageHeight <= VIEW.height || mineProfile.pageHeight <= VIEW.height) {
  const capped = [
    liveProfile.pageHeight <= VIEW.height ? 'live' : null,
    mineProfile.pageHeight <= VIEW.height ? 'mine' : null,
  ]
    .filter(Boolean)
    .join(' and ')
  console.log(
    `        (${capped} fits in the ${VIEW.height}px window, so that height IS the window)`,
  )
}
// Where each side stops being content. See profilePage() for why this is not
// the same question as page height, and for the /search case that made it a
// line of its own.
if (liveProfile.contentEnd !== null && mineProfile.contentEnd !== null) {
  const gap = mineProfile.contentEnd - liveProfile.contentEnd
  console.log(
    `content: live ends at ${liveProfile.contentEnd}px  mine at ${mineProfile.contentEnd}px` +
      `   (${gap >= 0 ? '+' : ''}${gap}px before the footer)`,
  )
  // Half. Below that the two pages are not showing the same amount of anything,
  // and the pixel percentage is measuring the difference in how much page there
  // is, not in how the page looks.
  const ratio =
    Math.min(liveProfile.contentEnd, mineProfile.contentEnd) /
    Math.max(liveProfile.contentEnd, mineProfile.contentEnd)
  if (ratio < 0.5) {
    console.log(
      '        WARNING: one side carries less than half the content of the other.',
      '\n        The band percentage below is not a fidelity score.',
    )
  }
}
console.log(`TOKEN DISTANCE (mean of the properties below): ${tokens.overallPct}%`)
for (const { prop, pct: distance, worst } of tokens.props) {
  console.log(`  ${prop.padEnd(17)} ${String(distance).padStart(6)}%`)
  for (const gap of worst) {
    if (gap.gap < 0.005) continue // under half a percent of the page: noise
    console.log(
      `      ${gap.value.slice(0, 46).padEnd(46)} live ${pct(gap.live).padStart(6)}   mine ${pct(gap.mine).padStart(6)}`,
    )
  }
}
