#!/usr/bin/env node
/**
 * V06 proof: /supplier/apply (all three wizard steps) and the four legal
 * documents at 380, 768 and 1440, written to docs/V06/, with horizontal
 * overflow, elements past the viewport edge, clipped text and every control
 * under 44px (24px for links inside running text) measured per shot.
 *
 *   PORT=3311 pnpm start &
 *   BASE=http://localhost:3311 node scripts/v06-supplier-legal-shots.mjs
 *
 * Signed in the way scripts/v05-account-shots.mjs is (a minted SSR cookie for
 * the E2E fixture customer), because /supplier/apply requires a session.
 * Read-only: the wizard is walked with its client-side "המשך" button and
 * nothing is submitted.
 */
import { createHmac } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

const BASE = process.env.BASE ?? 'http://localhost:3311'
const OUT = path.join(process.cwd(), 'docs', 'V06')
const WIDTHS = [380, 768, 1440]
const EMAIL = process.env.E2E_CUSTOMER_EMAIL ?? 'e2e-customer@test.kenyonexpress.local'
const PASSWORD = process.env.E2E_CUSTOMER_PASSWORD ?? 'E2eCustomer!pass1'

// Next's own precedence for `next start`: process env, .env.local, then
// .env.production.
function envLocal(name) {
  if (process.env[name]) return process.env[name]
  for (const file of ['.env.local', '.env.production']) {
    if (!existsSync(file)) continue
    const line = readFileSync(file, 'utf8')
      .split('\n')
      .find((l) => l.startsWith(`${name}=`))
    if (line) return line.slice(name.length + 1).replace(/^["']|["']$/g, '')
  }
  return undefined
}

const SUPABASE_URL = envLocal('NEXT_PUBLIC_SUPABASE_URL')
const ANON = envLocal('NEXT_PUBLIC_SUPABASE_ANON_KEY')
const ref = new URL(SUPABASE_URL).hostname.split('.')[0]

const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: ANON, 'content-type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
})
if (!res.ok) throw new Error(`password grant ${res.status}: ${await res.text()}`)
const session = await res.json()
const value = `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`
const name = `sb-${ref}-auth-token`
const CHUNK = 3180
const authCookies =
  value.length <= CHUNK
    ? [{ name, value, url: BASE }]
    : Array.from({ length: Math.ceil(value.length / CHUNK) }, (_, i) => ({
        name: `${name}.${i}`,
        value: value.slice(i * CHUNK, (i + 1) * CHUNK),
        url: BASE,
      }))

mkdirSync(OUT, { recursive: true })

// The Turnstile widget cannot pass on localhost, so the wizard sits behind the
// "בדיקת אבטחה קצרה" gate. Mint the same pass cookie the gate's action issues
// (src/lib/turnstile/verify.ts: `<uid>.<exp>.<hmac>`, keyed off the Turnstile
// secret) instead of submitting the gate.
const tsSecret = envLocal('TURNSTILE_SECRET_KEY')?.trim()
if (tsSecret) {
  const payload = `${session.user.id}.${Math.floor(Date.now() / 1000) + 1800}`
  const mac = createHmac('sha256', `turnstile-pass:${tsSecret}`).update(payload).digest('base64url')
  authCookies.push({ name: 'ke_ts_pass', value: `${payload}.${mac}`, url: BASE })
}

const PAGES = [
  { name: 'terms', path: '/terms-and-conditions', root: '.legal-page' },
  { name: 'privacy', path: '/privacy-policy', root: '.legal-page' },
  { name: 'returns', path: '/refund_returns', root: '.legal-page' },
  { name: 'accessibility', path: '/accessibility', root: '.legal-page' },
  { name: 'supplier-apply', path: '/supplier/apply', root: '.supplier-apply', auth: true },
]

async function measure(page, rootSel) {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel)
    const small = []
    for (const el of root?.querySelectorAll('button, a[href], input, select, textarea') ?? []) {
      if (el.type === 'hidden') continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (getComputedStyle(el).visibility === 'hidden') continue
      if ((el.type === 'checkbox' || el.type === 'radio') && el.closest('label')) {
        if (el.closest('label').getBoundingClientRect().height >= 44) continue
      }
      // Links inside running text are exempt under WCAG 2.5.8 (inline).
      const inline = el.tagName === 'A' && getComputedStyle(el).display === 'inline'
      const floor = inline ? 24 : 44
      if (r.height < floor || (!inline && r.width < 44)) {
        small.push({
          tag: el.tagName.toLowerCase(),
          label: (el.getAttribute('aria-label') ?? el.textContent ?? el.name ?? '')
            .trim()
            .slice(0, 40),
          w: Math.round(r.width),
          h: Math.round(r.height),
        })
      }
    }
    const vw = document.documentElement.clientWidth
    const outside = [...(root?.querySelectorAll('*') ?? [])]
      .filter((el) => !el.closest('.legal-table-scroller'))
      .filter((el) => {
        const r = el.getBoundingClientRect()
        return r.width > 0 && (r.right > vw + 1 || r.left < -1)
      })
      .map((el) => el.className || el.tagName)
      .slice(0, 10)
    const clipped = [...(root?.querySelectorAll('*') ?? [])]
      .filter((el) => el.children.length === 0 && el.scrollWidth > el.clientWidth + 1)
      .filter((el) => !['visible', 'auto', 'scroll'].includes(getComputedStyle(el).overflowX))
      .map((el) => el.className || el.tagName)
    const p = root?.querySelector('p')
    return {
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
      outside,
      small,
      clipped,
      bodyFont: p ? getComputedStyle(p).fontSize : null,
      h1: document.querySelector('h1')?.textContent?.trim() ?? null,
      h1Font: document.querySelector('h1')
        ? getComputedStyle(document.querySelector('h1')).fontSize
        : null,
    }
  }, rootSel)
}

const browser = await chromium.launch({ channel: 'chromium' })
const results = []
try {
  for (const width of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width, height: width < 768 ? 800 : 900 },
      locale: 'he-IL',
    })
    await context.addCookies([{ name: 'ke_consent', value: 'denied.3', url: BASE }, ...authCookies])
    const page = await context.newPage()
    for (const p of PAGES) {
      const resp = await page.goto(`${BASE}${p.path}`, { waitUntil: 'networkidle' })
      await page.waitForSelector(p.root)
      const m = await measure(page, p.root)
      results.push({
        page: p.name,
        width,
        status: resp?.status(),
        url: page.url().replace(BASE, ''),
        ...m,
      })
      await page.screenshot({ path: path.join(OUT, `${p.name}-${width}-fold.png`) })
      await page.screenshot({
        path: path.join(OUT, `${p.name}-${width}.png`),
        fullPage: true,
        clip: undefined,
      })
      const table = page.locator('.legal-table-scroller').first()
      if (await table.count()) {
        await table.scrollIntoViewIfNeeded()
        await table.screenshot({ path: path.join(OUT, `${p.name}-table-${width}.png`) })
        await page.evaluate(() => window.scrollTo(0, 0))
      }
      if (p.auth) {
        // Walk the wizard's steps client-side: "המשך" only toggles visibility,
        // nothing is submitted.
        const next = page.getByRole('button', { name: 'המשך', exact: true })
        for (const step of [2, 3]) {
          if (!(await next.count())) break
          await page.evaluate(() => {
            for (const el of document.querySelectorAll(
              '.supplier-apply input[required], .supplier-apply select[required]',
            ))
              el.removeAttribute('required')
          })
          await next.first().click()
          await page.waitForTimeout(200)
          await page.evaluate(() => window.scrollTo(0, 0))
          await page.waitForTimeout(200)
          const ms = await measure(page, p.root)
          results.push({ page: `${p.name}-step${step}`, width, ...ms })
          await page.screenshot({
            path: path.join(OUT, `${p.name}-step${step}-${width}.png`),
            fullPage: true,
          })
        }
      }
    }
    await context.close()
  }
} finally {
  await browser.close()
}
console.log(JSON.stringify(results, null, 1))
