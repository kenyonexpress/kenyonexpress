// One-off probe: dump every child rect inside the first product card on the live
// archive and on ours, to account for the card-height delta line by line.
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache
}

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1440, height: 2600 }, deviceScaleFactor: 1 })

const probe = async (label, url, cardSel) => {
  const p = await ctx.newPage()
  try {
    await p.goto(url, { waitUntil: 'networkidle', timeout: 120000 })
  } catch {
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 })
  }
  await p.waitForTimeout(url.includes('localhost') ? 2000 : 4000)
  const out = await p.evaluate((sel) => {
    const card = document.querySelector(sel)
    if (!card) return { error: `no ${sel}` }
    const base = card.getBoundingClientRect()
    const rows = []
    const walk = (el, depth) => {
      const b = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      if (b.height > 0 || b.width > 0) {
        rows.push({
          d: depth,
          tag: `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ').slice(0, 2).join('.')}`,
          relTop: +(b.top - base.top).toFixed(1),
          h: +b.height.toFixed(1),
          w: +b.width.toFixed(1),
          fs: cs.fontSize,
          lh: cs.lineHeight,
          m: `${cs.marginTop}/${cs.marginBottom}`,
          p: `${cs.paddingTop}/${cs.paddingBottom}`,
          txt: el.childElementCount === 0 ? el.textContent.trim().slice(0, 24) : '',
        })
      }
      if (depth < 4) for (const c of el.children) walk(c, depth + 1)
    }
    walk(card, 0)
    return { cardH: +base.height.toFixed(1), cardW: +base.width.toFixed(1), rows }
  }, cardSel)
  await p.close()
  console.log(`\n===== ${label}  cardH=${out.cardH}`)
  for (const r of out.rows ?? [])
    console.log(
      `${'  '.repeat(r.d)}${r.tag}  top=${r.relTop} h=${r.h} w=${r.w} fs=${r.fs} lh=${r.lh} m=${r.m} p=${r.p} ${r.txt}`,
    )
  if (out.error) console.log(out.error)
}

await probe(
  'LIVE',
  'https://kenyonexpress.co.il/product-category/hot-deals/',
  'ul.products li.product',
)
await probe('MINE', 'http://localhost:3000/category/hot-deals', '.category-products__item')
await b.close()
