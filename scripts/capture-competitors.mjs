import { writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(homedir(), 'Library/Caches/ms-playwright')

const SITES = [
  { key: 'groo', url: 'https://groo.co.il/' },
  { key: 'baligam', url: 'https://baligam.co.il/' },
]
const b = await chromium.launch()
const out = {}
for (const s of SITES) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 2000 }, locale: 'he-IL' })
  const p = await ctx.newPage()
  try {
    await p.goto(s.url, { waitUntil: 'networkidle', timeout: 60000 })
  } catch {
    await p.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  }
  await p.waitForTimeout(3000)
  await p.screenshot({ path: `refs/competitors/${s.key}-home.png`, fullPage: false })
  out[s.key] = {
    title: await p.title(),
    h1: await p
      .locator('h1')
      .allInnerTexts()
      .catch(() => []),
    h2: (
      await p
        .locator('h2')
        .allInnerTexts()
        .catch(() => [])
    ).slice(0, 15),
    nav: (
      await p
        .locator('nav a, header a')
        .allInnerTexts()
        .catch(() => [])
    )
      .filter(Boolean)
      .slice(0, 25),
    productLinks: (
      await p
        .locator('a[href*="/deal"], a[href*="/product"], a[href*="/coupon"]')
        .evaluateAll((els) => els.map((e) => e.href))
        .catch(() => [])
    ).slice(0, 6),
    footerLinks: (
      await p
        .locator('footer a')
        .allInnerTexts()
        .catch(() => [])
    )
      .filter(Boolean)
      .slice(0, 25),
    bodyLen: (await p.content()).length,
  }
  await ctx.close()
}
await b.close()
writeFileSync(
  '/private/tmp/claude-501/-Users-ofir-kenyonexpress-web-kenyonexpress/519a417b-3ff5-4249-8608-afa0556efa24/scratchpad/comp.json',
  JSON.stringify(out, null, 2),
)
console.log(JSON.stringify(out, null, 2).slice(0, 2600))
