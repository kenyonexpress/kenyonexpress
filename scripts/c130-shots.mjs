import { chromium } from '@playwright/test'
// Usage: node scripts/c130-shots.mjs <baseUrl> <outDir> [path=/] [tag=home]
const [base = 'http://localhost:3317', out = 'docs/C130', path = '/', tag = 'home'] =
  process.argv.slice(2)
const b = await chromium.launch()
for (const w of [380, 768, 1440]) {
  const p = await b.newPage({ viewport: { width: w, height: 1000 } })
  await p.goto(base + path, { waitUntil: 'networkidle', timeout: 90000 }).catch(() => {})
  await p.waitForTimeout(1500)
  const sw = await p.evaluate(() => document.documentElement.scrollWidth)
  console.log(tag, w, 'scrollWidth', sw)
  await p
    .screenshot({ path: `${out}/${tag}-${w}.png`, fullPage: true })
    .catch((e) => console.log(e.message))
  await p.close()
}
await b.close()
