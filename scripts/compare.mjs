import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, rmSync } from 'node:fs'
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
  if (COUNTED_GRIDS.has(page)) {
    const grid = await p.evaluate(() => {
      const cards = [...document.querySelectorAll('li.product, article')]
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
  await p
    .evaluate(async () => {
      const step = window.innerHeight
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y)
        await sleep(120)
      }
      window.scrollTo(0, document.body.scrollHeight)
      await sleep(300)
      // decode() rather than the `complete` flag: a lazy image that has just
      // been asked for reports complete=false, and one that failed reports
      // complete=true with zero natural width. Both are settled states and
      // neither is worth waiting on, so failures resolve rather than reject.
      const settle = () =>
        Promise.all(
          [...document.images].map((img) =>
            img.decode ? img.decode().catch(() => {}) : Promise.resolve(),
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
      const stillLoading = () => [...document.images].filter((img) => !img.complete).length
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
const gridCounts = { live: null, mine: null }
const gridTitles = { live: [], mine: [] }
const heroImages = { live: null, mine: null }
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
const COUNTED_GRIDS = new Set(['category', 'products', 'search'])
const pendingImages = { live: 0, mine: 0 }

if (page === 'checkout' || (page === 'cart' && !CART_EMPTY_ONLY)) {
  // Local first. Seeding live first left the next navigation in this context
  // waiting out its full timeout on a page that answers in under a second
  // cold, and the order costs nothing to get right.
  await seedCart('mine')
  await seedCart('live')
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
const runShot = (side) => `refs/.run-${process.pid}-${side}.png`

await shoot(liveUrl, runShot('live'))
await shoot(mineUrl, runShot('mine'))

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

if (
  COUNTED_GRIDS.has(page) &&
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
for (const side of ['live', 'mine']) {
  copyFileSync(runShot(side), `refs/${side}-${page}.png`)
  copyFileSync(runShot(side), `refs/${side}.png`)
}

await b.close()

console.log(`=== compare --page=${page} ===`)
await new Promise((resolvePromise, reject) => {
  const child = spawn(process.execPath, [resolve('scripts/diff-bands.mjs')], {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: {
      ...process.env,
      COMPARE_PAGE: page,
      // Read the per-process shots, not the shared names. Without this the
      // isolation above buys nothing: the diff would still be taken across
      // whatever refs/live.png happens to hold by the time the child starts.
      COMPARE_LIVE_PNG: runShot('live'),
      COMPARE_MINE_PNG: runShot('mine'),
    },
  })
  child.on('exit', (code) =>
    code === 0 ? resolvePromise() : reject(new Error(`diff-bands exited ${code}`)),
  )
})

// The stable copies above are the ones anybody looks at; these two only existed
// to keep a concurrent run out of this one's diff.
for (const side of ['live', 'mine']) rmSync(runShot(side), { force: true })
