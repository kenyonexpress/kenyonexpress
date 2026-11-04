#!/usr/bin/env node
/**
 * V08 proof: Lighthouse mobile on the open funnel routes, the way a customer
 * sees them. /cart and /checkout signed in with one line in the cart, /account
 * signed in, /login signed out (a signed-in visit redirects away from it).
 *
 * Setup runs in a Playwright persistent profile (consent cookie, the E2E
 * fixture customer's SSR cookie minted like scripts/v07-mobile-shell.mjs, the
 * passkey nudge marked seen, one product added). The profile is then closed and
 * Lighthouse drives a plain Chromium on the same profile with storage reset
 * off, so the cookies are the ones it carries. The cart line is removed again
 * at the end. Nothing is submitted.
 *
 * Every route runs RUNS times with Lighthouse's default mobile config
 * (simulated throttling, Moto G Power, 4x CPU) and once with
 * --throttling-method=devtools; the median simulated run is the score.
 *
 * Usage: BASE=http://localhost:3481 node scripts/v08-lighthouse.mjs
 */
import { spawn } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from '@playwright/test'
import lighthouse from 'lighthouse'

const BASE = process.env.BASE ?? 'http://localhost:3481'
const OUT = path.resolve(process.env.OUT ?? 'docs/V08')
const RUNS = Number(process.env.RUNS ?? 3)
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null
const EMAIL = process.env.E2E_CUSTOMER_EMAIL ?? 'e2e-customer@test.kenyonexpress.local'
const PASSWORD = process.env.E2E_CUSTOMER_PASSWORD ?? 'E2eCustomer!pass1'
const BUY = /הוסף לסל|קנה עכשיו/

const ROUTES = [
  { name: 'cart', path: '/cart', auth: true },
  { name: 'checkout', path: '/checkout', auth: true },
  { name: 'login', path: '/login', auth: false },
  { name: 'account', path: '/account', auth: true },
].filter((r) => !ONLY || ONLY.has(r.name))

function envLocal(name) {
  if (process.env[name] && !process.env[name].includes('SENSITIVE')) return process.env[name]
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
const grant = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: ANON, 'content-type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
})
if (!grant.ok) throw new Error(`password grant ${grant.status}: ${await grant.text()}`)
const session = await grant.json()

// Persisted cookies need an expiry: a session cookie is dropped when the
// setup profile closes.
const expires = Math.floor(Date.now() / 1000) + 3 * 3600
const value = `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`
const cookieName = `sb-${ref}-auth-token`
const CHUNK = 3180
const authCookies =
  value.length <= CHUNK
    ? [{ name: cookieName, value, url: BASE, expires }]
    : Array.from({ length: Math.ceil(value.length / CHUNK) }, (_, i) => ({
        name: `${cookieName}.${i}`,
        value: value.slice(i * CHUNK, (i + 1) * CHUNK),
        url: BASE,
        expires,
      }))
const tsSecret = envLocal('TURNSTILE_SECRET_KEY')?.trim()
if (tsSecret) {
  const payload = `${session.user.id}.${expires}`
  const mac = createHmac('sha256', `turnstile-pass:${tsSecret}`).update(payload).digest('base64url')
  authCookies.push({ name: 'ke_ts_pass', value: `${payload}.${mac}`, url: BASE, expires })
}
const consent = { name: 'ke_consent', value: 'denied.3', url: BASE, expires }
// For a probe that needs the same signed-in customer: write the cookies, stop.
if (process.env.COOKIES_OUT) {
  writeFileSync(process.env.COOKIES_OUT, JSON.stringify([consent, ...authCookies]))
  process.exit(0)
}

// Setup goes through Playwright attached to the very Chrome Lighthouse will
// drive, so the cookies and localStorage live in the profile it measures.
async function prepare(port, auth, fill) {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
  const context = browser.contexts()[0]
  await context.addCookies([consent, ...(auth ? authCookies : [])])
  const page = await context.newPage()
  await page.goto(`${BASE}/robots.txt`)
  await page.evaluate((id) => {
    localStorage.setItem(`ke_passkey_prompt_seen:${id}`, String(Date.now() + 864e9))
    localStorage.setItem('ke:pwa-install-dismissed', String(Date.now()))
  }, session.user.id)
  const filled = fill ? await fillCart(page) : false
  await page.close()
  await browser.close()
  return filled
}

async function fillCart(page) {
  await page.goto(`${BASE}/cart`, { waitUntil: 'networkidle' })
  if (await page.locator('.cart-table').count()) return 'had'
  await page.goto(`${BASE}/products`, { waitUntil: 'domcontentloaded' })
  await page.locator('a[href^="/product/"]').first().waitFor({ timeout: 30_000 })
  const hrefs = [
    ...new Set(
      await page
        .locator('a[href^="/product/"]')
        .evaluateAll((as) => as.map((a) => a.getAttribute('href'))),
    ),
  ]
  for (const href of hrefs.slice(0, 10)) {
    await page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded' })
    const buy = page.locator('[data-pdp="summary"]').getByRole('button', { name: BUY }).first()
    if (!(await buy.isEnabled({ timeout: 5_000 }).catch(() => false))) continue
    await page.waitForLoadState('networkidle').catch(() => undefined)
    const answered = page.waitForResponse((r) => r.request().method() === 'POST', {
      timeout: 30_000,
    })
    await buy.click()
    if (await answered.then((r) => r.ok()).catch(() => false)) return 'added'
  }
  return false
}

async function emptyCart(port) {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
  const page = await browser.contexts()[0].newPage()
  await page.goto(`${BASE}/cart`, { waitUntil: 'load' })
  await page
    .locator('.cart-table')
    .waitFor({ timeout: 20_000 })
    .catch(() => undefined)
  await page
    .getByRole('button', { name: 'רוקן עגלה' })
    .click()
    .catch(() => undefined)
  const ok = await page
    .locator('.cart-empty')
    .waitFor({ timeout: 20_000 })
    .then(() => true)
    .catch(() => false)
  await browser.close()
  return ok
}

// Lighthouse hangs on Playwright's Chrome for Testing build (its browser_ui
// targets), so the installed Chrome is the one measured.
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

async function launchChrome(port) {
  const dir = mkdtempSync(path.join(tmpdir(), 'ke-v08-'))
  const proc = spawn(
    CHROME,
    [
      '--headless=new',
      '--no-sandbox',
      '--no-first-run',
      '--no-default-browser-check',
      '--lang=he-IL',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${dir}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  )
  for (let i = 0; i < 50; i++) {
    const ok = await fetch(`http://127.0.0.1:${port}/json/version`)
      .then((r) => r.ok)
      .catch(() => false)
    if (ok) return proc
    await new Promise((r) => setTimeout(r, 200))
  }
  proc.kill('SIGKILL')
  throw new Error('chromium did not open its debugging port')
}

const pct = (lhr, c) =>
  lhr.categories[c]?.score == null ? null : Math.round(lhr.categories[c].score * 100)
const failing = (lhr, c) =>
  (lhr.categories[c]?.auditRefs ?? [])
    .filter((r) => r.weight > 0 && lhr.audits[r.id]?.score !== null && lhr.audits[r.id]?.score < 1)
    .map((r) => r.id)

async function audit(port, url, throttlingMethod) {
  const result = await lighthouse(url, {
    port,
    output: 'json',
    logLevel: 'error',
    disableStorageReset: true,
    throttlingMethod,
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
  })
  const lhr = result.lhr
  return {
    lhr,
    finalUrl: lhr.finalDisplayedUrl,
    perf: pct(lhr, 'performance'),
    a11y: pct(lhr, 'accessibility'),
    bp: pct(lhr, 'best-practices'),
    seo: pct(lhr, 'seo'),
    fcp: Math.round(lhr.audits['first-contentful-paint'].numericValue),
    lcp: Math.round(lhr.audits['largest-contentful-paint'].numericValue),
    tbt: Math.round(lhr.audits['total-blocking-time'].numericValue),
    cls: Number(lhr.audits['cumulative-layout-shift'].numericValue.toFixed(3)),
    si: Math.round(lhr.audits['speed-index'].numericValue),
    perfFails: failing(lhr, 'performance'),
    a11yFails: failing(lhr, 'accessibility'),
    bpFails: failing(lhr, 'best-practices'),
  }
}

mkdirSync(OUT, { recursive: true })
const notes = []
const rows = []
let port = 9341
let addedByUs = false

for (const route of ROUTES) {
  const url = `${BASE}${route.path}`
  const chrome = await launchChrome(++port)
  try {
    const fill = route.auth && !addedByUs && (route.name === 'cart' || route.name === 'checkout')
    const filled = await prepare(port, route.auth, fill)
    if (fill) {
      notes.push(`cart: ${filled || 'could not add'}`)
      addedByUs = filled === 'added'
    }
    // One warm-up load so the first measured run does not pay for a cold
    // server render or an empty HTTP cache on the server side.
    await audit(port, url, 'provided').catch(() => undefined)
    const simulated = []
    for (let i = 0; i < RUNS; i++) simulated.push(await audit(port, url, 'simulate'))
    const devtools = await audit(port, url, 'devtools')
    const median = [...simulated].sort((a, b) => a.perf - b.perf)[Math.floor(RUNS / 2)]
    writeFileSync(path.join(OUT, `${route.name}.json`), JSON.stringify(median.lhr))
    writeFileSync(path.join(OUT, `${route.name}.devtools.json`), JSON.stringify(devtools.lhr))
    const strip = ({ lhr, ...rest }) => rest
    const row = {
      name: route.name,
      path: route.path,
      median: strip(median),
      simulatedPerf: simulated.map((s) => s.perf),
      devtools: strip(devtools),
    }
    rows.push(row)
    console.log(
      `${route.name.padEnd(9)} perf ${row.simulatedPerf.join('/')} (devtools ${devtools.perf})  a11y ${median.a11y}  bp ${median.bp}  seo ${median.seo}  -> ${median.finalUrl}`,
    )
    if (median.a11yFails.length) console.log(`          a11y fails: ${median.a11yFails.join(', ')}`)
    if (median.perfFails.length) console.log(`          perf fails: ${median.perfFails.join(', ')}`)
  } finally {
    if (addedByUs && route === ROUTES.findLast((r) => r.auth)) {
      notes.push(`cart: ${(await emptyCart(port)) ? 'emptied again' : 'NOT emptied'}`)
    }
    chrome.kill('SIGKILL')
  }
}

writeFileSync(
  path.join(OUT, 'report.json'),
  JSON.stringify({ base: BASE, runs: RUNS, at: new Date().toISOString(), notes, rows }, null, 2),
)
console.log(notes.join('\n'))
console.log(`wrote ${path.relative(process.cwd(), OUT)}/report.json`)
