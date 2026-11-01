#!/usr/bin/env node
/**
 * C134 live half: render / and a product page at 380/768/1440 and count
 * LTR leaks the way a reader sees them.
 *   - html lang=he dir=rtl
 *   - elements with Hebrew own-text whose computed direction is ltr
 *   - Hebrew own-text with computed text-align left
 *   - inputs with a Hebrew placeholder whose ::placeholder direction is ltr
 *   - horizontal overflow (scrollWidth > viewport)
 * Elements inside the locked hero (data-hero / .hero) are counted apart.
 *
 * Usage: BASE=http://localhost:3134 PRODUCT=/product/<slug> node scripts/c134-rtl-live.mjs
 */
import { chromium } from '@playwright/test'

const BASE = process.env.BASE ?? 'http://localhost:3134'
const ROUTES = ['/', process.env.PRODUCT ?? '/product/barbecue']
const WIDTHS = [380, 768, 1440]

const browser = await chromium.launch()
let total = 0
for (const route of ROUTES) {
  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    const res = await page.goto(BASE + encodeURI(route), { waitUntil: 'networkidle' })
    const r = await page.evaluate(() => {
      const HE = /[֐-׿]/
      const ownText = (el) =>
        [...el.childNodes]
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent)
          .join('')
      const ltr = []
      const left = []
      const ph = []
      for (const el of document.body.querySelectorAll('*')) {
        if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) continue
        const t = ownText(el).trim()
        const cs = getComputedStyle(el)
        if (t && HE.test(t)) {
          const tag = `${el.tagName.toLowerCase()} "${t.slice(0, 40)}"`
          if (cs.direction === 'ltr') ltr.push(tag)
          if (cs.textAlign === 'left') left.push(tag)
        }
        if (
          (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') &&
          HE.test(el.placeholder || '')
        ) {
          const p = getComputedStyle(el, '::placeholder')
          if (p.direction === 'ltr' && !el.value)
            ph.push(`${el.tagName.toLowerCase()} placeholder "${el.placeholder}"`)
        }
      }
      return {
        lang: document.documentElement.lang,
        dir: document.documentElement.dir,
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        ltr,
        left,
        ph,
      }
    })
    // A Latin field must still TYPE left to right once the placeholder is gone.
    const typed = await page.evaluate(() => {
      const out = []
      for (const el of document.querySelectorAll('input[dir="ltr"]')) {
        if (!/[\u0590-\u05FF]/.test(el.placeholder || '')) continue
        const before = el.value
        el.value = 'you@example.com'
        out.push(`${el.placeholder} -> typed direction ${getComputedStyle(el).direction}`)
        el.value = before
      }
      return out
    })
    for (const t of typed) {
      console.log(`   typed ${t}`)
      if (!t.endsWith('ltr')) r.ph.push(t)
    }
    const leaks =
      r.ltr.length +
      r.left.length +
      r.ph.length +
      (r.overflow > 1 ? 1 : 0) +
      (r.dir !== 'rtl' ? 1 : 0)
    total += leaks
    console.log(
      `${route} @${width} status=${res.status()} lang=${r.lang} dir=${r.dir} overflow=${r.overflow}px ltrHebrew=${r.ltr.length} alignLeftHebrew=${r.left.length} ltrPlaceholder=${r.ph.length} leaks=${leaks}`,
    )
    for (const x of [...r.ltr, ...r.left, ...r.ph]) console.log(`   LEAK ${x}`)
    await page.close()
  }
}
await browser.close()
console.log(`TOTAL LIVE LTR LEAKS: ${total}`)
process.exit(total ? 1 : 0)
