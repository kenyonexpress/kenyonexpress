import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'
if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const c = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(c)) process.env.PLAYWRIGHT_BROWSERS_PATH = c
}
const [url, label] = [process.argv[2], process.argv[3] ?? process.argv[2]]
const b = await chromium.launch()
const p = await (await b.newContext({ viewport: { width: 1440, height: 2600 } })).newPage()
try {
  await p.goto(url, { waitUntil: 'networkidle', timeout: 120000 })
} catch {
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 })
}
await p.waitForTimeout(url.includes('localhost') ? 2500 : 5000)
const out = await p.evaluate(() => {
  const top = (sels) => {
    for (const s of sels) {
      const el = document.querySelector(s)
      if (el) {
        const r = el.getBoundingClientRect()
        if (r.height > 0) return { s, top: Math.round(r.top + scrollY), h: Math.round(r.height) }
      }
    }
    return null
  }
  return {
    related: top(['.pdp-related', '.related.products', 'section.related']),
    newsletter: top(['[class*="newsletter"]', '.footer-newsletter', '.newsletter']),
    footer: top(['footer', '.site-footer', '#colophon']),
    docHeight: Math.round(document.documentElement.scrollHeight),
  }
})
console.log(`## ${label}`)
for (const [k, v] of Object.entries(out)) {
  console.log(typeof v === 'object' && v ? `${k}\ttop=${v.top} h=${v.h}\t${v.s}` : `${k}\t${v}`)
}
await b.close()
