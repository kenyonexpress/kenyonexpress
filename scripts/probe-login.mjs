// One-off QA probe for docs/QA-CHECKLIST.md section 1 (/login).
// Run against a built server: PORT=3399 pnpm start, then
//   BASE=http://localhost:3399 node scripts/probe-login.mjs
// Deliberately frugal with sign-in attempts: the action rate-limits 10/hour
// per IP and writes to the production `rate_limits` table.
import { chromium } from '@playwright/test'

const BASE = process.env.BASE ?? 'http://localhost:3399'
const out = []
function say(label, value) {
  out.push(`${label}: ${value}`)
  console.log(`${label}: ${value}`)
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ locale: 'he-IL' })
const page = await ctx.newPage()

// ── A. callback error banner ────────────────────────────────────────────
await page.goto(`${BASE}/login?error=auth_callback_error`)
say('A callback banner', await page.locator('.text-red-600').first().textContent())
await page.goto(`${BASE}/login?error=whatever_else`)
say('A unknown error param banners', await page.locator('.text-red-600').count())

// ── B. next threading ───────────────────────────────────────────────────
await page.goto(`${BASE}/login?next=/account`)
say(
  'B hidden next inputs',
  JSON.stringify(
    await page.locator('input[name="next"]').evaluateAll((n) => n.map((x) => x.value)),
  ),
)
say('B signup link', await page.getByRole('link', { name: 'הרשמה' }).getAttribute('href'))

for (const evil of ['//evil.com', 'https://evil.com', '/\\evil.com']) {
  await page.goto(`${BASE}/login?next=${encodeURIComponent(evil)}`)
  const v = await page.locator('input[name="next"]').first().inputValue()
  const signup = await page.getByRole('link', { name: 'הרשמה' }).getAttribute('href')
  say(`B next=${evil} rendered as`, `${JSON.stringify(v)} signup=${signup}`)
}

// ── C. Google button with a hostile next ────────────────────────────────
await page.goto(`${BASE}/login?next=${encodeURIComponent('//evil.com')}`)
let googleTarget = 'no navigation'
page.on('framenavigated', (f) => {
  if (f === page.mainFrame()) googleTarget = f.url()
})
await page.getByRole('button', { name: /כניסה עם Google/ }).click()
await page.waitForTimeout(3000)
say('C google click went to', googleTarget.slice(0, 260))
const m = /redirect_to%3D([^%&]*)/.exec(decodeURIComponent(decodeURIComponent(googleTarget)))
say('C redirect_to origin', m ? m[1] : 'not found in url')

// ── D+G. bad credentials, and no password-length gate ───────────────────
await page.goto(`${BASE}/login`)
await page.getByLabel('אימייל').fill('qa-probe-nobody@kenyonexpress.co.il')
await page.getByLabel('סיסמה').fill('1')
await page.getByRole('button', { name: 'כניסה', exact: true }).click()
await page.waitForTimeout(4000)
say(
  'D+G one-char password reply',
  (await page.locator('form .text-red-600').first().textContent()) ?? 'none',
)

// ── E. error isolation across the three states ──────────────────────────
await page.getByRole('button', { name: /קישור מאובטח/ }).click()
const magicForm = page.locator('form').filter({ has: page.getByLabel('אימייל לקישור כניסה') })
say('E magic form shows the email error', await magicForm.locator('.text-red-600').count())
say('E page-top banner present', await page.locator('.mb-4.text-red-600').count())
say('E email error still shown', await page.locator('form .text-red-600').count())

// ── F. magic link send ──────────────────────────────────────────────────
await magicForm.getByLabel('אימייל לקישור כניסה').fill('qa-probe-nobody@kenyonexpress.co.il')
await magicForm.getByRole('button', { name: 'שלחו לי קישור' }).click()
await page.waitForTimeout(6000)
say('F magic success', (await magicForm.locator('.text-green-700').first().textContent()) ?? 'none')
say('F magic error', (await magicForm.locator('.text-red-600').first().textContent()) ?? 'none')
say('F email form error after magic submit', await page.locator('form .text-red-600').count())

// ── H. forgot-password link ─────────────────────────────────────────────
await page.goto(`${BASE}/login`)
await page.getByRole('link', { name: 'שכחתם סיסמה?' }).click()
await page.waitForLoadState('domcontentloaded')
say('H forgot link lands on', page.url())

// ── I. ?magic=1 banner ──────────────────────────────────────────────────
await page.goto(`${BASE}/login?magic=1`)
say('I magic banner', (await page.locator('.text-green-700').first().textContent()) ?? 'none')

// ── J. RTL ──────────────────────────────────────────────────────────────
await page.goto(`${BASE}/login`)
say('J html dir', await page.locator('html').getAttribute('dir'))
say(
  'J email input dir',
  await page.getByLabel('אימייל').evaluate((el) => getComputedStyle(el).direction),
)

await browser.close()
console.log(`\n--- summary ---\n${out.join('\n')}`)
