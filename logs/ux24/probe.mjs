import { writeFileSync } from 'node:fs'
// UX24 probe: the way into a NEW account, at 380 / 768 / 1440 on a built
// server, anonymous. On the home page it opens the login dialog (UX23) and
// presses its הרשמה link, then reads what happened: the URL afterwards (a
// full navigation to /signup, or the same page with the dialog switched to
// the register flow), the dialog's heading, any stepper (an <ol> of steps
// with aria-current), the visible fields, the terms control, the buttons and
// their heights. It then opens /signup itself and reads the same shape, and
// walks the first step forward with valid details to see whether a second
// step appears without a request. The same script runs before and after, so
// the two JSON files diff cleanly.
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
  const dialog = q('.login-dialog') ?? q('dialog[open]')
  const scope = dialog ?? q('main') ?? document.body
  const stepper = scope.querySelector('.register-steps, ol[aria-label]')
  const fields = [...scope.querySelectorAll('input:not([type="hidden"])')].filter(visible).map((i) => ({
    id: i.id || i.name, type: i.type, required: i.required, rect: rect(i),
    label: i.labels?.[0]?.textContent.trim().slice(0, 50) ?? null,
  }))
  const buttons = [...scope.querySelectorAll('button')].filter(visible).map((b) => ({ text: b.textContent.trim().slice(0, 60), rect: rect(b) }))
  const terms = scope.querySelector('input[name="accept_terms"]')
  const active = document.activeElement
  return {
    url: location.pathname + location.search,
    dialog: dialog ? {
      tag: dialog.tagName,
      rect: rect(dialog),
      label: dialog.getAttribute('aria-labelledby') ? document.getElementById(dialog.getAttribute('aria-labelledby'))?.textContent.trim() : dialog.getAttribute('aria-label'),
      modal: dialog.getAttribute('aria-modal'),
      bodyLocked: getComputedStyle(document.body).overflow,
    } : null,
    heading: scope.querySelector('h2')?.textContent.trim() ?? null,
    stepper: stepper ? {
      rect: rect(stepper),
      label: stepper.getAttribute('aria-label'),
      steps: [...stepper.querySelectorAll('li')].map((li) => ({ text: li.textContent.trim().slice(0, 30), current: li.getAttribute('aria-current'), state: li.dataset.state ?? null })),
    } : null,
    fields,
    terms: terms ? { visible: visible(terms), required: terms.required, checked: terms.checked, rect: rect(terms), links: [...terms.closest('label, .register-terms')?.querySelectorAll('a') ?? []].map((a) => a.getAttribute('href')) } : null,
    buttons,
    welcome: q('.register-welcome') ? { rect: rect(q('.register-welcome')), text: q('.register-welcome').textContent.trim().slice(0, 120), animated: !!q('.register-welcome svg') } : null,
    focus: active ? { tag: active.tagName, text: (active.getAttribute('aria-label') ?? active.textContent ?? '').trim().slice(0, 40), inDialog: dialog ? dialog.contains(active) : null } : null,
    liveText: [...scope.querySelectorAll('[aria-live], output, [role="status"]')].map((o) => o.textContent.trim().slice(0, 80)).filter(Boolean),
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

  // 1. Home: open the login dialog, press its הרשמה link.
  await page.goto(`${BASE}/?utm=ux24`, { waitUntil: 'load', timeout: 60000 })
  await page.waitForTimeout(800)
  const loginLink = page.locator('a[href="/login"], a[href^="/login?"]').first()
  await loginLink.click()
  await page.waitForTimeout(1200)
  w.loginDialog = await page.evaluate(shapeFn)
  const signupLink = page.locator('.login-dialog a[href^="/signup"]').first()
  w.signupLinkInDialog = (await signupLink.count())
    ? await signupLink.evaluate((a) => ({
        text: a.textContent.trim(),
        href: a.getAttribute('href'),
      }))
    : null
  if (w.signupLinkInDialog) {
    await signupLink.click()
    await page.waitForTimeout(1500)
    w.afterSignupPress = await page.evaluate(shapeFn)
    await page.screenshot({ path: `logs/ux24/${TAG}-${width}-after-press.png`, fullPage: false })
    if (w.afterSignupPress.dialog && !w.afterSignupPress.url.startsWith('/signup')) {
      // Walk step one forward with valid details: a second step with no request?
      const requests = []
      page.on('request', (r) => {
        if (r.method() === 'POST') requests.push(r.url())
      })
      await page.fill('.login-dialog input[name="full_name"]', 'דנה כהן')
      await page.fill('.login-dialog input[name="email"]', 'ux24-probe@example.com')
      await page.fill('.login-dialog input[name="password"]', 'probe1234')
      const nextBtn = page.locator('.login-dialog button', { hasText: 'המשך' }).first()
      if (await nextBtn.count()) {
        await nextBtn.click()
        await page.waitForTimeout(600)
        w.afterStepOne = await page.evaluate(shapeFn)
        w.afterStepOne.postRequests = requests.length
        await page.screenshot({ path: `logs/ux24/${TAG}-${width}-step2.png`, fullPage: false })
        // Back keeps what was typed.
        const backBtn = page.locator('.login-dialog button', { hasText: 'חזרה' }).first()
        if (await backBtn.count()) {
          await backBtn.click()
          await page.waitForTimeout(300)
          w.afterBack = {
            ...(await page.evaluate(shapeFn)),
            fullName: await page.inputValue('.login-dialog input[name="full_name"]'),
          }
          await nextBtn.click()
          await page.waitForTimeout(300)
        }
        // Submitting step two without the terms box: the native/our refusal.
        await page.fill('.login-dialog input[name="phone"]', '0501234567')
        const submit = page
          .locator('.login-dialog form button[type="submit"]', { hasText: /יצירת|הרשמה/ })
          .first()
        if (await submit.count()) {
          await submit.click()
          await page.waitForTimeout(500)
          w.afterSubmitWithoutTerms = {
            ...(await page.evaluate(shapeFn)),
            postRequests: requests.length,
          }
        }
      }
      await page.keyboard.press('Escape')
      await page.waitForTimeout(400)
      w.afterEscape = await page.evaluate(shapeFn)
    }
  }

  // 2. /signup itself.
  await page.goto(`${BASE}/signup`, { waitUntil: 'load', timeout: 60000 })
  await page.waitForTimeout(800)
  w.signupPage = await page.evaluate(shapeFn)
  await page.screenshot({ path: `logs/ux24/${TAG}-${width}-signup.png`, fullPage: true })
  w.errors = errors.splice(0)
  await ctx.close()
}

await browser.close()
writeFileSync(`logs/ux24/${TAG}.json`, JSON.stringify(out, null, 2))
console.log(`wrote logs/ux24/${TAG}.json`)
for (const [width, w] of Object.entries(out)) {
  console.log(
    width,
    'signup press ->',
    w.afterSignupPress?.url,
    'dialog:',
    !!w.afterSignupPress?.dialog,
    'stepper:',
    w.signupPage?.stepper?.steps?.map((s) => s.text) ?? null,
    'fields on /signup:',
    w.signupPage?.fields?.map((f) => f.id),
    'terms:',
    w.signupPage?.terms ? 'yes' : 'none',
    'errors:',
    w.errors.length,
  )
}
