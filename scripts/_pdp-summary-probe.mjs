import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
// Dump every laid-out box inside the PDP summary column, so the rebuilt
// summary is written against measured rhythm rather than a screenshot.
// Usage: node scripts/_pdp-summary-probe.mjs <url> [rootSelector]
import { chromium } from '@playwright/test'

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache
}

const url = process.argv[2]
const root = process.argv[3] ?? 'div.summary, [data-pdp="summary"]'
if (!url) {
  console.error('usage: node scripts/_pdp-summary-probe.mjs <url> [rootSelector]')
  process.exit(2)
}

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1440, height: 2600 }, deviceScaleFactor: 1 })
const p = await ctx.newPage()
try {
  await p.goto(url, { waitUntil: 'networkidle', timeout: 120000 })
} catch {
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 })
}
await p.waitForTimeout(url.includes('localhost') ? 2000 : 4000)

const rows = await p.evaluate((root) => {
  const host = document.querySelector(root)
  if (!host) return []
  const out = []
  for (const el of host.querySelectorAll('*')) {
    const r = el.getBoundingClientRect()
    if (r.width < 3 || r.height < 3) continue
    const cs = getComputedStyle(el)
    // Only leaf-ish boxes: anything whose own text is short enough to identify.
    const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ')
    out.push({
      y: Math.round(r.y + window.scrollY),
      x: Math.round(r.x + window.scrollX),
      w: Math.round(r.width),
      h: Math.round(r.height),
      tag: el.tagName.toLowerCase(),
      cls: (el.className?.toString?.() ?? '').slice(0, 30),
      font: `${cs.fontSize}/${cs.lineHeight} ${cs.fontWeight}`,
      color: cs.color,
      bg: cs.backgroundColor,
      text: text.slice(0, 40),
    })
  }
  return out.sort((a, z) => a.y - z.y || a.h - z.h)
}, root)

await b.close()
console.log(`# summary boxes @ ${url}`)
for (const r of rows) {
  console.log(
    `y=${String(r.y).padStart(5)} h=${String(r.h).padStart(4)} x=${String(r.x).padStart(4)} w=${String(r.w).padStart(4)} ${r.font.padEnd(20)} ${r.color.padEnd(20)} ${r.tag.padEnd(6)} ${r.cls.padEnd(30)} ${r.text}`,
  )
}
