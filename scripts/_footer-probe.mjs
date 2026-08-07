import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
// Dump the geometry of every laid-out box inside the site footer.
// Usage: node scripts/_footer-probe.mjs <url>
import { chromium } from '@playwright/test'

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache
}

const url = process.argv[2]
if (!url) {
  console.error('usage: node scripts/_footer-probe.mjs <url>')
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

const rows = await p.evaluate(() => {
  const host = document.querySelector('footer')
  if (!host) return []
  const out = []
  for (const el of [host, ...host.querySelectorAll('*')]) {
    const r = el.getBoundingClientRect()
    if (r.width < 6 || r.height < 6) continue
    const cs = getComputedStyle(el)
    out.push({
      y: Math.round(r.y + window.scrollY),
      x: Math.round(r.x + window.scrollX),
      w: Math.round(r.width),
      h: Math.round(r.height),
      tag: el.tagName.toLowerCase(),
      font: `${cs.fontSize}/${cs.lineHeight} ${cs.fontWeight}`,
      bg: cs.backgroundColor,
      radius: cs.borderRadius,
      text: (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 34),
    })
  }
  return out.sort((a, z) => a.y - z.y || a.x - z.x)
})

await b.close()
console.log(`# footer boxes @ ${url}`)
for (const r of rows) {
  console.log(
    `y=${String(r.y).padStart(5)} h=${String(r.h).padStart(4)} x=${String(r.x).padStart(5)} w=${String(r.w).padStart(4)} ${r.font.padEnd(19)} ${r.bg.padEnd(22)} r=${r.radius.padEnd(10)} ${r.tag.padEnd(6)} ${r.text}`,
  )
}
