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
await p.goto(process.argv[2], { waitUntil: 'networkidle', timeout: 120000 }).catch(() => {})
await p.waitForTimeout(2500)
console.log(
  await p.evaluate(() => {
    const wanted = [
      '.bg-brand-secondary',
      '.bg-brand',
      '.min-h-newsletter-bar',
      '.max-w-store-footer',
    ]
    const found = {}
    for (const w of wanted) found[w] = []
    for (const sheet of Array.from(document.styleSheets)) {
      let rules
      try {
        rules = Array.from(sheet.cssRules ?? [])
      } catch {
        continue
      }
      const walk = (rs) => {
        for (const r of rs) {
          if (r.cssRules) {
            walk(Array.from(r.cssRules))
            continue
          }
          if (!r.selectorText) continue
          for (const w of wanted)
            if (
              r.selectorText
                .split(',')
                .map((s) => s.trim())
                .includes(w)
            )
              found[w].push(r.cssText.slice(0, 120))
        }
      }
      walk(rules)
    }
    const cs = getComputedStyle(document.querySelector('.bg-brand-secondary') ?? document.body)
    return {
      found,
      computedBg: cs.backgroundColor,
      varVal: getComputedStyle(document.documentElement).getPropertyValue(
        '--color-brand-secondary',
      ),
    }
  }),
)
await b.close()
