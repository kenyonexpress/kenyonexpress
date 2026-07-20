import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
// Extract the deals grid (faf8583) product data + geometry from the rendered
// refs/ke_live_singlefile.html. Prints JSON for ke-live-deals-data.ts.
import { chromium } from '@playwright/test'

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache
}

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1440, height: 2600 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
const url = pathToFileURL(resolve('refs/ke_live_singlefile.html')).href
try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 })
} catch {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 })
}
await page.waitForTimeout(4000)

const out = await page.evaluate(() => {
  const grid =
    document.querySelector('.elementor-element-faf8583 .jet-listing-grid__items') ??
    document.querySelector('.jet-listing-grid__items')
  if (!grid) return { error: 'grid not found' }
  const gridRect = grid.getBoundingClientRect()
  const items = [...grid.querySelectorAll('.jet-listing-grid__item')].map((el) => {
    const r = el.getBoundingClientRect()
    const title = el.querySelector('h1,h2,h3,h4,h5,h6,.elementor-heading-title')
    const link = el.querySelector('a[href*="product"], h5 a, .elementor-heading-title a, a')
    const img = el.querySelector('img')
    const imgRect = img?.getBoundingClientRect()
    const badge = [...el.querySelectorAll('*')]
      .map((n) =>
        n.childNodes.length === 1 && n.textContent?.trim().match(/^-\d+%$/)
          ? n.textContent.trim()
          : null,
      )
      .find(Boolean)
    const prices = [...el.querySelectorAll('.woocommerce-Price-amount, .price')].map((n) =>
      n.textContent?.replace(/\s+/g, ' ').trim(),
    )
    const priceText = el.textContent?.match(/[\d,.]+\s*₪|₪\s*[\d,.]+/g)
    return {
      title: title?.textContent?.trim(),
      href: link?.getAttribute('href'),
      img: img?.currentSrc || img?.src,
      imgBox: imgRect
        ? {
            x: Math.round(imgRect.x),
            y: Math.round(imgRect.y + scrollY),
            w: Math.round(imgRect.width),
            h: Math.round(imgRect.height),
          }
        : null,
      badge,
      prices,
      priceText,
      box: {
        x: Math.round(r.x),
        y: Math.round(r.y + scrollY),
        w: Math.round(r.width),
        h: Math.round(r.height),
      },
    }
  })
  return {
    gridBox: { x: Math.round(gridRect.x), w: Math.round(gridRect.width) },
    count: items.length,
    items,
  }
})

console.log(JSON.stringify(out, null, 1))
await b.close()
