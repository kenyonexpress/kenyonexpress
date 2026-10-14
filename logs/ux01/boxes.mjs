import { chromium } from '@playwright/test'
const SEL = [
  'header',
  'section[aria-label="אזור ראשי"]',
  'aside[aria-label="קטגוריות"]',
  'aside[aria-label="קטגוריות"] ul',
  '[data-hero-slider]',
  '.hero-welcome-copy',
  '.hero-welcome-promo-large',
  '[aria-label="ניווט שקופיות"]',
  'section[aria-label="קטגוריות מובילות"]',
  'section[aria-label="קטגוריות מובילות"] ul',
  'section[aria-label="קטגוריות מובילות"] li',
  'section[aria-label="קטגוריות מובילות"] li h2',
  '.benefit-bar__list',
  '.benefit-bar__item',
  '.p_con',
  '.p_con__title',
  '.p_con__image',
  '.p_con__prices',
  '.p_con .atc',
]
const b = await chromium.launch()
for (const width of (process.argv[2] ?? '380,768,1440').split(',').map(Number)) {
  const ctx = await b.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 })
  await ctx.addCookies([
    { name: 'ke_consent', value: encodeURIComponent('granted.2'), domain: 'localhost', path: '/' },
  ])
  const page = await ctx.newPage()
  await page.goto(process.env.LOCAL_BASE ?? 'http://localhost:3311/', { waitUntil: 'networkidle' })
  const out = await page.evaluate((sels) => {
    const r = (el) => {
      const b = el.getBoundingClientRect()
      return `x${Math.round(b.left)}-${Math.round(b.right)} y${Math.round(b.top + scrollY)}-${Math.round(b.bottom + scrollY)} (${Math.round(b.width)}x${Math.round(b.height)})`
    }
    return sels.map((s) => {
      const els = [...document.querySelectorAll(s)].slice(0, 2)
      return `${s}: ${els.map(r).join(' | ') || 'none'}`
    })
  }, SEL)
  console.log(`=== ${width}`)
  console.log(out.join('\n'))
  await ctx.close()
}
await b.close()
