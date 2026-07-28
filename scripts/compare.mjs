import { spawn } from 'node:child_process'
import { copyFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

// Usage: node scripts/compare.mjs [--page=home|product|category|products|search]
//        [--live=<url>] [--mine=<url>] [--no-mask-images]
// By default product/hero <img> pixels are neutralized on BOTH sides so the
// OVERALL % measures chrome + layout, not catalog photography (content floor).
// Pass --no-mask-images for a raw pixel compare including photos.

const argOf = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : dflt
}
const page = argOf('page', 'home')
const MASK_IMAGES = !process.argv.includes('--no-mask-images')
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
// Live has no consent chrome. Dismiss ours so the fixed banner does not
// paint into every full-page band (especially y2400-2600).
await ctx.addCookies([
  {
    name: 'ke_consent',
    value: 'denied.1',
    url: LOCAL.endsWith('/') ? LOCAL : `${LOCAL}/`,
  },
])

let liveUrl = argOf('live', null)
let mineUrl = argOf('mine', null)

if (page === 'home') {
  liveUrl ??= LIVE_HOME
  mineUrl ??= `${LOCAL}/`
} else if (page === 'product') {
  liveUrl ??= LIVE_PRODUCT
  if (!mineUrl) {
    const preferred = `${LOCAL}/product/${encodeURI('מוצר-לדוגמא')}`
    const probe = await ctx.newPage()
    const preferredOk = await probe
      .goto(preferred, { waitUntil: 'domcontentloaded', timeout: 30000 })
      .then((r) => r?.ok())
      .catch(() => false)
    if (preferredOk) {
      mineUrl = preferred
      console.log(`product: using matching demo slug -> ${mineUrl}`)
    } else {
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
  mineUrl ??= `${LOCAL}/category/${LOCAL_CATEGORY_SLUG}`
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
  await p.waitForTimeout(external ? 4000 : 2000)
  if (MASK_IMAGES) {
    await p.evaluate(() => {
      const paint = (el) => {
        const r = el.getBoundingClientRect()
        if (r.width < 2 || r.height < 2) return
        el.style.setProperty('background', '#e8e8e8', 'important')
        el.style.setProperty('background-image', 'none', 'important')
        el.style.setProperty('object-fit', 'fill', 'important')
        el.style.setProperty('filter', 'brightness(0) invert(0.91)', 'important')
        if (el.tagName === 'IMG') {
          // Keep box size; hide decoded pixels behind a flat tone.
          el.style.setProperty('opacity', '0', 'important')
          const wrap = el.parentElement
          if (wrap && getComputedStyle(wrap).position === 'static') {
            wrap.style.position = 'relative'
          }
          if (wrap && !wrap.dataset.keMask) {
            wrap.dataset.keMask = '1'
            const cover = document.createElement('span')
            cover.setAttribute('aria-hidden', 'true')
            cover.style.cssText =
              'position:absolute;inset:0;background:#e8e8e8;pointer-events:none;z-index:1'
            wrap.appendChild(cover)
          }
        }
      }
      for (const el of document.querySelectorAll('img, picture, video, svg')) paint(el)
      for (const el of document.querySelectorAll('[style*="background-image"], .rs-layer img')) {
        paint(el)
      }
    })
    await p.waitForTimeout(200)
  }
  await p.screenshot({ path: out, fullPage: true })
  await p.close()
  console.log(`${out} written (${url})${MASK_IMAGES ? ' [images masked]' : ''}`)
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
