// Checkout geometry, both sides, in one table.
//
// scripts/compare.mjs answers "how far apart are these two pictures". It does
// not answer "which box moved", and the checkout page is the one where that
// distinction decides the work: the residual there is not drift in a token, it
// is a four-step wizard standing where live puts a single-page form. A band at
// 67% is not a colour to nudge.
//
// Both sides are seeded the same way compare.mjs seeds them, then every box in
// the top 520px is printed with its offset, width, alignment and font size, so
// a proposed CSS change can be checked against a measured number instead of a
// screenshot read by eye.
//
//   node scripts/_checkout-geometry.mjs                 # both sides
//   LOCAL_BASE=http://localhost:3313 node scripts/_checkout-geometry.mjs
//   node scripts/_checkout-geometry.mjs --side=live     # live only
import { chromium } from '@playwright/test'

const LOCAL = process.env.LOCAL_BASE ?? 'http://localhost:3000'
const LIVE_ATC_ID = process.env.LIVE_ATC_ID ?? '6166'
const sideArg = process.argv.find((a) => a.startsWith('--side='))?.split('=')[1] ?? 'both'
// The wizard puts nothing above 520px that is not also above 520px on live, and
// everything below it is the structural difference rather than a fixable one.
const CUTOFF = Number(process.env.GEOMETRY_CUTOFF ?? 520)

const collect = () =>
  // biome-ignore lint/complexity/useArrowFunction: runs in the page, not here.
  (function () {
    const rows = []
    const seen = new Set()
    const roots = document.querySelectorAll('#content *, main *, .checkout-page *, .checkout-page')
    for (const el of roots) {
      const r = el.getBoundingClientRect()
      const top = Math.round(r.top + window.scrollY)
      if (top > Number(window.__cutoff) || r.height < 8 || r.width < 40) continue
      const cs = getComputedStyle(el)
      const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 30)
      const key = `${top}|${Math.round(r.height)}|${Math.round(r.left)}|${text}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({
        top,
        h: Math.round(r.height),
        left: Math.round(r.left),
        w: Math.round(r.width),
        align: cs.textAlign,
        font: cs.fontSize,
        tag: el.tagName,
        cls: (el.className ?? '').toString().slice(0, 30),
        text,
      })
    }
    return rows.sort((a, b) => a.top - b.top)
  })()

const print = (label, rows) => {
  console.log(`\n=== ${label} (top ${CUTOFF}px) ===`)
  console.log('  top    h    x     w  align   font      tag .class | text')
  for (const r of rows) {
    console.log(
      `${String(r.top).padStart(5)} ${String(r.h).padStart(4)} ${String(r.left).padStart(4)} ${String(r.w).padStart(5)}  ${r.align.padEnd(7)} ${r.font.padEnd(9)} ${r.tag} .${r.cls} | ${r.text}`,
    )
  }
}

const browser = await chromium.launch()

if (sideArg === 'both' || sideArg === 'live') {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const p = await ctx.newPage()
  await p.goto(`https://kenyonexpress.co.il/?add-to-cart=${LIVE_ATC_ID}&quantity=1`, {
    waitUntil: 'commit',
    timeout: 60000,
  })
  await p.waitForTimeout(3000)
  await p.goto('https://kenyonexpress.co.il/checkout/', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  })
  await p.waitForTimeout(3000)
  if (!p.url().includes('/checkout')) {
    console.error(`REFUSING: live redirected to ${p.url()} (cart did not stick).`)
    process.exit(3)
  }
  await p.evaluate((c) => {
    window.__cutoff = c
  }, CUTOFF)
  print('live', await p.evaluate(collect))
  await ctx.close()
}

if (sideArg === 'both' || sideArg === 'mine') {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const p = await ctx.newPage()
  await p.goto(`${LOCAL}/products`, { waitUntil: 'commit', timeout: 60000 })
  const link = p.locator('a[href*="/product/"]').first()
  await link.waitFor({ state: 'attached', timeout: 45000 })
  const href = await link.getAttribute('href')
  if (!href) throw new Error('no product link on /products to seed the cart with')
  await p.goto(`${LOCAL}${href}`, { waitUntil: 'commit', timeout: 60000 })
  // The same handle compare.mjs clicks. A generic `button[type=submit]` picks
  // the newsletter form instead and the cart stays empty, which sends /checkout
  // to /cart and prints a table of the wrong page.
  const atc = p.locator('.pdp-buy__atc').first()
  await atc.waitFor({ state: 'visible', timeout: 45000 })
  await atc.click({ timeout: 30000 })
  await p.waitForTimeout(5000)
  await p.goto(`${LOCAL}/checkout`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {})
  if (!p.url().includes('/checkout')) {
    console.error(`REFUSING: local redirected to ${p.url()} (cart did not stick).`)
    process.exit(3)
  }
  await p.evaluate((c) => {
    window.__cutoff = c
  }, CUTOFF)
  print('mine', await p.evaluate(collect))
  await ctx.close()
}

await browser.close()
