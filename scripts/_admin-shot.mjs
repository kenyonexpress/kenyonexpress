import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
// Log into the local dev stack and screenshot an admin route, so admin screens
// can be checked as rendered pages instead of as code that type-checks.
// Usage: node scripts/_admin-shot.mjs <path> <outPng>
import { chromium } from '@playwright/test'

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache
}

const path = process.argv[2] ?? '/admin/payouts'
const out = process.argv[3] ?? 'shots/admin.png'
const BASE = process.env.LOCAL_BASE ?? 'http://localhost:3000'
// No default password. This drives a real login form, and a credential with a
// default in the repo is a credential someone eventually reuses off it.
const EMAIL = process.env.DEV_ADMIN_EMAIL
const PASSWORD = process.env.DEV_ADMIN_PASSWORD
if (!EMAIL || !PASSWORD) {
  console.error('set DEV_ADMIN_EMAIL and DEV_ADMIN_PASSWORD (local dev stack account)')
  process.exit(2)
}

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1440, height: 1200 } })
const p = await ctx.newPage()
p.on('console', (m) => {
  if (m.type() === 'error') console.log('  console.error:', m.text().slice(0, 160))
})
p.on('pageerror', (e) => console.log('  pageerror:', String(e).slice(0, 200)))

await p.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 120000 })
await p.fill('input[type="email"]', EMAIL)
await p.fill('input[type="password"]', PASSWORD)
// Scope the click to the form that owns the password field: the Google button
// is also a submit and is first in the DOM, so a bare selector logs in with the
// wrong provider.
await p.locator('form:has(input[type="password"]) button[type="submit"]').first().click()
await p.waitForTimeout(6000)
console.log(`after login -> ${p.url()}`)
const err = await p.evaluate(
  () => document.body.innerText.match(/.{0,80}(שגיא|לא נכון|כשל).{0,80}/)?.[0] ?? null,
)
if (err) console.log('  form said:', err.replace(/\s+/g, ' '))

const res = await p.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 120000 })
await p.waitForTimeout(1500)

// Optional third argument: a text label to click once the page is up, so an
// admin action can be exercised and not just looked at.
const clickLabel = process.argv[4]
if (clickLabel) {
  await p.getByRole('button', { name: clickLabel }).first().click()
  await p.waitForTimeout(4000)
  const toast = await p.evaluate(
    () => document.querySelector('[data-sonner-toast]')?.textContent ?? null,
  )
  console.log('  toast:', toast)
}
console.log(`${path} -> ${res?.status()} ${p.url()}`)
await p.screenshot({ path: out, fullPage: true })
console.log(`${out} written`)
await b.close()
