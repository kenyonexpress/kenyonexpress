import { writeFileSync } from 'node:fs'
// UX23 probe: the way into the account from the storefront, at 380 / 768 /
// 1440 on a built server, anonymous. On the home page it finds the top bar's
// account link, records its box, presses it, and reads what happened: the URL
// afterwards (a full navigation to /login, or the same page with a dialog over
// it), whether a dialog exists, its box, its heading, its tablist and tabs,
// its forms, where focus landed, and what Escape does. It then opens /login
// itself and reads the same shape there (tabs, forms, the passkey and
// magic-link controls). The same script runs before and after, so the two
// JSON files diff cleanly.
import { chromium } from '@playwright/test'

const BASE = process.env.BASE ?? 'http://localhost:3364'
const TAG = process.env.TAG ?? 'before'
const WIDTHS = (process.env.WIDTHS ?? '380,768,1440').split(',').map(Number)

const browser = await chromium.launch()
const out = {}
const CONSENT = { name: 'ke_consent', value: 'denied.2', domain: 'localhost', path: '/' }

const shapeFn = `(() => {
  const rect = (el) => {
    if (!el) return null
    const b = el.getBoundingClientRect()
    return { x: +b.x.toFixed(1), y: +(b.y + window.scrollY).toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }
  }
  const visible = (el) => !!el && el.getClientRects().length > 0
  const q = (s) => document.querySelector(s)
  const qa = (s) => [...document.querySelectorAll(s)]
  const dialog = q('.login-dialog') ?? q('dialog[open]')
  const scope = dialog ?? q('main') ?? document.body
  const tablist = scope.querySelector('[role="tablist"]')
  const forms = [...scope.querySelectorAll('form')].map((f) => ({
    visible: visible(f),
    rect: rect(f),
    fields: [...f.querySelectorAll('input:not([type="hidden"])')].map((i) => i.id || i.name),
    hiddenNext: f.querySelector('input[name="next"]')?.value ?? null,
    submit: f.querySelector('button[type="submit"]')?.textContent.trim() ?? null,
  }))
  const buttons = [...scope.querySelectorAll('button')].filter(visible).map((b) => ({ text: b.textContent.trim().slice(0, 60), rect: rect(b) }))
  const active = document.activeElement
  return {
    url: location.pathname + location.search,
    dialog: dialog ? {
      tag: dialog.tagName,
      open: dialog.hasAttribute('open'),
      rect: rect(dialog),
      label: dialog.getAttribute('aria-label') ?? (dialog.getAttribute('aria-labelledby') ? document.getElementById(dialog.getAttribute('aria-labelledby'))?.textContent.trim() : null),
      modal: dialog.getAttribute('aria-modal'),
      heading: dialog.querySelector('h2')?.textContent.trim() ?? null,
      close: rect(dialog.querySelector('[data-login-dialog-close], .login-dialog__close')),
      bodyLocked: getComputedStyle(document.body).overflow,
    } : null,
    tablist: tablist ? {
      rect: rect(tablist),
      label: tablist.getAttribute('aria-label'),
      tabs: [...tablist.querySelectorAll('[role="tab"]')].map((t) => ({ text: t.textContent.trim(), selected: t.getAttribute('aria-selected'), tabIndex: t.tabIndex, rect: rect(t) })),
      panels: qa('[role="tabpanel"]').map((p) => ({ id: p.id, hidden: p.hidden })),
    } : null,
    forms,
    buttons,
    passkey: buttons.find((b) => /Face ID|טביעת אצבע/.test(b.text)) ?? null,
    magic: buttons.find((b) => /קישור/.test(b.text)) ?? null,
    sms: buttons.find((b) => /SMS/.test(b.text)) ?? null,
    focus: active ? { tag: active.tagName, text: (active.getAttribute('aria-label') ?? active.textContent ?? '').trim().slice(0, 40), inDialog: dialog ? dialog.contains(active) : null } : null,
    pageHeight: document.documentElement.scrollHeight,
    scrollWidth: document.documentElement.scrollWidth,
  }
})()`

for (const width of WIDTHS) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: 1,
    locale: 'he-IL',
    hasTouch: width < 768,
  })
  await ctx.addCookies([CONSENT])
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  const w = {}
  out[width] = w

  // 1. Home, press the account link.
  await page.goto(`${BASE}/`, { waitUntil: 'load', timeout: 60000 })
  await page.waitForTimeout(800)
  const link = page.locator('a[href="/login"], a[href^="/login?"]').first()
  const linkCount = await page.locator('a[href="/login"], a[href^="/login?"]').count()
  w.home = {
    accountLinks: linkCount,
    accountLink: linkCount
      ? await link.evaluate((a) => {
          const b = a.getBoundingClientRect()
          return {
            text: a.textContent.trim(),
            href: a.getAttribute('href'),
            visible: a.getClientRects().length > 0,
            rect: {
              x: +b.x.toFixed(1),
              y: +(b.y + window.scrollY).toFixed(1),
              w: +b.width.toFixed(1),
              h: +b.height.toFixed(1),
            },
          }
        })
      : null,
  }
  if (linkCount && w.home.accountLink.visible) {
    await link.click()
    await page.waitForTimeout(1500)
    w.afterPress = await page.evaluate(shapeFn)
    await page.screenshot({ path: `logs/ux23/${TAG}-${width}-after-press.png`, fullPage: false })
    // Escape: a dialog closes and focus returns; a page does nothing.
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
    w.afterEscape = await page.evaluate(shapeFn)
    // Tab from the restored focus: still on the page, not behind an overlay.
    if (w.afterPress.dialog) {
      await link.click()
      await page.waitForTimeout(800)
      const seen = []
      for (let i = 0; i < 12; i++) {
        await page.keyboard.press('Tab')
        seen.push(
          await page.evaluate(() => {
            const a = document.activeElement
            const d = document.querySelector('.login-dialog')
            return {
              tag: a?.tagName,
              text: (a?.getAttribute('aria-label') ?? a?.textContent ?? '').trim().slice(0, 30),
              inDialog: d ? d.contains(a) : null,
            }
          }),
        )
      }
      w.tabWalk = seen
      // Overlay press closes.
      await page.locator('.login-dialog__overlay').click({ position: { x: 5, y: 5 }, force: true })
      await page.waitForTimeout(400)
      w.afterOverlay = await page.evaluate(shapeFn)
    }
  }

  // 2. /login itself.
  await page.goto(`${BASE}/login`, { waitUntil: 'load', timeout: 60000 })
  await page.waitForTimeout(800)
  w.loginPage = await page.evaluate(shapeFn)
  await page.screenshot({ path: `logs/ux23/${TAG}-${width}-login.png`, fullPage: true })
  // Choose the SMS tab when there is one.
  const smsTab = page.locator('[role="tab"]', { hasText: 'SMS' })
  if (await smsTab.count()) {
    await smsTab.click()
    await page.waitForTimeout(300)
    w.loginPageSmsTab = await page.evaluate(shapeFn)
    // Arrow key back to the email tab (RTL: ArrowRight goes to the previous tab).
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(200)
    w.loginPageArrow = await page.evaluate(shapeFn)
  }
  w.errors = errors.splice(0)
  await ctx.close()
}

await browser.close()
writeFileSync(`logs/ux23/${TAG}.json`, JSON.stringify(out, null, 2))
console.log(`wrote logs/ux23/${TAG}.json`)
for (const [width, w] of Object.entries(out)) {
  console.log(
    width,
    'press ->',
    w.afterPress?.url,
    'dialog:',
    !!w.afterPress?.dialog,
    'tablist:',
    w.loginPage?.tablist?.tabs?.map((t) => t.text) ?? null,
    'forms on /login:',
    w.loginPage?.forms?.length,
    'errors:',
    w.errors.length,
  )
}
