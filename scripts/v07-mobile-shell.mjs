#!/usr/bin/env node
/**
 * V07 proof: the mobile shell of every OPEN route (cart, cart drawer,
 * checkout, order confirmation, login, register, every /account page,
 * /supplier/apply and the four legal documents) at 380 and 768.
 *
 *   PORT=3311 pnpm start &
 *   BASE=http://localhost:3311 OUT=docs/V07/after node scripts/v07-mobile-shell.mjs
 *
 * Six checks per route and width:
 *
 *   overflow   document scrollWidth - innerWidth (horizontal scroll).
 *   covered    controls whose centre, scrolled to the middle of the screen or
 *              seen at the foot of the page, hits another element (a fixed bar
 *              over them, or two boxes on top of each other).
 *   small      controls under 44px (24px for a link inside running text).
 *              Counted separately inside the frozen header, footer and tab bar.
 *   keyboard   the viewport is shortened by an on-screen keyboard's height
 *              (the resizes-content model, where fixed bars ride up with the
 *              keyboard, which is the worst case) and every field is focused:
 *              it must end up on screen and not under a fixed bar.
 *   safe-area  Chromium's safe-area override (an iPhone's 47px top and 34px
 *              bottom) is applied: no control inside a bottom-fixed bar may sit
 *              in the bottom inset, and no two fixed bars may overlap.
 *   install    a synthetic beforeinstallprompt after an interaction: where the
 *              banner appears it must not cover a control or another bar.
 *
 * Signed in like scripts/v05-account-shots.mjs (a minted SSR cookie for the
 * E2E fixture customer). Adds one product to that customer's cart for /cart
 * and /checkout and empties it again at the end. Nothing is submitted.
 */
import { createHmac } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

const BASE = process.env.BASE ?? 'http://localhost:3311'
const OUT = path.resolve(process.env.OUT ?? 'docs/V07/after')
const WIDTHS = (process.env.WIDTHS ?? '380,768').split(',').map(Number)
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null
const EMAIL = process.env.E2E_CUSTOMER_EMAIL ?? 'e2e-customer@test.kenyonexpress.local'
const PASSWORD = process.env.E2E_CUSTOMER_PASSWORD ?? 'E2eCustomer!pass1'
const BUY = /הוסף לסל|קנה עכשיו/
const CART_BUTTON = /עגלת קניות, (\d+) פריטים/
const HEIGHT = { 380: 800, 768: 1024 }
// A phone keyboard with its suggestion strip, and a tablet one.
const KEYBOARD = { 380: 336, 768: 400 }
const SAFE = { top: 47, bottom: 34, left: 0, right: 0 }

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
const value = `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`
const cookieName = `sb-${ref}-auth-token`
const CHUNK = 3180
const authCookies =
  value.length <= CHUNK
    ? [{ name: cookieName, value, url: BASE }]
    : Array.from({ length: Math.ceil(value.length / CHUNK) }, (_, i) => ({
        name: `${cookieName}.${i}`,
        value: value.slice(i * CHUNK, (i + 1) * CHUNK),
        url: BASE,
      }))
const tsSecret = envLocal('TURNSTILE_SECRET_KEY')?.trim()
if (tsSecret) {
  const payload = `${session.user.id}.${Math.floor(Date.now() / 1000) + 3600}`
  const mac = createHmac('sha256', `turnstile-pass:${tsSecret}`).update(payload).digest('base64url')
  authCookies.push({ name: 'ke_ts_pass', value: `${payload}.${mac}`, url: BASE })
}

mkdirSync(OUT, { recursive: true })

const ACCOUNT = [
  '',
  '/orders',
  '/wallet',
  '/coupons',
  '/details',
  '/security',
  '/addresses',
  '/vouchers',
  '/my-vouchers',
  '/notifications',
  '/invoices',
  '/subscriptions',
  '/tickets',
  '/tokens',
  '/referrals',
  '/affiliate',
  '/wishlist',
].map((p) => ({ name: `account${p.replace(/\//g, '-') || ''}`, path: `/account${p}`, auth: true }))

const ROUTES = [
  { name: 'cart', path: '/cart', auth: true, cart: true },
  { name: 'cart-drawer', path: '/cart', auth: true, cart: true, drawer: true },
  { name: 'checkout', path: '/checkout', auth: true, cart: true },
  { name: 'confirm', path: 'CONFIRM', auth: true },
  { name: 'login', path: '/login' },
  { name: 'register', path: '/register' },
  ...ACCOUNT,
  { name: 'supplier-apply', path: '/supplier/apply', auth: true },
  { name: 'terms', path: '/terms-and-conditions' },
  { name: 'privacy', path: '/privacy-policy' },
  { name: 'returns', path: '/refund_returns' },
  { name: 'accessibility', path: '/accessibility' },
].filter((r) => !ONLY || ONLY.has(r.name))

/* ---------------------------------------------------------------- in page */

// Runs in the page. Everything shared by the checks lives here so the
// evaluate calls stay one-liners.
function installHelpers() {
  const CONTROL =
    'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [role="tab"], summary'
  const CHROME = 'header, footer, [data-bottom-tab-bar], [class*="topbar"]'
  const visible = (el) => {
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) return false
    const s = getComputedStyle(el)
    if (s.visibility === 'hidden' || s.opacity === '0') return false
    if (el.closest('[aria-hidden="true"], [inert], .sr-only')) return false
    return true
  }
  const label = (el) =>
    (
      el.getAttribute('aria-label') ||
      el.textContent ||
      el.getAttribute('name') ||
      el.getAttribute('placeholder') ||
      el.tagName
    )
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 40)
  const describe = (el) => {
    if (!el) return 'nothing'
    const cls = typeof el.className === 'string' ? el.className.split(' ').filter(Boolean)[0] : ''
    return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}`
  }
  const isFixed = (el) => {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const p = getComputedStyle(n).position
      if (p === 'fixed' || p === 'sticky') return n
    }
    return null
  }
  // The control is reachable at its centre: the hit is itself, inside it, or
  // the label that owns it.
  const hits = (el) => {
    const r = el.getBoundingClientRect()
    const x = r.left + r.width / 2
    const y = r.top + r.height / 2
    if (y < 0 || y > innerHeight || x < 0 || x > innerWidth) {
      // A tab inside a sideways-scrolling strip is reached by swiping the
      // strip, which scrollIntoView does not always do under scroll-snap.
      for (let n = el.parentElement; n; n = n.parentElement) {
        if (
          ['auto', 'scroll'].includes(getComputedStyle(n).overflowX) &&
          n.scrollWidth > n.clientWidth
        )
          return { ok: true }
      }
      return { ok: false, by: 'off-screen' }
    }
    const hit = document.elementFromPoint(x, y)
    if (!hit) return { ok: false, by: 'nothing' }
    if (hit === el || el.contains(hit) || hit.contains(el)) return { ok: true }
    if (hit.closest('label') && hit.closest('label') === el.closest('label')) return { ok: true }
    if (el.labels && [...el.labels].some((l) => l.contains(hit))) return { ok: true }
    return { ok: false, by: describe(hit) }
  }
  const controls = (scope) =>
    [...(scope ?? document).querySelectorAll(CONTROL)].filter(
      (el) =>
        visible(el) &&
        !el.disabled &&
        (!(el.type === 'checkbox' || el.type === 'radio') || el.closest('label')),
    )
  const fixedBars = () =>
    [...document.querySelectorAll('body *')]
      .filter((el) => {
        const s = getComputedStyle(el)
        if (s.position !== 'fixed') return false
        if (!visible(el)) return false
        const r = el.getBoundingClientRect()
        // Full-screen overlays (drawer, dialogs) are not bars.
        if (r.height >= innerHeight * 0.9) return false
        return true
      })
      .filter((el, _, all) => !all.some((o) => o !== el && o.contains(el)))
  window.__v07 = { CONTROL, CHROME, visible, label, describe, isFixed, hits, controls, fixedBars }
}

function auditPage(rootSel) {
  const { CHROME, visible, label, hits, controls, fixedBars, describe } = window.__v07
  const root = document.querySelector(rootSel) ?? document.querySelector('main') ?? document.body
  const small = []
  const smallChrome = []
  for (const el of document.querySelectorAll(window.__v07.CONTROL)) {
    if (!visible(el)) continue
    const r = el.getBoundingClientRect()
    let box = r
    if ((el.type === 'checkbox' || el.type === 'radio') && el.closest('label'))
      box = el.closest('label').getBoundingClientRect()
    const inline = el.tagName === 'A' && getComputedStyle(el).display === 'inline'
    const floor = inline ? 24 : 44
    if (box.height >= floor && (inline || box.width >= 44)) continue
    const item = `${label(el)} ${Math.round(box.width)}x${Math.round(box.height)}`
    if (el.closest(CHROME)) smallChrome.push(item)
    else small.push(item)
  }
  // Fixed bars on top of each other, before anything scrolls (a scroll can
  // hide an IntersectionObserver-driven bar until its next callback).
  const bars = fixedBars()
  const barOverlap = []
  for (let i = 0; i < bars.length; i++) {
    for (let j = i + 1; j < bars.length; j++) {
      const a = bars[i].getBoundingClientRect()
      const b = bars[j].getBoundingClientRect()
      const x = Math.min(a.right, b.right) - Math.max(a.left, b.left)
      const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      if (x > 1 && y > 1)
        barOverlap.push(`${describe(bars[i])} x ${describe(bars[j])} ${Math.round(y)}px`)
    }
  }
  const barList = bars.map(
    (b) =>
      `${describe(b)}@${Math.round(b.getBoundingClientRect().top)}-${Math.round(b.getBoundingClientRect().bottom)}`,
  )
  // Covered at the centre of the screen.
  const covered = []
  const own = controls(root)
  for (const el of own.slice(0, 250)) {
    if (window.__v07.isFixed(el)) continue
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })
    const h = hits(el)
    if (!h.ok) covered.push(`${label(el)} under ${h.by}`)
  }
  // And at the foot of the page, where a bottom bar can sit over the last row.
  window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })
  const atFoot = []
  for (const el of own) {
    if (window.__v07.isFixed(el)) continue
    const r = el.getBoundingClientRect()
    // The lower half only: in the upper half a hit is the sticky header over
    // a row the shopper scrolls back to, not a bar sitting on the last row.
    if (r.bottom <= innerHeight / 2 || r.top >= innerHeight) continue
    const h = hits(el)
    if (!h.ok) atFoot.push(`${label(el)} under ${h.by}`)
  }
  window.scrollTo({ top: 0, behavior: 'instant' })
  return {
    overflowX: document.documentElement.scrollWidth - window.innerWidth,
    small,
    smallChrome,
    covered,
    atFoot,
    bars: barList,
    barOverlap,
  }
}

function safeAreaAudit(inset) {
  const { fixedBars, controls, describe, label } = window.__v07
  const out = []
  for (const bar of fixedBars()) {
    const r = bar.getBoundingClientRect()
    const atBottom = r.bottom >= innerHeight - 2
    const atTop = r.top <= 2
    for (const el of controls(bar)) {
      const c = el.getBoundingClientRect()
      if (atBottom && c.bottom > innerHeight - inset.bottom + 1)
        out.push(
          `${describe(bar)}: ${label(el)} bottom ${Math.round(c.bottom)} > ${innerHeight - inset.bottom}`,
        )
      if (atTop && c.top < inset.top - 1)
        out.push(`${describe(bar)}: ${label(el)} top ${Math.round(c.top)} < ${inset.top}`)
    }
  }
  return out
}

/* ---------------------------------------------------------------- driver */

const browser = await chromium.launch({ channel: 'chromium' })
const results = []
const notes = []

async function newContext(width, auth) {
  const context = await browser.newContext({
    viewport: { width, height: HEIGHT[width] ?? 900 },
    locale: 'he-IL',
    hasTouch: true,
    isMobile: width < 768,
    deviceScaleFactor: 1,
  })
  await context.addCookies([
    { name: 'ke_consent', value: 'denied.3', url: BASE },
    ...(auth ? authCookies : []),
  ])
  await context.addInitScript(
    ({ id }) => {
      try {
        localStorage.setItem(`ke_passkey_prompt_seen:${id}`, String(Date.now() + 864e9))
        localStorage.removeItem('ke:pwa-install-shown')
        localStorage.removeItem('ke:pwa-install-dismissed')
      } catch {}
    },
    { id: session.user.id },
  )
  await context.addInitScript(installHelpers)
  return context
}

async function go(page, context, url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const resp = await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle', timeout: 60_000 })
      if (
        new URL(page.url()).pathname.startsWith('/login') &&
        !url.startsWith('/login') &&
        attempt < 2
      ) {
        await context.addCookies(authCookies)
        continue
      }
      await page.waitForTimeout(400)
      return resp?.status()
    } catch (cause) {
      if (attempt >= 2) throw cause
    }
  }
}

async function fillCart(page) {
  await page.goto(`${BASE}/cart`, { waitUntil: 'networkidle' })
  if (await page.locator('.cart-table').count()) return true
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
    if (await answered.then((r) => r.ok()).catch(() => false)) return true
  }
  return false
}

let confirmPath = null
let filledByUs = false

try {
  // Setup once at 1440: a line in the cart and a paid order to confirm.
  {
    const context = await newContext(768, true)
    const page = await context.newPage()
    const had = await page
      .goto(`${BASE}/cart`, { waitUntil: 'networkidle' })
      .then(() => page.locator('.cart-table').count())
    if (ROUTES.some((r) => r.cart)) {
      filledByUs = !had && (await fillCart(page))
      notes.push(
        `cart: ${had ? 'already had lines' : filledByUs ? 'one product added' : 'could not add'}`,
      )
    }
    if (ROUTES.some((r) => r.path === 'CONFIRM')) {
      await page.goto(`${BASE}/account/orders`, { waitUntil: 'networkidle' })
      const href = await page
        .locator('a[href^="/account/orders/"]')
        .first()
        .getAttribute('href')
        .catch(() => null)
      const id = href?.split('/').pop()
      if (id) confirmPath = `/checkout/confirm?order_id=${id}`
      notes.push(
        `confirm: ${confirmPath ? 'latest order of the fixture customer' : 'no order found'}`,
      )
    }
    await context.close()
  }

  for (const width of WIDTHS) {
    const height = HEIGHT[width] ?? 900
    const contexts = { true: await newContext(width, true), false: await newContext(width, false) }
    const pages = { true: await contexts.true.newPage(), false: await contexts.false.newPage() }
    for (const route of ROUTES) {
      const url = route.path === 'CONFIRM' ? confirmPath : route.path
      if (!url) continue
      const context = contexts[Boolean(route.auth)]
      const page = pages[Boolean(route.auth)]
      await page.setViewportSize({ width, height })
      const status = await go(page, context, url)
      let rootSel = 'main'
      if (route.drawer) {
        const button = page
          .getByRole('button', { name: CART_BUTTON })
          .filter({ visible: true })
          .first()
        await button.click().catch(() => undefined)
        await page.waitForTimeout(700)
        rootSel = width < 768 ? '.cart-drawer' : '.mini-cart__panel'
      }
      const shot = `${route.name}-${width}`
      await page.screenshot({ path: path.join(OUT, `${shot}-fold.png`) })
      const audit = await page.evaluate(auditPage, rootSel)

      // Keyboard: shorten the viewport, focus each field.
      const keyboard = []
      if (!route.drawer) {
        await page.setViewportSize({ width, height: height - KEYBOARD[width] })
        const fields = await page
          .locator(
            'main input:not([type=hidden]):not([type=checkbox]):not([type=radio]), main textarea, main select',
          )
          .all()
        let n = 0
        for (const f of fields) {
          if (
            !(await f.isVisible().catch(() => false)) ||
            !(await f.isEditable().catch(() => false))
          )
            continue
          if (n++ >= 40) break
          await f.focus()
          await page.waitForTimeout(120)
          const h = await f.evaluate((el) => {
            const r = window.__v07.hits(el)
            return r.ok ? null : `${window.__v07.label(el)} ${r.by}`
          })
          if (h) keyboard.push(h)
        }
        await page.evaluate(() => document.activeElement?.blur())
        await page.setViewportSize({ width, height })
        if (n)
          await page
            .screenshot({ path: path.join(OUT, `${shot}-keyboard.png`) })
            .catch(() => undefined)
        audit.fields = n
      }

      // Safe area.
      let safeArea = []
      const cdp = await context.newCDPSession(page)
      const sa = await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: SAFE }).then(
        () => true,
        (e) => {
          notes.push(`safe-area override unavailable: ${e.message}`)
          return false
        },
      )
      if (sa) {
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
        await page.waitForTimeout(400)
        safeArea = await page.evaluate(safeAreaAudit, SAFE)
        const again = await page.evaluate(auditPage, rootSel)
        safeArea.push(
          ...again.barOverlap.map((b) => `overlap ${b}`),
          ...again.atFoot.map((b) => `foot ${b}`),
        )
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
        await page.waitForTimeout(400)
        await page.screenshot({ path: path.join(OUT, `${shot}-safe-area.png`) })
        await cdp.send('Emulation.setSafeAreaInsetsOverride', {
          insets: { top: 0, bottom: 0, left: 0, right: 0 },
        })
      }
      await cdp.detach()

      // The install banner.
      let install = { shown: false }
      if (!route.drawer) {
        await page.evaluate(() => {
          window.scrollTo({ top: 0, behavior: 'instant' })
          window.dispatchEvent(new Event('scroll'))
          const e = new Event('beforeinstallprompt', { cancelable: true })
          e.prompt = async () => undefined
          e.userChoice = Promise.resolve({ outcome: 'dismissed' })
          window.dispatchEvent(e)
        })
        await page.waitForTimeout(400)
        const banner = page.locator('section[data-moment="browse"]')
        if (await banner.count()) {
          const a = await page.evaluate(auditPage, rootSel)
          install = { shown: true, covered: [...a.covered, ...a.atFoot], barOverlap: a.barOverlap }
          await page.screenshot({ path: path.join(OUT, `${shot}-install.png`) })
        }
      }

      results.push({
        shot,
        status,
        url: page.url().replace(BASE, ''),
        ...audit,
        keyboard,
        safeArea,
        install,
      })
      console.error(
        `${shot} ${status} overflow=${audit.overflowX} small=${audit.small.length}/${audit.smallChrome.length} covered=${audit.covered.length}+${audit.atFoot.length} bars=${audit.barOverlap.length} kb=${keyboard.length}/${audit.fields ?? 0} safe=${safeArea.length} install=${install.shown ? install.covered.length + install.barOverlap.length : '-'}`,
      )
      if (route.drawer) await page.keyboard.press('Escape')
    }
    await contexts.true.close()
    await contexts.false.close()
  }

  if (filledByUs) {
    const context = await newContext(768, true)
    const page = await context.newPage()
    await page.goto(`${BASE}/cart`, { waitUntil: 'load' })
    await page
      .locator('.cart-table')
      .waitFor({ timeout: 20_000 })
      .catch(() => undefined)
    await page
      .getByRole('button', { name: 'רוקן עגלה' })
      .click()
      .catch(() => undefined)
    await page
      .locator('.cart-empty')
      .waitFor({ timeout: 20_000 })
      .catch(() => undefined)
    notes.push('cart: emptied again')
    await context.close()
  }
} finally {
  await browser.close()
}

writeFileSync(path.join(OUT, 'report.json'), `${JSON.stringify({ notes, results }, null, 1)}\n`)
const fails = results.filter(
  (r) =>
    r.overflowX > 0 ||
    r.small.length ||
    r.covered.length ||
    r.atFoot.length ||
    r.barOverlap.length ||
    r.keyboard.length ||
    r.safeArea.length ||
    (r.install.shown && (r.install.covered.length || r.install.barOverlap.length)),
)
console.log(
  JSON.stringify({ notes, routes: results.length, failing: fails.map((f) => f.shot) }, null, 1),
)
process.exitCode = fails.length ? 1 : 0
