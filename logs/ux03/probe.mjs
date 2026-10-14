// UX03 probe: header geometry at the three gate widths, before/after.
import { chromium } from '@playwright/test'
const BASE = process.env.BASE ?? 'http://localhost:3344'
const COUNT = Number(process.env.COUNT ?? 3)
const browser = await chromium.launch()
const out = {}
for (const width of [380, 768, 1440]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 })
  await ctx.addInitScript((n) => {
    localStorage.setItem('ke_consent', JSON.stringify({ v: 1, analytics: false, marketing: false }))
    if (n > 0)
      localStorage.setItem(
        'ke_cart_mirror_v1',
        JSON.stringify({ state: { mirrorCount: n }, version: 0 }),
      )
  }, COUNT)
  const page = await ctx.newPage()
  if (COUNT > 0 && process.env.BLOCK_CART) await page.route('**/api/cart**', (r) => r.abort())
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  const r = await page.evaluate(() => {
    const box = (el) => {
      if (!el) return null
      const b = el.getBoundingClientRect()
      return {
        x: +b.x.toFixed(1),
        y: +b.y.toFixed(1),
        w: +b.width.toFixed(1),
        h: +b.height.toFixed(1),
      }
    }
    const cs = (el, props) => {
      if (!el) return null
      const s = getComputedStyle(el)
      return Object.fromEntries(props.map((p) => [p, s.getPropertyValue(p)]))
    }
    const header = document.querySelector('header')
    const logo = header.querySelector('img')
    const vis = (el) => el && el.getBoundingClientRect().width > 0
    const links = [...header.querySelectorAll('a,button')].filter(vis)
    const cart = links.find((e) => e.hasAttribute('data-mini-cart-trigger'))
    const heart = links.find((e) => e.getAttribute('href') === '/wishlist')
    const search = links.find((e) =>
      (e.getAttribute('aria-label') || '').startsWith('חיפוש מוצרים'),
    )
    const burger = links.find((e) => /תפריט/.test(e.getAttribute('aria-label') || ''))
    const cartSvg = cart?.querySelector('svg')
    const badge = cart?.querySelector('span.rounded-full')
    const price = cart?.querySelector('span.tabular-nums')
    const input = document.getElementById('masthead-search')
    const pill = input?.parentElement
    return {
      header: box(header),
      logo: { box: box(logo), cs: cs(logo, ['width', 'height']) },
      burger: box(burger),
      search: box(search),
      heart: { box: box(heart), svg: box(heart?.querySelector('svg')), cs: cs(heart, ['color']) },
      cart: { box: box(cart), svg: box(cartSvg), cs: cs(cart, ['color']) },
      badge: badge
        ? {
            box: box(badge),
            text: badge.textContent,
            cs: cs(badge, [
              'font-size',
              'font-weight',
              'background-color',
              'color',
              'width',
              'height',
              'animation-name',
            ]),
          }
        : null,
      price: price
        ? {
            box: box(price),
            text: price.textContent,
            cs: cs(price, ['font-size', 'font-weight', 'color', 'line-height']),
          }
        : null,
      pill: pill
        ? {
            box: box(pill),
            cs: cs(pill, ['border-color', 'outline-style', 'box-shadow', 'overflow']),
          }
        : null,
    }
  })
  if (r.pill && r.pill.box.w > 0) {
    const pillEl = page.locator('#masthead-search').locator('..')
    const before = await pillEl.screenshot()
    await page.keyboard.press('Tab')
    // focus the input by keyboard so :focus-visible applies
    await page.locator('#masthead-search').focus()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    await page.waitForTimeout(100)
    r.focus = await page.evaluate(() => {
      const input = document.getElementById('masthead-search')
      const pill = input.parentElement
      const s = (el, p) => getComputedStyle(el).getPropertyValue(p)
      return {
        active: document.activeElement === input,
        matchesFV: input.matches(':focus-visible'),
        inputOutline: `${s(input, 'outline-style')} ${s(input, 'outline-width')}`,
        inputShadow: s(input, 'box-shadow'),
        pillBorder: s(pill, 'border-color'),
        pillOutline: `${s(pill, 'outline-style')} ${s(pill, 'outline-width')}`,
        pillShadow: s(pill, 'box-shadow'),
      }
    })
    const after = await pillEl.screenshot()
    r.focus.pngBytesDiffer = !before.equals(after)
    await page.screenshot({
      path: `logs/ux03/${process.env.TAG ?? 'before'}-pill-focus-${width}.png`,
      clip: {
        x: r.pill.box.x - 12,
        y: r.pill.box.y - 12,
        width: r.pill.box.w + 24,
        height: r.pill.box.h + 24,
      },
    })
  }
  await page.screenshot({
    path: `logs/ux03/${process.env.TAG ?? 'before'}-header-${width}.png`,
    clip: { x: 0, y: 0, width, height: r.header.y + r.header.h + 4 },
  })
  out[width] = r
  await ctx.close()
}
await browser.close()
console.log(JSON.stringify(out, null, 1))
