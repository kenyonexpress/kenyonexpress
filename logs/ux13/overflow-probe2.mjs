// UX13: is the 323px page width the footer's doing? Read scrollWidth with the
// footer in the DOM and with it removed, and list only footer boxes past 320.
import { chromium } from '@playwright/test'
const BASE = process.env.BASE ?? 'http://localhost:3348'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 320, height: 800 } })
await page.addInitScript(() => {
  localStorage.setItem('ke_consent', JSON.stringify({ v: 1, analytics: false, marketing: false }))
})
for (const route of ['/contact', '/']) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  const r = await page.evaluate(() => {
    const footer = document.querySelector('footer')
    const over = []
    for (const el of footer.querySelectorAll('*')) {
      const b = el.getBoundingClientRect()
      if (b.right > 320.5 || b.left < -0.5)
        over.push({
          tag: el.tagName,
          cls: (el.getAttribute('class') ?? '').slice(0, 60),
          l: b.left,
          r: b.right,
        })
    }
    const withFooter = document.documentElement.scrollWidth
    const footerBox = footer.getBoundingClientRect().width
    footer.remove()
    const withoutFooter = document.documentElement.scrollWidth
    const header = document.querySelector('header')
    header?.remove()
    const withoutHeader = document.documentElement.scrollWidth
    return { withFooter, footerBox, footerOverflow: over.slice(0, 5), withoutFooter, withoutHeader }
  })
  console.log(route, JSON.stringify(r))
}
await browser.close()
