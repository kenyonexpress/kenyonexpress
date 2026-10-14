import { writeFileSync } from 'node:fs'
// UX17 probe: the checkout page at 380 / 768 / 1440 on a built server, with
// one real line in the basket. It reads what the page offers a guest: whether
// there is a step rail and which step is current, which sections and fields
// are visible with nothing clicked, what the street field is (a plain input
// or a combobox, and whether typing a prefix opens a list), what the payment
// block offers (the radios under `token_id`, their labels, a read-only method
// line), where the pay button sits and whether it is visible, and the
// continue / back controls. The same script runs before and after, so the two
// JSON files diff cleanly.
import { chromium } from '@playwright/test'

const BASE = process.env.BASE ?? 'http://localhost:3354'
const TAG = process.env.TAG ?? 'before'
const PRODUCT = process.env.PRODUCT ?? '/product/6253'
const WIDTHS = (process.env.WIDTHS ?? '380,768,1440').split(',').map(Number)

const browser = await chromium.launch()
const out = {}

// Consent decided through the cookie the server reads (`denied.2`, the
// serializeConsent form), so the banner never renders over the form.
const CONSENT = { name: 'ke_consent', value: 'denied.2', domain: 'localhost', path: '/' }

const rectFn = `(el) => {
  if (!el) return null
  const b = el.getBoundingClientRect()
  return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }
}`

for (const width of WIDTHS) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: 1,
    locale: 'he-IL',
    hasTouch: width < 768,
    // A fresh client IP per width for the cart's write limiter.
    extraHTTPHeaders: { 'x-forwarded-for': `10.17.${TAG === 'before' ? 1 : 2}.${width % 250}` },
  })
  await ctx.addCookies([CONSENT])
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.goto(`${BASE}${PRODUCT}`, { waitUntil: 'networkidle' })
  await page.locator('.pdp-buy__atc').first().click()
  await page
    .getByText(/נוסף לעגלה/)
    .first()
    .waitFor({ timeout: 15000 })
  await page.waitForTimeout(300)
  await page.goto(`${BASE}/checkout`, { waitUntil: 'networkidle' })
  const landed = page.url()

  const shape = await page.evaluate(`(() => {
    const rect = ${rectFn}
    const vis = (el) => Boolean(el && el.checkVisibility && el.checkVisibility())
    const q = (s) => document.querySelector(s)
    const qa = (s) => [...document.querySelectorAll(s)]
    const steps = q('.checkout-steps')
    return {
      stepRail: steps
        ? {
            rect: rect(steps),
            items: qa('.checkout-steps__item').map((li) => ({
              text: li.textContent.trim(),
              current: li.getAttribute('aria-current'),
              state: li.getAttribute('data-state'),
            })),
          }
        : null,
      sections: qa('.checkout-section').map((s) => ({
        label: s.getAttribute('aria-label'),
        step: s.getAttribute('data-step'),
        state: s.getAttribute('data-step-state'),
        hidden: s.hidden,
        visible: vis(s),
        rect: rect(s),
        fieldsVisible: [...s.querySelectorAll('input,select,textarea')].filter(vis).length,
      })),
      fields: {
        firstName: { visible: vis(q('#co-first-name')), rect: rect(q('#co-first-name')) },
        city: { visible: vis(q('#co-city')), role: q('#co-city')?.getAttribute('role') },
        street: {
          visible: vis(q('#co-street')),
          role: q('#co-street')?.getAttribute('role'),
          autocomplete: q('#co-street')?.getAttribute('aria-autocomplete'),
          rect: rect(q('#co-street')),
        },
      },
      payment: {
        methodRadios: qa('[name="token_id"]').map((r) => ({
          value: r.value,
          checked: r.checked,
          label: (r.closest('label') || document.querySelector('label[for="' + r.id + '"]'))?.textContent.trim() ?? null,
        })),
        readOnlyMethod: q('#co-pay-card') ? q('label[for="co-pay-card"]')?.textContent.trim() : null,
        selector: q('.checkout-methods') ? rect(q('.checkout-methods')) : null,
        optionCount: qa('.checkout-methods__option').length,
      },
      payButton: {
        visible: vis(q('.checkout-pay-btn')),
        rect: rect(q('.checkout-pay-btn')),
        text: q('.checkout-pay-btn')?.textContent.trim(),
        inAside: Boolean(q('aside .checkout-pay-btn')),
      },
      nav: {
        next: qa('.checkout-nav__next').filter(vis).map((b) => b.textContent.trim()),
        back: qa('.checkout-nav__back').filter(vis).map((b) => b.textContent.trim()),
      },
      aside: rect(q('aside')),
      pageHeight: document.documentElement.scrollHeight,
      scrollWidth: document.documentElement.scrollWidth,
    }
  })()`)

  // The street field under typing: does a list open, what is in it.
  let streetTyping = null
  const street = page.locator('#co-street')
  if (await street.count()) {
    // Reach the address step when there is one: fill details and continue.
    const next = page.locator('.checkout-nav__next').first()
    if ((await next.count()) && !(await street.isVisible())) {
      await page.fill('#co-first-name', 'אופיר')
      await page.fill('#co-last-name', 'בדיקה')
      await page.fill('#co-phone', '0501234567')
      await page.fill('#co-email', 'qa@example.com')
      await next.click()
      await street.waitFor({ state: 'visible' })
    }
    await page.fill('#co-city', 'תל אביב')
    await street.click()
    // The answer travels debounce -> rate-limit RPC -> registry; wait for
    // it rather than for a fixed 900ms, which the first run showed is short.
    const answered = page
      .waitForResponse((r) => r.url().includes('/api/checkout/streets'), { timeout: 10000 })
      .catch(() => null)
    await street.pressSequentially('דיז', { delay: 40 })
    await answered
    await page.waitForTimeout(400)
    streetTyping = await page.evaluate(`(() => {
      const input = document.querySelector('#co-street')
      const listId = input?.getAttribute('aria-controls')
      const list = listId ? document.getElementById(listId) : null
      return {
        expanded: input?.getAttribute('aria-expanded') ?? null,
        options: list ? [...list.querySelectorAll('[role="option"]')].map((o) => o.textContent.trim()) : null,
        status: document.querySelector('.checkout-combobox__status')?.textContent.trim() ?? null,
      }
    })()`)
  }

  await page.screenshot({ path: `logs/ux17/${TAG}-${width}.png`, fullPage: true })
  out[width] = { landed, ...shape, streetTyping, errors }
  await ctx.close()
}

await browser.close()
writeFileSync(`logs/ux17/${TAG}.json`, `${JSON.stringify(out, null, 2)}\n`)
console.log(JSON.stringify(out, null, 2))
