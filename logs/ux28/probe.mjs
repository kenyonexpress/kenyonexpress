import { readFileSync, writeFileSync } from 'node:fs'
// UX28 probe: what a toast IS on this site, at 380 / 768 / 1440 on a built
// server, sampled every ~16ms from the gesture until the toast is gone, so
// its lifetime, its stacking and its anatomy are numbers and not impressions.
//
//   storeAdd      /product/<seeded slug>, press הוסף לסל once: when the toast
//                 appears, its type / role / live attributes, its box against
//                 the header, the close button's painted box and its REAL hit
//                 box (elementFromPoint 22px out from its centre), the theme
//                 attribute, and when it is removed (the lifetime).
//   compareBurst  /products, press הוסף להשוואה on five cards within ~1s:
//                 how many toasts exist at the peak, how many are visible, how
//                 many distinct texts (four identical "נוסף להשוואה" are either
//                 four toasts or one), and how long the fifth press's ERROR
//                 toast lives against the success ones.
//   darkScheme    the same add-to-cart under prefers-color-scheme: dark: the
//                 toaster's theme attribute and the toast's computed colours
//                 on a site that has no dark mode.
//   admin         signed in as the seeded admin, /admin/products: whether any
//                 toast region exists at all, and what a toast.error() call
//                 produces there (the apply-prices button with no value).
//
// Same script before and after. One admin login per run (the limiter is
// 10/h per IP and 20/h per account); the admin moment is skipped with the
// reason when it cannot sign in.
import { chromium } from '@playwright/test'
import { msUntilNextStep, totpCode } from '../../scripts/seed/totp.mjs'

const BASE = process.env.BASE ?? 'http://localhost:3364'
const TAG = process.env.TAG ?? 'before'
const WIDTHS = (process.env.WIDTHS ?? '380,768,1440').split(',').map(Number)
function envLocal(name) {
  try {
    const line = readFileSync('.env.local', 'utf8')
      .split('\n')
      .find((l) => l.startsWith(`${name}=`))
    return line
      ? line
          .slice(name.length + 1)
          .trim()
          .replace(/^"(.*)"$/, '$1')
      : undefined
  } catch {
    return undefined
  }
}
const ADMIN_EMAIL =
  process.env.E2E_ADMIN_EMAIL ?? envLocal('E2E_ADMIN_EMAIL') ?? 'e2e-admin@test.kenyonexpress.local'
const ADMIN_PASSWORD =
  process.env.E2E_ADMIN_PASSWORD ?? envLocal('E2E_ADMIN_PASSWORD') ?? 'E2eAdmin!pass1'
const PRODUCT = process.env.PRODUCT ?? '/product/e2e-test-physical'
const SAMPLE_MS = 16
const CONSENT = { name: 'ke_consent', value: 'denied.2', domain: 'localhost', path: '/' }

const browser = await chromium.launch()
const out = { base: BASE, tag: TAG, widths: {} }

async function sampleUntil(page, fn, done, timeoutMs = 12000) {
  const t0 = Date.now()
  const samples = []
  let last = null
  while (Date.now() - t0 < timeoutMs) {
    let s
    try {
      s = await page.evaluate(fn)
    } catch (e) {
      s = { evalError: String(e).slice(0, 80) }
    }
    const t = Date.now() - t0
    const key = JSON.stringify(s)
    if (key !== last) {
      samples.push({ t, ...s })
      last = key
    }
    if (!s.evalError && done(s)) break
    await new Promise((r) => setTimeout(r, SAMPLE_MS))
  }
  return { elapsed: Date.now() - t0, samples }
}

/** Everything about the toast region and its toasts, in one read. */
const toastState = () => {
  const r = (el) => {
    if (!el) return null
    const b = el.getBoundingClientRect()
    return {
      x: Math.round(b.x),
      y: Math.round(b.y),
      w: Math.round(b.width),
      h: Math.round(b.height),
    }
  }
  const toaster = document.querySelector('[data-sonner-toaster]')
  const header = document.querySelector('header')
  const toasts = [...document.querySelectorAll('[data-sonner-toast]')]
  const first = toasts[0] ?? null
  const close = first ? first.querySelector('[data-close-button]') : null
  let hit = null
  if (close) {
    const b = close.getBoundingClientRect()
    const cx = b.x + b.width / 2
    const cy = b.y + b.height / 2
    const inside = (x, y) => {
      const el = document.elementFromPoint(x, y)
      return !!el && (el === close || close.contains(el))
    }
    hit = {
      painted: { w: Math.round(b.width), h: Math.round(b.height) },
      at22: [
        inside(cx - 22 + 1, cy),
        inside(cx + 22 - 1, cy),
        inside(cx, cy - 22 + 1),
        inside(cx, cy + 22 - 1),
      ],
    }
  }
  return {
    toaster: toaster
      ? {
          theme: toaster.getAttribute('data-sonner-theme'),
          dir: toaster.getAttribute('dir'),
          label: (toaster.closest('section') ?? toaster).getAttribute('aria-label'),
          live: toaster.getAttribute('aria-live'),
          relevant: toaster.getAttribute('aria-relevant'),
          rect: r(toaster),
        }
      : null,
    header: r(header),
    count: toasts.length,
    visible: toasts.filter((t) => t.getAttribute('data-visible') === 'true').length,
    types: toasts.map((t) => t.getAttribute('data-type')),
    texts: toasts.map((t) => (t.querySelector('[data-title]')?.textContent ?? '').trim()),
    distinct: new Set(
      toasts.map((t) => (t.querySelector('[data-title]')?.textContent ?? '').trim()),
    ).size,
    first: first
      ? {
          role: first.getAttribute('role'),
          live: first.getAttribute('aria-live'),
          type: first.getAttribute('data-type'),
          removed: first.getAttribute('data-removed'),
          rect: r(first),
          bg: getComputedStyle(first).backgroundColor,
          color: getComputedStyle(first).color,
          closeLabel: close ? close.getAttribute('aria-label') : null,
          closeRect: r(close),
          hit,
        }
      : null,
  }
}

async function newContext(width, extra = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    locale: 'he-IL',
    ...extra,
  })
  await ctx.addCookies([CONSENT])
  return ctx
}

function lifetime(run) {
  const appeared = run.samples.find((s) => s.count > 0)
  const gone = appeared ? run.samples.find((s) => s.t > appeared.t && s.count === 0) : null
  const peak = run.samples.reduce((m, s) => (s.count > m ? s.count : m), 0)
  const peakSample = run.samples.find((s) => s.count === peak)
  // The enter animation translates the toast from above the viewport, so the
  // anatomy is read from the first sample at least 600ms after it appeared.
  const settled = appeared
    ? (run.samples.find((s) => s.count > 0 && s.t >= appeared.t + 600) ?? appeared)
    : null
  return {
    appearedAt: appeared ? appeared.t : null,
    goneAt: gone ? gone.t : null,
    lifetime: appeared && gone ? gone.t - appeared.t : null,
    peak,
    peakVisible: peakSample ? peakSample.visible : null,
    peakDistinct: peakSample ? peakSample.distinct : null,
    peakTypes: peakSample ? peakSample.types : null,
    peakTexts: peakSample ? peakSample.texts : null,
    anatomy: settled
      ? { at: settled.t, toaster: settled.toaster, header: settled.header, first: settled.first }
      : null,
  }
}

async function storeAdd(ctx, width, tag) {
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)))
  await page.goto(`${BASE}${PRODUCT}`, { waitUntil: 'networkidle' })
  const btn = page.getByRole('button', { name: /הוסף לסל|קנה עכשיו/ }).first()
  await btn.waitFor({ state: 'visible', timeout: 15000 })
  const idle = await page.evaluate(toastState)
  await btn.click()
  let seenAny = false
  const run = await sampleUntil(
    page,
    toastState,
    (s) => {
      if (s.count > 0) seenAny = true
      return seenAny && s.count === 0
    },
    12000,
  )
  const summary = lifetime(run)
  await page.screenshot({ path: `logs/ux28/${tag}-${width}-storeAdd.png` })
  await page.close()
  return { idleToaster: idle.toaster, ...summary, errors, states: run.samples.length }
}

async function compareBurst(ctx, width, tag) {
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)))
  await page.goto(`${BASE}/products`, { waitUntil: 'networkidle' })
  const buttons = page.locator('button[aria-label="הוסף להשוואה"]')
  await buttons.first().waitFor({ state: 'visible', timeout: 15000 })
  const available = await buttons.count()
  const presses = Math.min(5, available)
  // Press five different cards' compare buttons as fast as the page allows.
  for (let i = 0; i < presses; i++) {
    await buttons
      .nth(0)
      .click({ force: true, timeout: 5000 })
      .catch(() => {})
    await page.waitForTimeout(120)
  }
  let seenAny = false
  const run = await sampleUntil(
    page,
    toastState,
    (s) => {
      if (s.count > 0) seenAny = true
      return seenAny && s.count === 0
    },
    14000,
  )
  const summary = lifetime(run)
  // The error toast (the fifth press) and the last success toast: when did each go?
  const errorSeen = run.samples.find((s) => s.types.includes('error'))
  const errorGone = errorSeen
    ? run.samples.find((s) => s.t > errorSeen.t && !s.types.includes('error'))
    : null
  const successSeen = run.samples.find((s) => s.types.includes('success'))
  const successGone = successSeen
    ? run.samples.find((s) => s.t > successSeen.t && !s.types.includes('success'))
    : null
  await page.screenshot({ path: `logs/ux28/${tag}-${width}-compareBurst.png` })
  await page.close()
  return {
    available,
    presses,
    ...summary,
    errorLifetime: errorSeen && errorGone ? errorGone.t - errorSeen.t : null,
    successLifetime: successSeen && successGone ? successGone.t - successSeen.t : null,
    errors,
  }
}

async function darkScheme(width, tag) {
  const ctx = await newContext(width, { colorScheme: 'dark' })
  const page = await ctx.newPage()
  await page.goto(`${BASE}${PRODUCT}`, { waitUntil: 'networkidle' })
  const btn = page.getByRole('button', { name: /הוסף לסל|קנה עכשיו/ }).first()
  await btn.waitFor({ state: 'visible', timeout: 15000 })
  await btn.click()
  const run = await sampleUntil(page, toastState, (s) => s.count > 0 && s.first?.bg, 8000)
  const seen = run.samples.find((s) => s.count > 0)
  await page.screenshot({ path: `logs/ux28/${tag}-${width}-dark.png` })
  await ctx.close()
  return seen
    ? { theme: seen.toaster?.theme, bg: seen.first?.bg, color: seen.first?.color, bodyBg: null }
    : { none: true }
}

// One admin login for the run; cookies copied into each width's context.
let adminCookies = null
let adminError = null
{
  const ctx = await newContext(1440)
  const page = await ctx.newPage()
  try {
    await page.goto(`${BASE}/login?next=%2Fadmin%2Fproducts`)
    await page.getByLabel('אימייל', { exact: true }).fill(ADMIN_EMAIL)
    await page.getByLabel('סיסמה', { exact: true }).fill(ADMIN_PASSWORD)
    await page.getByRole('button', { name: 'כניסה', exact: true }).click()
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20_000 })
    if (new URL(page.url()).pathname.startsWith('/admin-mfa')) {
      const secret = readFileSync('.e2e/admin-totp.secret', 'utf8').trim()
      if (msUntilNextStep() < 3000) await page.waitForTimeout(msUntilNextStep() + 100)
      await page.locator('#mfa-code').fill(totpCode(secret))
      await page.getByRole('button', { name: 'אימות וכניסה' }).click()
      await page.waitForURL((u) => !u.pathname.startsWith('/admin-mfa'), { timeout: 20_000 })
    }
    adminCookies = await ctx.cookies()
  } catch (e) {
    adminError = String(e).slice(0, 200)
  }
  await ctx.close()
}
out.adminLogin = adminCookies
  ? { ok: true, cookies: adminCookies.length }
  : { ok: false, error: adminError }

async function admin(width, tag) {
  if (!adminCookies) return { skipped: adminError }
  const ctx = await newContext(width)
  await ctx.addCookies(adminCookies)
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)))
  await page.goto(`${BASE}/admin/products`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  const idle = await page.evaluate(toastState)
  // A toast with no write behind it: the approvals screen refuses a rejection
  // with no reason BEFORE calling the server. Only when a pending row exists.
  await page.goto(`${BASE}/admin/approvals`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  const openReject = page.getByRole('button', { name: 'דחייה' }).first()
  let pressed = false
  let run = { samples: [] }
  if ((await openReject.count()) > 0) {
    await openReject.click()
    const confirm = page.getByRole('button', { name: 'דחייה' }).first()
    await confirm.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {})
    await confirm.click().catch(() => {})
    pressed = true
    let seenAny = false
    run = await sampleUntil(
      page,
      toastState,
      (s) => {
        if (s.count > 0) seenAny = true
        return seenAny && s.count === 0
      },
      12000,
    )
  }
  const summary = pressed ? lifetime(run) : null
  await page.screenshot({ path: `logs/ux28/${tag}-${width}-admin.png` })
  await ctx.close()
  return {
    productsToaster: idle.toaster,
    approvals: {
      pressed,
      appearedAt: summary?.appearedAt ?? null,
      lifetime: summary?.lifetime ?? null,
      peakTypes: summary?.peakTypes ?? null,
      peakTexts: summary?.peakTexts ?? null,
      anatomy: summary?.anatomy ?? null,
    },
    errors,
  }
}

for (const width of WIDTHS) {
  const w = {}
  const ctx = await newContext(width)
  w.storeAdd = await storeAdd(ctx, width, TAG)
  w.compareBurst = await compareBurst(ctx, width, TAG)
  await ctx.close()
  w.darkScheme = await darkScheme(width, TAG)
  w.admin = await admin(width, TAG)
  out.widths[width] = w
  console.log(
    width,
    JSON.stringify({ ...w, storeAdd: { ...w.storeAdd, anatomy: undefined } }).slice(0, 1200),
  )
}

await browser.close()
writeFileSync(`logs/ux28/${TAG}.json`, JSON.stringify(out, null, 2))
console.log(`wrote logs/ux28/${TAG}.json`)
