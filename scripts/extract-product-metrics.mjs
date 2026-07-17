// Extract computed metrics from live product page and local product page for comparison report.
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache
}

const SLUG = encodeURIComponent('מוצר-לדוגמא')
const LIVE_URL = `https://kenyonexpress.co.il/product/${SLUG}/`
const MINE_URL = `http://localhost:3000/product/${SLUG}`

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1440, height: 2600 }, deviceScaleFactor: 1 })

const probe = async (url, wait) => {
  const p = await ctx.newPage()
  try { await p.goto(url, { waitUntil: 'networkidle', timeout: 60000 }) }
  catch { await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }) }
  await p.waitForTimeout(wait)
  const data = await p.evaluate(() => {
    const info = (el) => {
      if (!el) return null
      const cs = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      return {
        text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60),
        rect: { x: Math.round(r.x + scrollX), y: Math.round(r.y + scrollY), w: Math.round(r.width), h: Math.round(r.height) },
        fontSize: cs.fontSize, fontWeight: cs.fontWeight, color: cs.color,
        bg: cs.backgroundColor, radius: cs.borderRadius, border: cs.border,
        padding: cs.padding, margin: cs.margin, fontFamily: cs.fontFamily.split(',')[0],
      }
    }
    const q = (sel) => document.querySelector(sel)
    const byText = (sel, txt) => [...document.querySelectorAll(sel)].find(e => (e.textContent || '').includes(txt))
    const out = {}
    out.breadcrumb = info(q('.woocommerce-breadcrumb') || q('nav[aria-label*="breadcrumb" i]') || q('[class*="breadcrumb" i]'))
    out.title = info(q('h1'))
    out.gallery = info(q('.woocommerce-product-gallery') || q('[class*="gallery" i]') || q('main img'))
    out.priceWrap = info(q('.summary .price') || q('[class*="price" i]'))
    out.priceCurrent = info(q('.summary .price ins .amount') || q('.summary .price > .amount') || byText('[class*="price" i] *', '99'))
    out.priceOld = info(q('.summary .price del .amount') || q('del .amount') || q('del') || q('s'))
    out.qty = info(q('.quantity') || q('[class*="quantity" i]') || q('input[type="number"]'))
    out.addToCart = info(q('.single_add_to_cart_button') || byText('button', 'הוספה לסל') || byText('button', 'הוסף לסל'))
    out.buyNow = info(byText('button, a', 'קנה עכשיו') || byText('button, a', 'קנייה מהירה'))
    out.related = info(q('.related') || byText('h2, section h2, [class*="related" i] h2', 'מומלצים') || byText('h2', 'מוצרים נוספים'))
    out.summaryCol = info(q('.summary.entry-summary') || q('[class*="summary" i]'))
    out.bodyFont = getComputedStyle(document.body).fontFamily.split(',')[0]
    out.pageHeight = document.documentElement.scrollHeight
    return out
  })
  await p.close()
  return data
}

const [liveData, mineData] = [await probe(LIVE_URL, 4000), await probe(MINE_URL, 2000)]
await b.close()

console.log(JSON.stringify({ live: liveData, mine: mineData }, null, 2))
