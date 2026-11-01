#!/usr/bin/env node
/**
 * Capture the parity baseline: Electro home-v7 at the three gate widths.
 *
 * Usage: node scripts/capture-electro-baseline.mjs [--out=refs]
 * Writes refs/electro_v7_{380,768,1440}.png and refs/electro_v7.json.
 *
 * WHY NOT capture-electro.mjs. That script loads the page once at 1440 and
 * resizes the same document down to 768 and 380. A resize re-runs the CSS, but
 * it does not re-run anything the theme decided at load time, and it never
 * scrolls, so images below the first screen are captured as whatever their
 * lazy-load placeholder was. A baseline is scored against, so each width here
 * is its own page load, scrolled end to end before the shot.
 *
 * WHAT IS FROZEN BEFORE THE SHOT. The hero is a carousel and the deal block has
 * a countdown. Both move between two captures of the same page, and a moving
 * reference turns into percentage points nobody can act on. Carousels are
 * paused, the visible slide is given time to finish its entrance, and only
 * then are animations paused and transitions zeroed. The slide the carousel
 * happened to be on is part of the capture, not chosen.
 *
 * NOTHING IS WRITTEN UNLESS ALL THREE WIDTHS CLEAR. A partial set would leave
 * two fresh files beside one stale one, and the gate cannot tell them apart.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'
import { BASELINE_WIDTHS, ELECTRO_V7_SLUG, ELECTRO_V7_URL } from './parity-baseline.mjs'

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(homedir(), 'Library/Caches/ms-playwright')

const outArg = process.argv.find((a) => a.startsWith('--out='))
const OUT = resolve(outArg ? outArg.slice('--out='.length) : 'refs')
// Below this the page is a block page or an error page, not the template: the
// shortest real capture (1440) measured 4980px.
const MIN_HEIGHT = 2000

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const browser = await chromium.launch({
  args: ['--disable-blink-features=AutomationControlled'],
})
const context = await browser.newContext({
  userAgent: UA,
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
  locale: 'en-US',
  timezoneId: 'Asia/Jerusalem',
})
// navigator.webdriver is the first thing a challenge looks at.
await context.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
})

/** Wait out the Cloudflare interstitial. True when a real page is showing. */
async function cleared(page) {
  for (let i = 0; i < 20; i++) {
    const title = await page.title().catch(() => '')
    if (/just a moment|attention required/i.test(title)) {
      await page.waitForTimeout(1500)
      continue
    }
    return !/^40[0-9]|forbidden|access denied/i.test(title)
  }
  return false
}

const fail = async (message) => {
  console.error(message)
  for (const width of BASELINE_WIDTHS) {
    rmSync(resolve(OUT, `.${ELECTRO_V7_SLUG}_${width}.png.tmp`), { force: true })
  }
  await browser.close()
  process.exit(2)
}

mkdirSync(OUT, { recursive: true })
const captures = []

for (const width of BASELINE_WIDTHS) {
  const page = await context.newPage()
  await page.setViewportSize({ width, height: 1000 })
  try {
    await page.goto(ELECTRO_V7_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
  } catch (error) {
    await fail(`navigation failed at ${width}: ${error.message}`)
  }
  if (!(await cleared(page))) {
    await fail(`BLOCKED at ${width}: the challenge did not clear. Nothing written.`)
  }
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {})

  // Scroll the whole page so every lazy image is requested, then come back.
  await page.evaluate(async () => {
    const step = Math.round(window.innerHeight * 0.8)
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y)
      await new Promise((done) => setTimeout(done, 150))
    }
    window.scrollTo(0, 0)
  })
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {})
  // Stop the carousels where the library allows it, then let the slide that is
  // showing finish its entrance before anything is frozen. Zeroing animations
  // first (the first version of this script) reset the hero caption to its
  // pre-entrance position: half of "THE NEW STANDARD" sat under the
  // departments menu and the price was painted across the pager.
  await page.evaluate(() => {
    const $ = window.jQuery
    if (!$) return
    try {
      $('.slick-slider').each((_, el) => $(el).slick?.('slickPause'))
    } catch {}
    try {
      $('.owl-carousel').trigger('stop.owl.autoplay')
    } catch {}
  })
  await page.waitForTimeout(2500)
  await page.addStyleTag({
    content:
      '*,*::before,*::after{animation-play-state:paused!important;transition:none!important;scroll-behavior:auto!important}',
  })
  // The demo's own chrome is not the template: a Dark/Light switcher and a
  // back-to-top button float over the content at a position that depends on
  // the scroll, and both were painted over a product card in the first
  // capture. Small fixed or sticky widgets are hidden; a fixed header or bar is
  // far over this area and is left alone.
  const hidden = await page.evaluate(() => {
    let count = 0
    for (const el of document.querySelectorAll('body *')) {
      const position = getComputedStyle(el).position
      if (position !== 'fixed' && position !== 'sticky') continue
      const rect = el.getBoundingClientRect()
      if (rect.width * rect.height === 0 || rect.width * rect.height > 12000) continue
      el.style.setProperty('visibility', 'hidden', 'important')
      count++
    }
    return count
  })
  await page.waitForTimeout(800)

  const facts = await page.evaluate(() => {
    const images = [...document.images]
    return {
      title: document.title,
      height: document.documentElement.scrollHeight,
      images: images.length,
      // `complete` is true for an image that 404'd; naturalWidth is not.
      broken: images.filter((img) => img.complete && img.naturalWidth === 0 && img.currentSrc)
        .length,
    }
  })
  if (facts.height < MIN_HEIGHT) {
    await fail(
      `REFUSING at ${width}: the document is ${facts.height}px tall ("${facts.title}"). That is not the template.`,
    )
  }

  const tmp = resolve(OUT, `.${ELECTRO_V7_SLUG}_${width}.png.tmp`)
  const buffer = await page.screenshot({ path: tmp, fullPage: true, type: 'png' })
  captures.push({
    width,
    tmp,
    file: `${ELECTRO_V7_SLUG}_${width}.png`,
    height: facts.height,
    images: facts.images,
    brokenImages: facts.broken,
    hiddenFloatingWidgets: hidden,
    bytes: buffer.length,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  })
  await page.close()
}

await browser.close()

for (const capture of captures) renameSync(capture.tmp, resolve(OUT, capture.file))
const manifest = {
  url: ELECTRO_V7_URL,
  capturedAt: new Date().toISOString(),
  captures: captures.map(({ tmp, ...rest }) => rest),
}
writeFileSync(resolve(OUT, `${ELECTRO_V7_SLUG}.json`), `${JSON.stringify(manifest, null, 2)}\n`)
for (const c of manifest.captures) {
  console.log(
    `${c.file}  ${c.width}x${c.height}  ${c.images} images (${c.brokenImages} broken)  ${c.hiddenFloatingWidgets} widgets hidden  sha256 ${c.sha256.slice(0, 16)}`,
  )
}
