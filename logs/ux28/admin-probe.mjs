// UX28 admin moment: a toast raised in the admin panel, with no write behind it.
// /admin/cashback refuses a zero amount in the action's validation, before any
// read or write, so the error toast is real feedback and the database is untouched.
// Before UX28 the (admin) layout mounted no toaster, so this call painted nothing.
import { readFileSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { msUntilNextStep, totpCode } from '../../scripts/seed/totp.mjs'

const BASE = process.env.BASE ?? 'http://localhost:3364'
const TAG = process.env.TAG ?? 'after'
const WIDTHS = (process.env.WIDTHS ?? '380,768,1440').split(',').map(Number)
function envLocal(name) {
  const line = readFileSync('.env.local', 'utf8')
    .split('\n')
    .find((l) => l.startsWith(`${name}=`))
  return line
    ? line
        .slice(name.length + 1)
        .trim()
        .replace(/^"(.*)"$/, '$1')
    : undefined
}
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? envLocal('E2E_ADMIN_EMAIL')
const ADMIN_PASSWORD =
  process.env.E2E_ADMIN_PASSWORD ?? envLocal('E2E_ADMIN_PASSWORD') ?? 'E2eAdmin!pass1'
const CONSENT = { name: 'ke_consent', value: 'denied.2', domain: 'localhost', path: '/' }

const browser = await chromium.launch()
const out = { base: BASE, tag: TAG, widths: {} }

const toastState = () => {
  const toasts = [...document.querySelectorAll('[data-sonner-toast]')]
  const section = document.querySelector('[data-sonner-toaster]')?.closest('section')
  return {
    url: location.pathname,
    region: section ? section.getAttribute('aria-label') : null,
    count: toasts.length,
    types: toasts.map((t) => t.getAttribute('data-type')),
    texts: toasts.map((t) => (t.querySelector('[data-title]')?.textContent ?? '').trim()),
    closeLabel: toasts[0]?.querySelector('[data-close-button]')?.getAttribute('aria-label') ?? null,
    theme:
      document.querySelector('[data-sonner-toaster]')?.getAttribute('data-sonner-theme') ?? null,
  }
}

// One login for the run.
const loginCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await loginCtx.addCookies([CONSENT])
const loginPage = await loginCtx.newPage()
await loginPage.goto(`${BASE}/login?next=%2Fadmin%2Fcashback`)
await loginPage.getByLabel('אימייל', { exact: true }).fill(ADMIN_EMAIL)
await loginPage.getByLabel('סיסמה', { exact: true }).fill(ADMIN_PASSWORD)
await loginPage.getByRole('button', { name: 'כניסה', exact: true }).click()
await loginPage.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20_000 })
if (new URL(loginPage.url()).pathname.startsWith('/admin-mfa')) {
  const secret = readFileSync('.e2e/admin-totp.secret', 'utf8').trim()
  if (msUntilNextStep() < 3000) await loginPage.waitForTimeout(msUntilNextStep() + 100)
  await loginPage.locator('#mfa-code').fill(totpCode(secret))
  await loginPage.getByRole('button', { name: 'אימות וכניסה' }).click()
  await loginPage.waitForURL((u) => !u.pathname.startsWith('/admin-mfa'), { timeout: 20_000 })
}
const cookies = await loginCtx.cookies()
await loginCtx.close()

for (const width of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, locale: 'he-IL' })
  await ctx.addCookies([CONSENT, ...cookies])
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)))
  await page.goto(`${BASE}/admin/cashback`, { waitUntil: 'networkidle' })
  const form = page.locator('main form').first()
  try {
    await form.waitFor({ state: 'visible', timeout: 15000 })
  } catch {
    const diag = {
      url: page.url(),
      h1: await page
        .locator('h1')
        .first()
        .textContent()
        .catch(() => null),
      text: (
        await page
          .locator('body')
          .innerText()
          .catch(() => '')
      ).slice(0, 300),
    }
    await page.screenshot({ path: `logs/ux28/${TAG}-${width}-admin-diag.png` })
    console.log('DIAG', width, JSON.stringify(diag))
    out.widths[width] = { skipped: diag }
    await ctx.close()
    continue
  }
  await form.locator('input[type="email"]').fill('ux28-probe@example.com')
  await form.locator('input[type="text"]').nth(0).fill('0')
  await form.locator('input[type="text"]').nth(1).fill('בדיקת toast, סכום אפס נדחה לפני כל כתיבה')
  const idle = await page.evaluate(toastState)
  const t0 = Date.now()
  await page.getByRole('button', { name: 'בצע התאמה' }).click()
  let seen = null
  let gone = null
  while (Date.now() - t0 < 14000) {
    const s = await page.evaluate(toastState)
    if (!seen && s.count > 0) {
      seen = { at: Date.now() - t0, ...s }
      await page.screenshot({ path: `logs/ux28/${TAG}-${width}-admin-toast.png` })
    }
    if (seen && s.count === 0) {
      gone = Date.now() - t0
      break
    }
    await new Promise((r) => setTimeout(r, 16))
  }
  out.widths[width] = {
    idle,
    toast: seen,
    lifetime: seen && gone ? gone - seen.at : null,
    errors,
  }
  console.log(width, JSON.stringify(out.widths[width]))
  await ctx.close()
}
await browser.close()
writeFileSync(`logs/ux28/admin-${TAG}.json`, JSON.stringify(out, null, 2))
