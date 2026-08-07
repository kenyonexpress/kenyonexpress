import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'
if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const c = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(c)) process.env.PLAYWRIGHT_BROWSERS_PATH = c
}
const b = await chromium.launch()
const p = await (await b.newContext({ viewport: { width: 1440, height: 2600 } })).newPage()
try {
  await p.goto(process.argv[2], { waitUntil: 'networkidle', timeout: 120000 })
} catch {
  await p.goto(process.argv[2], { waitUntil: 'domcontentloaded', timeout: 120000 })
}
await p.waitForTimeout(process.argv[2].includes('localhost') ? 2500 : 5000)
console.log(
  await p.evaluate(() => {
    const el = document.querySelector('[class*="newsletter"]')
    if (!el) return 'no newsletter el'
    const host = el.closest('div[class*="bg-"]') ?? el.parentElement ?? el
    const cs = getComputedStyle(host)
    const r = host.getBoundingClientRect()
    return {
      cls: host.className,
      bg: cs.backgroundColor,
      w: Math.round(r.width),
      h: Math.round(r.height),
    }
  }),
)
await b.close()
