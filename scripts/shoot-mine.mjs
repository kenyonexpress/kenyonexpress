import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

// Shoots OUR side of a parity comparison, exactly the way compare.mjs shoots
// it, and nothing else. compare.mjs cannot run at all since the reference died
// (docs/PARITY-REFERENCE.md): its left-hand side is a live URL that now serves
// this very project, so it refuses with exit 5 before the local shutter ever
// fires. The only measurement still possible is our build against an ARCHIVED
// capture of the old site, and that needs the local screenshot produced by the
// same ritual the recorded numbers used -- style settle, font settle, lazy
// sweep, hero hold, then a fullPage shot -- or the number is not comparable to
// anything in docs/UI-PARITY-REPORT.md.
//
// Usage: node scripts/shoot-mine.mjs --width=380 --out=refs/mine-home-380.png [--url=<url>]
// Pair the output with an archived left side via diff-bands.mjs:
//   COMPARE_LIVE_PNG=refs/ke_live_380.png COMPARE_MINE_PNG=refs/mine-home-380.png \
//   COMPARE_PAGE=home COMPARE_WIDTH=380 COMPARE_NOTES=... node scripts/diff-bands.mjs

const argOf = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : dflt
}
const width = Number(argOf('width', '1440'))
const LOCAL = process.env.LOCAL_BASE ?? 'http://localhost:3000'
const url = argOf('url', `${LOCAL}/`)
const out = argOf('out', `refs/mine-home-${width}.png`)

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache
}

const b = await chromium.launch()
const ctx = await b.newContext({
  viewport: { width, height: 2600 },
  locale: 'he-IL',
  deviceScaleFactor: 1,
})
const p = await ctx.newPage()

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

// Styled before photographed, same probe as compare.mjs: domcontentloaded can
// fire before stylesheets parse, and an unstyled flash scores as layout.
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
          return true
        }
      })
    },
    { timeout: 30000 },
  )
  .catch(() => {
    console.log(`  WARNING: styles never confirmed for ${url}; treat any diff as unmeasured`)
  })
await p.evaluate(() => document.fonts?.ready).catch(() => {})
await p.waitForTimeout(6000)
await p.waitForLoadState('networkidle').catch(() => {})
await p.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })
await p.waitForTimeout(200)

const notFound = await p.evaluate(
  () =>
    document.title.includes('404') ||
    /This page could not be found|לא נמצא/.test(document.body?.innerText ?? ''),
)
if (notFound) {
  console.error(`REFUSING to shoot: ${url} rendered a not-found page.`)
  process.exit(3)
}

// The lazy sweep, bounded the same way as compare.mjs: every below-fold image
// is asked for before the shutter, decode() raced against 2s so an image that
// can never load cannot hang the run.
const sweep = p
  .evaluate(async () => {
    const step = window.innerHeight
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const MAX_SWEEPS = 4
    let previousHeight = 0
    for (let s = 0; s < MAX_SWEEPS; s += 1) {
      const height = document.body.scrollHeight
      if (height <= previousHeight) break
      for (let y = 0; y < height; y += step) {
        window.scrollTo(0, y)
        await sleep(120)
      }
      previousHeight = height
    }
    window.scrollTo(0, document.body.scrollHeight)
    await sleep(300)
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
  console.log(`  WARNING: the scroll/settle sweep did not finish in ${SWEEP_TIMEOUT_MS}ms.`)
}
const pending = await p.evaluate(() => window.__comparePendingImages ?? 0).catch(() => 0)
if (pending > 0) console.log(`  WARNING: ${pending} rendered image(s) never finished loading.`)

// Hold the hero on slide 1. Ours does not autoplay without trusted input, so
// pointer-enter is belt and braces, same as compare.mjs's local side.
await p
  .evaluate(() => {
    const hero = document.querySelector(
      '[data-hero-slider], .home-v1-slider, rs-module, [class*="hero"]',
    )
    hero?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, view: window }))
  })
  .catch(() => {})
await p.waitForTimeout(400)

await p.screenshot({ path: out, fullPage: true })
const height = await p.evaluate(() => document.body.scrollHeight)
console.log(`shot ${url} at ${width}px -> ${out} (page height ${height}px, pending ${pending})`)
await b.close()
