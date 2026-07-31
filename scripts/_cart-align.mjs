import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'
if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const c = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(c)) process.env.PLAYWRIGHT_BROWSERS_PATH = c
}
const b = await chromium.launch()
const probe = async (url, sel) => {
  const p = await b.newPage({ viewport: { width: 1440, height: 1200 }, locale: 'he-IL' })
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await p.waitForTimeout(5000)
  const out = await p.evaluate((s) => {
    const g = (q) => {
      const e = document.querySelector(q)
      if (!e) return null
      const r = e.getBoundingClientRect()
      return {
        y: Math.round(r.y + scrollY),
        h: Math.round(r.height),
        x: Math.round(r.x),
        w: Math.round(r.width),
      }
    }
    return { banner: g(s.banner), button: g(s.button), crumb: g(s.crumb), footer: g(s.footer) }
  }, sel)
  await p.close()
  return out
}
const live = await probe('https://kenyonexpress.co.il/cart/', {
  banner: '.cart-empty.woocommerce-info',
  button: '.wc-backward',
  crumb: '.woocommerce-breadcrumb',
  footer: '.newsletter, .footer-newsletter, footer',
})
const mine = await probe('http://localhost:3000/cart', {
  banner: '.cart-empty',
  button: '.cart-empty__cta',
  crumb: '.cart-page__breadcrumb',
  footer: '.newsletter, [class*="newsletter"], footer',
})
console.log('live', JSON.stringify(live, null, 1))
console.log('mine', JSON.stringify(mine, null, 1))
await b.close()
