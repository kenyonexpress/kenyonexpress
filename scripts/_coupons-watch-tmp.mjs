import { chromium } from '@playwright/test'
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 412, height: 823 } })
const p = await ctx.newPage()
p.on('console', (m) => console.log('[console]', m.type(), m.text().slice(0, 200)))
p.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)))
p.on('framenavigated', (f) => console.log('[nav]', f.url()))
await p.goto('http://localhost:3455/coupons', { waitUntil: 'load' })
for (const t of [500, 2000, 5000, 8000, 9000, 10000, 11000]) {
  await p.waitForTimeout(t === 500 ? 500 : 1000)
  const info = await p.evaluate(() => ({
    h: document.body.scrollHeight,
    cards: document.querySelectorAll('a[href^="/coupons/"]').length,
    footer: !!document.querySelector('footer'),
    main: document.querySelector('main')?.getBoundingClientRect().height ?? -1,
    text: (document.querySelector('main')?.textContent || '').trim().slice(0, 60),
  }))
  console.log(t, JSON.stringify(info))
}
await b.close()
