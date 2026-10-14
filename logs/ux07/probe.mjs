import { writeFileSync } from 'node:fs'
// UX07 probe: the "קטגוריות" tile grid under the deals (CategoryGrid) at
// 380/768/1440. Reads: section/list rect, tile count, per tile the link's
// rect, radius, resting shadow, hover shadow, the picture's transform at rest
// and under hover, whether a real <img> painted (naturalWidth > 0) or the
// fallback box is showing, and the label text (and whether it carries an
// emoji). Writes a crop of the section for the eye.
import { chromium } from '@playwright/test'
const BASE = process.env.BASE ?? 'http://localhost:3346'
const TAG = process.env.TAG ?? 'before'
const browser = await chromium.launch()
const out = {}
const consent = () => {
  localStorage.setItem('ke_consent', JSON.stringify({ v: 1, analytics: false, marketing: false }))
}
for (const width of [380, 768, 1440]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 })
  await ctx.addInitScript(consent)
  const page = await ctx.newPage()
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  const section = page.locator('section[aria-labelledby="home-categories-title"]')
  await section.waitFor()
  await section.scrollIntoViewIfNeeded()
  await page.waitForTimeout(600)
  const read = async (hover) =>
    page.evaluate(
      ({ hover }) => {
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
        const section = document.querySelector('section[aria-labelledby="home-categories-title"]')
        const ul = section.querySelector('ul')
        const tiles = [...ul.querySelectorAll('li > a')]
        return {
          section: r(section),
          list: r(ul),
          columns: getComputedStyle(ul).gridTemplateColumns.split(' ').length,
          gap: getComputedStyle(ul).gap,
          count: tiles.length,
          tiles: tiles.map((a) => {
            const s = getComputedStyle(a)
            const img = a.querySelector('img')
            const fallback = a.querySelector('div[class*="bg-"]')
            const label = a.querySelector('span')?.textContent ?? ''
            const media = img ?? fallback
            return {
              href: a.getAttribute('href'),
              rect: r(a),
              radius: s.borderRadius,
              shadow: s.boxShadow,
              border: `${s.borderTopWidth} ${s.borderTopColor}`,
              transition: s.transitionProperty,
              img: img
                ? {
                    src: img.currentSrc || img.getAttribute('src'),
                    natural: img.naturalWidth,
                    rect: r(img),
                  }
                : null,
              fallback: !img && !!fallback,
              mediaTransform: media ? getComputedStyle(media).transform : null,
              mediaScale: media ? getComputedStyle(media).scale : null,
              mediaOverflow: media?.parentElement
                ? getComputedStyle(media.parentElement).overflow
                : null,
              label,
              labelEmoji: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(label),
              hovered: hover,
            }
          }),
        }
      },
      { hover },
    )
  const rest = await read(false)
  const first = section.locator('li > a').first()
  await first.hover()
  await page.waitForTimeout(500)
  const hovered = await read(true)
  out[width] = {
    rest,
    hoverFirst: hovered.tiles[0],
    emojiLabels: rest.tiles.filter((t) => t.labelEmoji).map((t) => t.label),
    fallbacks: rest.tiles
      .filter((t) => t.fallback || (t.img && t.img.natural === 0))
      .map((t) => t.href),
  }
  await page.mouse.move(0, 0)
  await page.waitForTimeout(300)
  await section.screenshot({ path: `logs/ux07/${TAG}-${width}.png` })
  await ctx.close()
}
await browser.close()
writeFileSync(`logs/ux07/${TAG}.json`, JSON.stringify(out, null, 2))
for (const w of Object.keys(out)) {
  const o = out[w]
  console.log(
    w,
    'tiles',
    o.rest.count,
    'cols',
    o.rest.columns,
    'radius',
    o.rest.tiles[0]?.radius,
    'shadow',
    o.rest.tiles[0]?.shadow,
    '| hover shadow',
    o.hoverFirst?.shadow,
    'hover transform',
    o.hoverFirst?.mediaTransform,
    'hover scale',
    o.hoverFirst?.mediaScale,
    'rest scale',
    o.rest.tiles[0]?.mediaScale,
    '| emoji',
    o.emojiLabels,
    '| fallbacks',
    o.fallbacks.length,
  )
}
