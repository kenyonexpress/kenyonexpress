import { writeFileSync } from 'node:fs'
// UX06 probe: the hero's three columns at 1440 (and the row at 380/768).
// Reads: column rects, the promo column's three blocks (rect, hairline,
// text lines: size/weight/line-height/right edge, action row, image), and
// writes a crop of the promo column for the eye.
import { chromium } from '@playwright/test'
const BASE = process.env.BASE ?? 'http://localhost:3345'
const TAG = process.env.TAG ?? 'before'
const browser = await chromium.launch()
const out = {}
const consent = () => {
  localStorage.setItem('ke_consent', JSON.stringify({ v: 1, analytics: false, marketing: false }))
}
const _r = (b) =>
  b && {
    x: Math.round(b.x * 100) / 100,
    y: Math.round(b.y * 100) / 100,
    w: Math.round(b.width * 100) / 100,
    h: Math.round(b.height * 100) / 100,
  }
for (const width of [380, 768, 1440]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 })
  await ctx.addInitScript(consent)
  const page = await ctx.newPage()
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.locator('[data-hero-slider]').waitFor()
  await page.waitForTimeout(500)
  out[width] = await page.evaluate(() => {
    const r = (el) => {
      if (!el) return null
      const b = el.getBoundingClientRect()
      return {
        x: +b.x.toFixed(2),
        y: +b.y.toFixed(2),
        w: +b.width.toFixed(2),
        h: +b.height.toFixed(2),
      }
    }
    const cs = (el, props) => {
      const s = getComputedStyle(el)
      return Object.fromEntries(props.map((p) => [p, s[p]]))
    }
    const section = document.querySelector('section[aria-label="אזור ראשי"]')
    const aside = section.querySelector('aside')
    const centre = section.querySelector('[data-hero-slider]')
    const promo = section.querySelector('.slider-das-block')
    const res = {
      section: r(section),
      aside: r(aside),
      asideList: r(aside?.querySelector('ul')),
      slider: r(centre),
      promo: r(promo),
      promoDisplay: promo ? getComputedStyle(promo).display : null,
    }
    if (promo && getComputedStyle(promo).display !== 'none') {
      res.blocks = [...promo.querySelectorAll('a')].map((a) => {
        const text = a.querySelector('.da-text')
        const lines = text ? [...text.querySelectorAll(':scope > span')] : []
        const action = a.querySelector('.da-action')
        const circle = action?.querySelector('span')
        const img = a.querySelector('[aria-hidden="true"]')
        return {
          rect: r(a),
          border: cs(a, [
            'borderTopWidth',
            'borderTopColor',
            'borderBottomWidth',
            'borderBottomColor',
            'paddingTop',
            'paddingRight',
            'paddingBottom',
            'paddingLeft',
            'minHeight',
            'overflow',
          ]),
          text: text && {
            rect: r(text),
            ...cs(text, [
              'fontSize',
              'fontWeight',
              'lineHeight',
              'textTransform',
              'color',
              'textAlign',
            ]),
          },
          lines: lines.map((l) => ({
            rect: r(l),
            ...cs(l, ['fontSize', 'lineHeight', 'fontWeight']),
            strong: [...l.querySelectorAll('strong')].map((s) => ({
              rect: r(s),
              ...cs(s, ['fontSize', 'fontWeight']),
            })),
          })),
          action: action && {
            rect: r(action),
            ...cs(action, ['fontSize', 'fontWeight', 'lineHeight', 'marginTop']),
            circle: circle && {
              rect: r(circle),
              ...cs(circle, ['backgroundColor', 'width', 'height']),
            },
            textNode: action.textContent.trim(),
          },
          image: img && {
            rect: r(img),
            ...cs(img, ['transform', 'width', 'height', 'bottom', 'left', 'right']),
          },
        }
      })
    }
    return res
  })
  if (width === 1440) {
    const promo = page.locator('.slider-das-block')
    await promo.screenshot({ path: `logs/ux06/${TAG}-1440-promo.png` })
    const sec = page.locator('section[aria-label="אזור ראשי"]')
    await sec.screenshot({ path: `logs/ux06/${TAG}-1440-hero.png` })
  }
  await ctx.close()
}
await browser.close()
writeFileSync(`logs/ux06/${TAG}.json`, JSON.stringify(out, null, 2))
console.log(JSON.stringify(out[1440], null, 1).slice(0, 6000))
