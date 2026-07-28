import { spawn } from 'node:child_process'
import { copyFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

// Usage: node scripts/compare.mjs [--page=home|product|category] [--live=<url>] [--mine=<url>]
// home     : live = refs/ke_live_singlefile.html    mine = http://localhost:3000/
// product  : live = live kenyonexpress product page mine = http://localhost:3000/product/<slug>
// category : live = live product-category archive   mine = http://localhost:3000/category/<slug>
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
// /products is our rebuild of the live /shop/ archive.
const LIVE_PRODUCTS = 'https://kenyonexpress.co.il/shop/'
// Live search is a WordPress query string, not a route.
const COMPARE_QUERY = process.env.COMPARE_SEARCH_Q ?? 'אוזניות'
const LIVE_SEARCH = `https://kenyonexpress.co.il/?s=${encodeURIComponent(COMPARE_QUERY)}&post_type=product`
// The saved refs/ke_live_singlefile.html renders a collapsed header (masthead 1px,
// no 110px header row), so it under-represents the real site. Default the home
// reference to the live site; pass --live=<file url> to use the single-file.

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache
}

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: VIEW, deviceScaleFactor: 1 })

let liveUrl = argOf('live', null)
let mineUrl = argOf('mine', null)

if (page === 'home') {
  liveUrl ??= LIVE_HOME
  mineUrl ??= `${LOCAL}/`
} else if (page === 'product') {
  liveUrl ??= LIVE_PRODUCT
  if (!mineUrl) {
    const probe = await ctx.newPage()
    await probe.goto(`${LOCAL}/products`, { waitUntil: 'networkidle' }).catch(() => {})
    const href = await probe
      .evaluate(() => {
        const a = document.querySelector('a[href*="/product/"]')
        return a ? a.getAttribute('href') : null
      })
      .catch(() => null)
    await probe.close()
    mineUrl = href ? `${LOCAL}${href.startsWith('/') ? '' : '/'}${href}` : `${LOCAL}/product/`
    console.log(`product: discovered local slug -> ${mineUrl}`)
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
} else {
  console.error(`unknown --page=${page} (use home, product, category, products or search)`)
  process.exit(2)
}

const shoot = async (url, out) => {
  const p = await ctx.newPage()
  try {
    await p.goto(url, { waitUntil: 'networkidle', timeout: 120000 })
  } catch {
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 })
  }
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
  await p.screenshot({ path: out, fullPage: true })
  await p.close()
  console.log(`${out} written (${url})`)
}

await shoot(liveUrl, 'refs/live.png')
await shoot(mineUrl, 'refs/mine.png')
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
