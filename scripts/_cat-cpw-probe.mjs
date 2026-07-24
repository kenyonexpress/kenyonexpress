// One-off probe: the exact markup + computed styles of the live card blocks we
// do not render yet (custom-price-wrapper, price-add-to-cart, badges).
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache
}

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1440, height: 2600 }, deviceScaleFactor: 1 })
const p = await ctx.newPage()
await p.goto('https://kenyonexpress.co.il/product-category/hot-deals/', { waitUntil: 'networkidle' })
await p.waitForTimeout(4000)

const out = await p.evaluate(() => {
  const cards = [...document.querySelectorAll('ul.products li.product')]
  return cards.map((card) => {
    const grab = (sel) => {
      const el = card.querySelector(sel)
      if (!el) return null
      const cs = getComputedStyle(el)
      const b = el.getBoundingClientRect()
      return {
        html: el.outerHTML.replace(/\s+/g, ' ').slice(0, 900),
        h: +b.height.toFixed(1),
        w: +b.width.toFixed(1),
        font: `${cs.fontSize}/${cs.lineHeight} ${cs.fontWeight}`,
        color: cs.color,
        bg: cs.backgroundColor,
        pad: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`,
        margin: `${cs.marginTop} ${cs.marginRight} ${cs.marginBottom} ${cs.marginLeft}`,
        display: cs.display,
        align: cs.textAlign,
      }
    }
    const kids = [...(card.querySelector('.custom-price-wrapper')?.children ?? [])].map((el) => {
      const cs = getComputedStyle(el)
      const b = el.getBoundingClientRect()
      return {
        tag: `${el.tagName.toLowerCase()}.${(el.className || '').toString()}`,
        text: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 60),
        h: +b.height.toFixed(1),
        font: `${cs.fontSize}/${cs.lineHeight} ${cs.fontWeight}`,
        color: cs.color,
        pad: `${cs.paddingTop} ${cs.paddingBottom}`,
        margin: `${cs.marginTop} ${cs.marginBottom}`,
        border: cs.borderTop,
        display: cs.display,
      }
    })
    return {
      title: card.querySelector('.woocommerce-loop-product__title')?.textContent.trim(),
      customPriceWrapper: grab('.custom-price-wrapper'),
      cpwChildren: kids,
      priceAddToCart: grab('.price-add-to-cart'),
      badge: grab('.onsale, .badge, .out-of-stock'),
    }
  })
})

console.log(JSON.stringify(out, null, 1))
await b.close()
