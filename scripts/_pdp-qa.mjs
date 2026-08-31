/** QA section 10 (/product/[slug]) probe, against a real built server. */
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'
if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const c = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(c)) process.env.PLAYWRIGHT_BROWSERS_PATH = c
}
const BASE = process.env.LOCAL_BASE ?? 'http://localhost:3421'
const SLUGS = (process.env.SLUGS ?? '').split(',').filter(Boolean)

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 2400 } })
const page = await ctx.newPage()
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text().slice(0, 160))
})

for (const slug of SLUGS) {
  errors.length = 0
  const res = await page.goto(`${BASE}/product/${slug}`, {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  })
  await page.waitForTimeout(2000)
  const snap = await page.evaluate(() => {
    const t = (sel) => document.querySelector(sel)?.textContent.replace(/\s+/g, ' ').trim() ?? null
    const qty = document.querySelector('.pdp-buy__qty')
    const atc = document.querySelector('.pdp-buy__atc')
    const variants = [...document.querySelectorAll('.pdp-summary__variants button')].map((b) => ({
      name: b.textContent.trim(),
      disabled: b.disabled,
      selected: b.className.includes('bg-brand-dark'),
    }))
    const gallery = document.querySelector('[class*="gallery"], .pdp-gallery')
    return {
      title: t('.pdp-summary__title'),
      stock: t('.pdp-summary__stock'),
      price: t('.pdp-summary__price'),
      badge: t('.pdp-summary__badge'),
      meta: t('.pdp-summary__meta'),
      coupon: t('.pdp-coupon'),
      qty: qty ? { value: qty.value, min: qty.min, max: qty.max, disabled: qty.disabled } : null,
      atc: atc ? { label: atc.textContent.trim(), disabled: atc.disabled } : null,
      variants,
      thumbs: document.querySelectorAll('[class*="thumb"] img, .pdp-gallery__thumb').length,
      galleryImgs: gallery ? gallery.querySelectorAll('img').length : 0,
      supplier: [...document.querySelectorAll('*')]
        .filter((e) => e.children.length === 0 && /ספק/.test(e.textContent))
        .map((e) => e.textContent.replace(/\s+/g, ' ').trim())
        .slice(0, 3),
    }
  })
  console.log(`\n## ${slug} (${res?.status()})`)
  console.log(JSON.stringify(snap, null, 1))
  if (errors.length) console.log('CONSOLE ERRORS:', errors.slice(0, 4))
}

// Missing slug, and a Hebrew one.
for (const path of [
  '/product/does-not-exist-xyz',
  `/product/${encodeURIComponent('מוצר-בעברית')}`,
]) {
  const res = await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 90000 })
  const h1 = await page.evaluate(() => document.querySelector('h1')?.textContent.trim() ?? null)
  console.log(`\n## ${path} -> ${res?.status()} | h1=${h1}`)
}

await browser.close()
