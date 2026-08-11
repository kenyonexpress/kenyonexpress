import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'
if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const c = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(c)) process.env.PLAYWRIGHT_BROWSERS_PATH = c
}
const [url, label] = [process.argv[2], process.argv[3] ?? '']
const b = await chromium.launch()
const p = await (await b.newContext({ viewport: { width: 1440, height: 2600 } })).newPage()
try {
  await p.goto(url, { waitUntil: 'networkidle', timeout: 120000 })
} catch {
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 })
}
await p.waitForTimeout(url.includes('localhost') ? 2500 : 5000)
console.log(`## ${label}`)
console.log(
  await p.evaluate(() => {
    const g = (sels) => {
      for (const s of sels) {
        const e = document.querySelector(s)
        if (e) {
          const r = e.getBoundingClientRect()
          if (r.height > 0)
            return {
              s,
              top: Math.round(r.top + scrollY),
              left: Math.round(r.left),
              w: Math.round(r.width),
              h: Math.round(r.height),
            }
        }
      }
      return null
    }
    return {
      atc: g(['.pdp-buy__atc', '.single_add_to_cart_button', 'button[name="add-to-cart"]']),
      qty: g(['.pdp-buy__qty', '.quantity input.qty', '.quantity']),
      buynow: g(['.pdp-buy__now', '.buy-now-button', '.wc-buy-now']),
      row: g(['.pdp-buy', 'form.cart']),
    }
  }),
)
await b.close()
