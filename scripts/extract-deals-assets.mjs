// Save the first 16 deals-grid images from the rendered singlefile to
// public/images/products/ke-live-deal-<n>.<ext> + print per-item metadata.
import { chromium } from '@playwright/test'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

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

const items = await page.evaluate(() => {
  const grid = document.querySelector('.elementor-element-faf8583 .jet-listing-grid__items')
    ?? document.querySelector('.jet-listing-grid__items')
  return [...grid.querySelectorAll('.jet-listing-grid__item')].slice(0, 16).map((el) => {
    const img = el.querySelector('img')
    const cat = el.querySelector('a[href*="product-category"]')
    const title = el.querySelector('h1,h2,h3,h4,h5,h6,.elementor-heading-title')
    const strike = el.querySelector('del .woocommerce-Price-amount, del')
    const sale = el.querySelector('ins .woocommerce-Price-amount, ins')
    const text = el.textContent ?? ''
    return {
      title: title?.textContent?.trim(),
      category: cat?.textContent?.trim(),
      categoryHref: cat?.getAttribute('href'),
      strike: strike?.textContent?.trim(),
      sale: sale?.textContent?.trim(),
      prices: text.match(/₪\s*[\d,.]+/g),
      imgData: img?.currentSrc?.startsWith('data:') ? img.currentSrc : null,
      imgSrc: img && !img.currentSrc?.startsWith('data:') ? img.currentSrc : null,
    }
  })
})
await b.close()

mkdirSync('public/images/products', { recursive: true })
const meta = []
items.forEach((it, n) => {
  let file = null
  if (it.imgData) {
    const m = it.imgData.match(/^data:image\/(\w+);base64,(.+)$/s)
    if (m) {
      const ext = m[1] === 'jpeg' ? 'jpg' : m[1]
      file = `public/images/products/ke-live-deal-${n}.${ext}`
      writeFileSync(file, Buffer.from(m[2], 'base64'))
    }
  }
  meta.push({ n, title: it.title, category: it.category, categoryHref: it.categoryHref,
    strike: it.strike, sale: it.sale, prices: it.prices, file, imgSrc: it.imgSrc })
})
console.log(JSON.stringify(meta, null, 1))
