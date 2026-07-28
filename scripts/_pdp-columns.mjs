import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'
if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const c = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(c)) process.env.PLAYWRIGHT_BROWSERS_PATH = c
}
const [url, label] = [process.argv[2], process.argv[3] ?? process.argv[2]]
const b = await chromium.launch()
const p = await (await b.newContext({ viewport: { width: 1440, height: 2600 } })).newPage()
try {
  await p.goto(url, { waitUntil: 'networkidle', timeout: 120000 })
} catch {
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 })
}
await p.waitForTimeout(url.includes('localhost') ? 2500 : 5000)
const out = await p.evaluate(() => {
  const r = (sel) => {
    const el = document.querySelector(sel)
    if (!el) return null
    const b = el.getBoundingClientRect()
    return {
      sel,
      left: Math.round(b.left),
      right: Math.round(b.right),
      top: Math.round(b.top),
      w: Math.round(b.width),
      h: Math.round(b.height),
    }
  }
  const gallery = r('.pdp-gallery__frame') ?? r('.woocommerce-product-gallery')
  const summary = r('.pdp-summary') ?? r('.summary.entry-summary')
  return { gallery, summary }
})
console.log(`## ${label}`)
for (const [k, v] of Object.entries(out)) {
  console.log(
    v
      ? `${k}\tleft=${v.left} right=${v.right} top=${v.top} w=${v.w} h=${v.h}\t${v.sel}`
      : `${k}\t-`,
  )
}
await b.close()
