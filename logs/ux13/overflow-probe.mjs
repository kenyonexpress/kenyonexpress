// UX13: which element pushes a 320px page to 323px. Every route carrying the
// site footer failed e2e/rtl-mobile.spec.ts at 323px after the footer change;
// the footer-less auth routes passed. This names the widest boxes.
import { chromium } from '@playwright/test'
const BASE = process.env.BASE ?? 'http://localhost:3348'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 320, height: 800 } })
await page.addInitScript(() => {
  localStorage.setItem('ke_consent', JSON.stringify({ v: 1, analytics: false, marketing: false }))
})
await page.goto(`${BASE}/contact`, { waitUntil: 'networkidle' })
const r = await page.evaluate(() => {
  const out = []
  for (const el of document.querySelectorAll('body *')) {
    const b = el.getBoundingClientRect()
    if (b.right > 320.5 || b.left < -0.5) {
      out.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.getAttribute('class') ?? '').slice(0, 90),
        left: +b.left.toFixed(1),
        right: +b.right.toFixed(1),
        w: +b.width.toFixed(1),
        inFooter: !!el.closest('footer'),
      })
    }
  }
  return { scrollWidth: document.documentElement.scrollWidth, out: out.slice(0, 25) }
})
console.log(JSON.stringify(r, null, 1))
await browser.close()
