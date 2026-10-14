import { chromium } from '@playwright/test'
const BASE = 'http://localhost:3361'
const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'he-IL',
  extraHTTPHeaders: { 'x-forwarded-for': '10.20.9.77' },
})
await ctx.addCookies([{ name: 'ke_consent', value: 'denied.2', domain: 'localhost', path: '/' }])
const page = await ctx.newPage()
page.on('console', (m) => {
  if (m.type() === 'error') console.log('console.error', m.text().slice(0, 200))
})
await page.goto(`${BASE}/login?next=%2Faccount`, { waitUntil: 'networkidle' })
await page.getByLabel('אימייל').fill('e2e-customer@test.kenyonexpress.local')
await page.getByLabel('סיסמה').fill('E2eCustomer!pass1')
await page.getByRole('button', { name: 'כניסה', exact: true }).click()
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 })
for (const slug of ['e2e-test-physical', '6253']) {
  await page.goto(`${BASE}/product/${slug}`, { waitUntil: 'load' })
  const heart = page
    .getByRole('button', { name: /רשימת המשאלות/ })
    .filter({ hasText: /שמירה|נשמר/ })
    .first()
  await heart.waitFor()
  await page.waitForTimeout(1500)
  const info = await heart.evaluate((b) => ({
    label: b.getAttribute('aria-label'),
    pressed: b.getAttribute('aria-pressed'),
    disabled: b.disabled,
    cls: b.className.slice(0, 40),
    rect: b.getBoundingClientRect().toJSON(),
  }))
  console.log(slug, 'before', JSON.stringify(info))
  const handle = await heart.elementHandle()
  await heart.click()
  await page.waitForTimeout(2500)
  console.log(
    '  attached after click:',
    await handle.evaluate((el) => el.isConnected).catch(() => 'gone'),
    'inline count',
    await page.locator('button.tap-area--36').count(),
    'label now',
    await page
      .locator('button.tap-area--36')
      .first()
      .getAttribute('aria-label')
      .catch(() => null),
    'output',
    await page
      .locator('output')
      .allTextContents()
      .catch(() => null),
  )
  const after = await heart.evaluate((b) => ({
    label: b.getAttribute('aria-label'),
    pressed: b.getAttribute('aria-pressed'),
    disabled: b.disabled,
  }))
  console.log(slug, 'after', JSON.stringify(after), 'url', page.url())
}
await page.goto(`${BASE}/account/wishlist`, { waitUntil: 'load' })
await page
  .locator('ul.wishlist-grid li')
  .first()
  .waitFor({ timeout: 15000 })
  .catch(() => {})
console.log(
  'wishlist count',
  await page.locator('ul.wishlist-grid li').count(),
  'count text',
  await page
    .locator('.wishlist-toolbar__count')
    .textContent()
    .catch(() => null),
)
await browser.close()
