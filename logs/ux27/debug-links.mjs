import { chromium } from '@playwright/test'
const browser = await chromium.launch()
for (const width of [1280, 390]) {
  const ctx = await browser.newContext({ viewport: { width, height: 720 }, locale: 'he-IL' })
  await ctx.addCookies([{ name: 'ke_consent', value: 'denied.2', domain: 'localhost', path: '/' }])
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log(width, 'pageerror', String(e).slice(0, 160)))
  await page.goto('http://localhost:3364/products', { waitUntil: 'commit' })
  const t0 = Date.now()
  let last = null
  while (Date.now() - t0 < 5000) {
    const s = await page.evaluate(() => ({
      links: document.querySelectorAll('a[href^="/product/"]').length,
      items: document.querySelectorAll('li.category-products__item').length,
      pending: document.querySelectorAll('[data-pending-card]').length,
      busy: document.querySelector('ul.category-products')?.getAttribute('aria-busy') ?? null,
      hydrated: !!document.querySelector('.category-load-more, nav.category-pagination'),
    }))
    const k = JSON.stringify(s)
    if (k !== last) {
      console.log(width, Date.now() - t0, k)
      last = k
    }
    await new Promise((r) => setTimeout(r, 50))
  }
  await ctx.close()
}
await browser.close()
