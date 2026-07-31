import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'
if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const c = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(c)) process.env.PLAYWRIGHT_BROWSERS_PATH = c
}
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1440, height: 1200 }, locale: 'he-IL' })
await p.goto('https://kenyonexpress.co.il/cart/', { waitUntil: 'domcontentloaded', timeout: 90000 })
await p.waitForTimeout(4000)
console.log(
  JSON.stringify(
    await p.evaluate(() => {
      const el = document.querySelector('.wc-empty-cart-message')
      const walk = (n, d = 0) => {
        const r = n.getBoundingClientRect()
        const cs = getComputedStyle(n)
        const rows = [
          {
            d,
            tag: n.tagName,
            cls: (n.className || '').toString().slice(0, 60),
            x: Math.round(r.x),
            y: Math.round(r.y),
            w: Math.round(r.width),
            h: Math.round(r.height),
            bg: cs.backgroundColor,
            color: cs.color,
            fs: cs.fontSize,
            fw: cs.fontWeight,
            align: cs.textAlign,
            pad: cs.padding,
            margin: cs.margin,
            radius: cs.borderRadius,
            text: n.childElementCount ? '' : (n.textContent || '').trim().slice(0, 50),
          },
        ]
        for (const c of n.children) rows.push(...walk(c, d + 1))
        return rows
      }
      const parent = el?.parentElement
      return {
        parentTag: parent?.tagName,
        parentCls: (parent?.className || '').toString(),
        parentBg: parent && getComputedStyle(parent).backgroundColor,
        tree: el ? walk(el) : [],
      }
    }),
    null,
    2,
  ),
)
await b.close()
