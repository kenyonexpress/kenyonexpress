// UX22: does the built archive hydrate cleanly? Console errors (a hydration
// mismatch is a console.error in production, not a pageerror), and whether
// the first thumbnail's node survives the first seconds after load.
import { chromium } from '@playwright/test'

const BASE = process.env.BASE ?? 'http://localhost:3363'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'he-IL' })
await ctx.addCookies([{ name: 'ke_consent', value: 'denied.2', domain: 'localhost', path: '/' }])
const page = await ctx.newPage()
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning')
    errors.push(`${m.type()}: ${m.text().slice(0, 200)}`)
})
const out = {}
for (const url of ['/products', '/category/beauty-health']) {
  errors.length = 0
  await page.goto(`${BASE}${url}`, { waitUntil: 'load' })
  await page.locator('.category-card__thumb img').first().waitFor({ timeout: 20000 })
  const handle = await page.locator('.category-card__thumb img').first().elementHandle()
  await page.waitForTimeout(3000)
  const attached = await handle.evaluate((el) => el.isConnected)
  const firstLink = await page.evaluate(() =>
    document.querySelector('a[href^="/category/"]')?.getAttribute('href'),
  )
  out[url] = { attached, consoleErrors: [...errors], firstCategoryLink: firstLink }
}
// The slug the neighbour spec discovers, and whether that page's sidebar has a combobox.
await page.goto(`${BASE}/`, { waitUntil: 'load' })
const slug = await page.evaluate(() => {
  const hrefs = [...document.querySelectorAll('a[href^="/category/"]')].map((a) =>
    a.getAttribute('href'),
  )
  return hrefs[0]
})
await page.goto(`${BASE}${slug}`, { waitUntil: 'load' })
await page.waitForTimeout(1500)
out.firstSlug = {
  slug,
  sidebarCombobox: await page.locator('.category-sidebar [role="combobox"]').count(),
  sidebarPresent: await page.locator('.category-sidebar').count(),
}
await browser.close()
console.log(JSON.stringify(out, null, 1))
