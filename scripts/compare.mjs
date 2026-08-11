import { spawn } from 'node:child_process'
import { copyFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

// Usage: node scripts/compare.mjs [--page=home|product|category|products|search|cart|checkout]
//                                 [--live=<url>] [--mine=<url>]
// home     : live = refs/ke_live_singlefile.html    mine = http://localhost:3000/
// product  : live = live kenyonexpress product page mine = http://localhost:3000/product/<slug>
// category : live = live product-category archive   mine = http://localhost:3000/category/<slug>
// coupon   : live coupon PDP vs local coupon product (QR customer page needs auth; PDP is the public surface)
// account  : live WP /my-account/ vs local /account (set COMPARE_STORAGE_STATE for an authed session)
// Writes refs/live.png + refs/mine.png (consumed by diff-bands.mjs), plus
// page-suffixed copies refs/live-<page>.png / refs/mine-<page>.png for reference.

const argOf = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : dflt
}
const page = argOf('page', 'home')
const VIEW = { width: 1440, height: 2600 }
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
// The saved refs/ke_live_singlefile.html renders a collapsed header (masthead 1px,
// no 110px header row), so it under-represents the real site. Default the home
// reference to the live site; pass --live=<file url> to use the single-file.

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
  await p
    .evaluate(() => {
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
    })
    .catch(() => {})
  // 700ms opacity transition on our slider, plus room for live's.
  await p.waitForTimeout(1200)

  await p.screenshot({ path: out, fullPage: true })
  await p.close()
  console.log(`${out} written (${url})`)
}

const cartEmptiness = { live: null, mine: null }

if (page === 'checkout' || (page === 'cart' && !CART_EMPTY_ONLY)) {
  // Local first. Seeding live first left the next navigation in this context
  // waiting out its full timeout on a page that answers in under a second
  // cold, and the order costs nothing to get right.
  await seedCart('mine')
  await seedCart('live')
}

await shoot(liveUrl, 'refs/live.png')
await shoot(mineUrl, 'refs/mine.png')

// Two carts in different states are not a comparison. This is the same rule as
// the not-found and the checkout-redirect guards: refuse rather than print a
// percentage nobody can act on.
if (page === 'cart' && cartEmptiness.live !== cartEmptiness.mine) {
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

console.log(`=== compare --page=${page} ===`)
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
