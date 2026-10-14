import { writeFileSync } from 'node:fs'
// UX11 probe: the brands row (BrandsRow, "בתי העסק שלנו") at 380 / 768 / 1440.
// Reads the list's layout (display, columns, overflow, scroll width against
// client width, snap type), every tile's rect, whether it carries a logo or
// a wordmark, the computed filter/opacity at rest and under hover, and the
// link count. Before UX11 the section does not exist, so the "before" run
// records its absence and, as the only brand surface the site had, the
// /merchants card's logo box.
import { chromium } from '@playwright/test'
const BASE = process.env.BASE ?? 'http://localhost:3346'
const TAG = process.env.TAG ?? 'before'
const WIDTHS = (process.env.WIDTHS ?? '380,768,1440').split(',').map(Number)
const browser = await chromium.launch()
const out = {}
const consent = () => {
  localStorage.setItem('ke_consent', JSON.stringify({ v: 1, analytics: false, marketing: false }))
}
const SEL = 'section[aria-labelledby="home-brands-title"]'
const rect = `(el) => {
  if (!el) return null
  const b = el.getBoundingClientRect()
  return { x: +b.x.toFixed(2), y: +b.y.toFixed(2), w: +b.width.toFixed(2), h: +b.height.toFixed(2) }
}`
for (const width of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 })
  await ctx.addInitScript(consent)
  const page = await ctx.newPage()
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  const section = page.locator(SEL)
  if ((await section.count()) === 0) {
    // The merchants directory card is where a supplier logo is shown today.
    await page.goto(`${BASE}/merchants`, { waitUntil: 'networkidle' })
    out[width] = await page.evaluate((rectSrc) => {
      const r = new Function(`return ${rectSrc}`)()
      const cards = [...document.querySelectorAll('article')]
      const first = cards[0]
      const logoBox = first?.querySelector('a[aria-hidden="true"]')
      const img = logoBox?.querySelector('img')
      return {
        present: false,
        merchants: {
          cards: cards.length,
          card: r(first),
          logoBox: r(logoBox),
          logoImg: r(img),
          filter: img ? getComputedStyle(img).filter : null,
          withLogo: cards.filter((c) => c.querySelector('img')).length,
        },
      }
    }, rect)
    await ctx.close()
    continue
  }
  await section.scrollIntoViewIfNeeded()
  await page.waitForTimeout(800)
  const read = async (phase) =>
    page.evaluate(
      ([SEL, rectSrc, phase]) => {
        const r = new Function(`return ${rectSrc}`)()
        const section = document.querySelector(SEL)
        const h2 = section.querySelector('h2')
        const more = section.querySelector('a[href="/merchants"]')
        const list = section.querySelector('[data-brands-list]')
        const ls = getComputedStyle(list)
        const tiles = [...list.children].map((tile, i) => {
          const link = tile.querySelector('a')
          const img = tile.querySelector('img')
          const word = tile.querySelector('[data-brand-wordmark]')
          const visual = img ?? word
          const vs = visual ? getComputedStyle(visual) : null
          return {
            i,
            rect: r(tile),
            link: r(link),
            kind: img ? 'logo' : word ? 'wordmark' : 'none',
            alt: img?.getAttribute('alt') ?? null,
            text: word?.textContent?.trim() ?? null,
            visual: r(visual),
            filter: vs?.filter ?? null,
            opacity: vs?.opacity ?? null,
            color: vs?.color ?? null,
            fontSize: vs?.fontSize ?? null,
            fontWeight: vs?.fontWeight ?? null,
            radius: getComputedStyle(tile).borderRadius,
            border: getComputedStyle(tile).borderTopWidth,
            snap: getComputedStyle(tile).scrollSnapAlign,
            links: tile.querySelectorAll('a').length,
          }
        })
        const rows = []
        for (const t of tiles) {
          const y = Math.round(t.rect.y)
          let row = rows.find((rw) => Math.abs(rw.y - y) < 2)
          if (!row) {
            row = { y, items: [] }
            rows.push(row)
          }
          row.items.push(t.i)
        }
        const distinct = (a) => [...new Set(a.map((v) => +v.toFixed(1)))].sort((p, q) => p - q)
        return {
          phase,
          heading: { rect: r(h2), text: h2.textContent.trim() },
          more: { rect: r(more), text: more?.textContent?.trim() ?? null },
          list: {
            rect: r(list),
            display: ls.display,
            columns: ls.gridTemplateColumns,
            overflowX: ls.overflowX,
            snapType: ls.scrollSnapType,
            gap: ls.gap,
            scrollWidth: list.scrollWidth,
            clientWidth: list.clientWidth,
            scrollable: list.scrollWidth > list.clientWidth + 1,
          },
          hoverCapable: matchMedia('(hover: hover)').matches,
          count: tiles.length,
          columnsPerRow: rows.map((rw) => rw.items.length),
          tileHeights: distinct(tiles.map((t) => t.rect.h)),
          tileWidths: distinct(tiles.map((t) => t.rect.w)),
          tiles,
        }
      },
      [SEL, rect, phase],
    )
  const rest = await read('rest')
  const first = section.locator('[data-brands-list] > *').first()
  await first.hover()
  await page.waitForTimeout(400)
  const hovered = await read('hover')
  out[width] = {
    present: true,
    rest,
    hoverFirst: hovered.tiles[0],
  }
  await section.screenshot({ path: `logs/ux11/${TAG}-${width}.png` })
  await ctx.close()
}
await browser.close()
writeFileSync(`logs/ux11/${TAG}.json`, JSON.stringify(out, null, 2))
for (const [w, v] of Object.entries(out)) {
  if (!v.present) {
    console.log(w, 'absent; /merchants', JSON.stringify(v.merchants))
    continue
  }
  const t = v.rest
  console.log(
    w,
    'display',
    t.list.display,
    'cols',
    t.list.columns,
    'overflowX',
    t.list.overflowX,
    'scrollable',
    t.list.scrollable,
    `${t.list.scrollWidth}/${t.list.clientWidth}`,
    'rows',
    t.columnsPerRow.join('/'),
    'tileH',
    t.tileHeights.join('/'),
    'tileW',
    t.tileWidths.join('/'),
    'kinds',
    t.tiles.map((x) => x.kind[0]).join(''),
    'rest',
    t.tiles[0]?.filter,
    t.tiles[0]?.opacity,
    'hover',
    v.hoverFirst?.filter,
    v.hoverFirst?.opacity,
    'hoverCapable',
    t.hoverCapable,
  )
}
