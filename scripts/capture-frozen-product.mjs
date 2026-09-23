// !! DO NOT USE ITS OUTPUT AS A GATE BASELINE (measured 23.09.2026). !!
// refs/ke_live_product.html is a saved DOM without its stylesheets, so this
// offline render is unstyled default-browser markup (bullet lists, blue links,
// no images). Scoring the product page against those PNGs would measure "styled
// vs unstyled", not fidelity. The Electro v7 demo that would be the alternative
// reference answers headless browsers with a Cloudflare challenge, so it cannot
// be captured either. The only valid product capture is refs/live-product.png
// (1440px, 2026-09-03, a different product than the one we render).
// Kept in the repo as the record of the attempt. See STATE.md, item 3.
//
// One-off: render the already-frozen refs/ke_live_product.html at the three
// gate widths and save PNGs, so scripts/compare.mjs --page=product has a
// --live-png reference the way home already does (refs/ke_live_{width}.png).
//
// WHY THIS DOES NOT HIT THE LIVE URL. docs/PARITY-REFERENCE.md: DNS now
// serves this project's OWN build at kenyonexpress.co.il, so re-fetching the
// product page live would capture ourselves, not the WooCommerce reference.
// The HTML was already saved before that cutover (refs/ke_live_product.html);
// this only renders that saved file locally, offline, at each width.
import fs from 'node:fs'
import { chromium } from '@playwright/test'

const WIDTHS = [380, 768, 1440]

const browser = await chromium.launch({ headless: true })
for (const width of WIDTHS) {
  const page = await browser.newPage({
    viewport: { width, height: 1000 },
    locale: 'he-IL',
    deviceScaleFactor: 1,
  })
  // `networkidle` on a file:// load of a saved page with external script tags
  // (analytics, fonts) can hang forever -- nothing ever resolves offline.
  // domcontentloaded plus a fixed settle time is what a frozen, static
  // capture actually needs.
  await page.goto(`file://${process.cwd()}/refs/ke_live_product.html`, {
    waitUntil: 'domcontentloaded',
  })
  await page.waitForTimeout(1500)
  // Old Elementor/WooCommerce markup overflows a few px past the viewport at
  // narrow widths (measured: 388 vs 380). A real 380px phone clips that, it
  // does not grow the page, so clamp it here rather than capture the overflow
  // as if it were content -- compare.mjs refuses a width mismatch outright.
  await page.addStyleTag({ content: 'html, body { overflow-x: hidden !important; }' })
  const fullHeight = await page.evaluate(() => document.documentElement.scrollHeight)
  const out = `refs/ke_live_product_${width}.png`
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width, height: fullHeight } })
  const { size } = fs.statSync(out)
  console.log(`wrote ${out} (${size} bytes)`)
  await page.close()
}
await browser.close()
