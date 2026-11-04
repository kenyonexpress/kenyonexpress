#!/usr/bin/env node
/**
 * V05 proof: the /account area (dashboard, orders, an order, wallet, coupons,
 * details, security) at 380, 768 and 1440, written to docs/V05/, with
 * horizontal overflow, clipped text and every visible control under 44px
 * measured per shot inside `.account-page` and printed as JSON.
 *
 *   PORT=3311 pnpm start &
 *   BASE=http://localhost:3311 node scripts/v05-account-shots.mjs
 *
 * SIGNED IN WITHOUT THE LOGIN FORM. /login runs Turnstile, whose site key is
 * not valid for localhost, so the E2E fixture customer's session is minted with
 * one password grant against Supabase auth and set as the SSR cookie
 * (`sb-<ref>-auth-token`, `base64-` + base64url(session), chunked past 3180
 * characters), the same shape @supabase/ssr writes. Read-only: nothing is
 * submitted on any page.
 *
 * Browse localhost, not 127.0.0.1: server actions reject a mismatched origin.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

const BASE = process.env.BASE ?? 'http://localhost:3311'
const OUT = path.join(process.cwd(), 'docs', 'V05')
const WIDTHS = [380, 768, 1440]
const EMAIL = process.env.E2E_CUSTOMER_EMAIL ?? 'e2e-customer@test.kenyonexpress.local'
const PASSWORD = process.env.E2E_CUSTOMER_PASSWORD ?? 'E2eCustomer!pass1'

function envLocal(name) {
  if (process.env[name]) return process.env[name]
  const line = readFileSync('.env.local', 'utf8')
    .split('\n')
    .find((l) => l.startsWith(`${name}=`))
  return line?.slice(name.length + 1).replace(/^["']|["']$/g, '')
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

// AUTH_CACHE=1: write the minted session where e2e/auth-session.ts looks for
// a cached sign-in, and stop. Run the spec with --output elsewhere, because
// Playwright empties test-results/ at the start of a run:
//   AUTH_CACHE=1 node scripts/v05-account-shots.mjs
//   E2E_BASE_URL=http://localhost:3311 pnpm exec playwright test e2e/account-area.spec.ts --output=/tmp/pw-v05
if (process.env.AUTH_CACHE === '1') {
  const dir = path.join('test-results', '.auth')
  mkdirSync(dir, { recursive: true })
  const host = new URL(BASE).hostname
  const cookies = authCookies.map(({ name: n, value: v }) => ({
    name: n,
    value: v,
    domain: host,
    path: '/',
    expires: -1,
    httpOnly: false,
    secure: false,
    sameSite: 'Lax',
  }))
  writeFileSync(
    path.join(dir, `${EMAIL.replace(/[^a-z0-9]/gi, '_')}.json`),
    JSON.stringify({ cookies }),
  )
  console.log(`auth cache written for ${EMAIL}`)
  process.exit(0)
}

mkdirSync(OUT, { recursive: true })

async function measure(page) {
  return page.evaluate(() => {
    const small = []
    const root = document.querySelector('.account-page')
    for (const el of root?.querySelectorAll('button, a[href], input, select, textarea') ?? []) {
      if (el.type === 'hidden') continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (getComputedStyle(el).visibility === 'hidden') continue
      if (el.closest('[aria-hidden="true"]')) continue
      // A checkbox or radio is hit through its label, which carries the box.
      if ((el.type === 'checkbox' || el.type === 'radio') && el.closest('label')) {
        const lr = el.closest('label').getBoundingClientRect()
        if (lr.height >= 44) continue
      }
      if (r.width < 44 || r.height < 44) {
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
    const clipped = [...(root?.querySelectorAll('*') ?? [])]
      .filter((el) => el.children.length === 0 && el.scrollWidth > el.clientWidth + 1)
      .filter((el) => getComputedStyle(el).overflowX !== 'visible')
      .map((el) => el.className || el.tagName)
    const list = root?.querySelector('.account-nav__list')
    const active = root?.querySelector('.account-nav__link[aria-current="page"]')
    let activeInStrip = null
    if (list && active) {
      const l = list.getBoundingClientRect()
      const a = active.getBoundingClientRect()
      activeInStrip = a.left >= l.left - 1 && a.right <= l.right + 1
    }
    return {
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
      small,
      clipped,
      nav: list ? (list.scrollWidth > list.clientWidth ? 'tabs' : 'side') : null,
      activeInStrip,
      h1: document.querySelector('.account-content h1')?.textContent?.trim() ?? null,
    }
  })
}

const browser = await chromium.launch({ channel: 'chromium' })
const results = []
try {
  let orderHref = null
  for (const width of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width, height: width < 768 ? 800 : 900 },
      locale: 'he-IL',
    })
    await context.addCookies([{ name: 'ke_consent', value: 'denied.3', url: BASE }, ...authCookies])
    // Snooze the register-a-passkey nudge, which overlays every account page.
    await context.addInitScript((id) => {
      try {
        localStorage.setItem(`ke_passkey_prompt_seen:${id}`, String(Date.now() + 864e9))
      } catch {}
    }, session.user.id)
    const page = await context.newPage()

    const shoot = async (shot, url) => {
      // One retry. The proxy's getUser has a 10 s timeout against production
      // auth, and on a slow link a timeout reads as signed out and redirects.
      for (let attempt = 1; ; attempt++) {
        try {
          await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle', timeout: 60_000 })
        } catch (cause) {
          if (attempt >= 2) throw cause
          continue
        }
        if (!new URL(page.url()).pathname.startsWith('/login')) break
        if (attempt >= 2) {
          throw new Error(`${url} bounced to /login twice: the minted session was refused`)
        }
        await context.addCookies(authCookies)
      }
      await page.locator('.account-nav__list').waitFor()
      await page.locator('.account-content h1').waitFor()
      await page.waitForTimeout(400)
      const m = await measure(page)
      await page.screenshot({ path: path.join(OUT, `${shot}-${width}-fold.png`) })
      await page.evaluate(() => window.scrollTo(0, 0))
      // Capped at 3000px: the fixture customer holds 50 orders and dozens of
      // coupons, and an uncapped coupons page is a 7 MB PNG per width. The
      // measurement above still covers the whole page.
      const height = await page.evaluate(() => document.documentElement.scrollHeight)
      await page.screenshot({
        path: path.join(OUT, `${shot}-${width}.png`),
        fullPage: true,
        clip: { x: 0, y: 0, width, height: Math.min(height, 3000) },
      })
      results.push({ shot: `${shot}-${width}`, ...m })
    }

    await shoot('dashboard', '/account')
    await shoot('orders', '/account/orders')
    if (!orderHref) {
      orderHref = await page
        .locator('a[href^="/account/orders/"]')
        .first()
        .getAttribute('href')
        .catch(() => null)
    }
    if (orderHref) await shoot('order', orderHref)
    await shoot('wallet', '/account/wallet')
    await shoot('coupons', '/account/coupons')
    await shoot('details', '/account/details')
    await shoot('security', '/account/security')
    await context.close()
  }
} finally {
  await browser.close()
}

console.log(JSON.stringify(results, null, 2))
const bad = results.filter((r) => r.overflowX > 0 || r.small.length || r.clipped.length)
for (const r of results) {
  console.log(
    `${r.shot} nav=${r.nav} activeVisible=${r.activeInStrip} overflowX=${r.overflowX} small=${r.small.length} clipped=${r.clipped.length}`,
  )
}
process.exitCode = bad.length ? 1 : 0
