import { writeFileSync } from 'node:fs'
// UX16 probe: the shopping cart page at 380 / 768 / 1440 on a built server,
// with one real line in the basket. It reads what the page offers a shopper
// once something is in the cart: the item card (thumbnail, name, unit price,
// line total, meta line), the quantity controls (the two steppers, the typed
// field, their sizes and the hint at the ceiling), what happens to the row when
// it is removed (does it leave in one frame or animate out: the attribute, the
// computed animation name, and whether the node is still in the DOM a few
// frames later), and the totals breakdown (every row of the summary <dl>, the
// total, the savings and the live region). The same script runs before and
// after, so the two JSON files diff cleanly.
import { chromium } from '@playwright/test'
const BASE = process.env.BASE ?? 'http://localhost:3352'
const TAG = process.env.TAG ?? 'before'
const PRODUCT = process.env.PRODUCT ?? '/product/6253'
const WIDTHS = (process.env.WIDTHS ?? '380,768,1440').split(',').map(Number)
const browser = await chromium.launch()
const out = {}
// Consent decided through the cookie the server reads (`denied.2`, the
// serializeConsent form), so the banner never renders over the buy row.
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
  })
  await ctx.addCookies([CONSENT])
  const page = await ctx.newPage()
  // Put one line in the basket through the product page, like a shopper.
  await page.goto(`${BASE}${PRODUCT}`, { waitUntil: 'networkidle' })
  const atc = page.locator('.pdp-buy__atc').first()
  await atc.click()
  // The badge moves optimistically, so a navigation on the badge alone cancels
  // the write mid-flight and the cart page opens empty. The toast is the
  // server's answer; wait for that.
  await page
    .getByText(/נוסף לעגלה/)
    .first()
    .waitFor({ timeout: 15000 })
    .catch(() => null)
  await page.waitForTimeout(300)
  await page.goto(`${BASE}/cart`, { waitUntil: 'networkidle' })
  await page
    .locator('.cart-line')
    .first()
    .waitFor({ timeout: 15000 })
    .catch(() => null)
  await page.waitForTimeout(400)
  const atRest = await page.evaluate(
    ([rectSrc]) => {
      const rect = new Function(`return ${rectSrc}`)()
      const line = document.querySelector('.cart-line')
      const q = (sel, root = document) => root.querySelector(sel)
      const text = (el) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? null
      const sidebar = q('.cart-sidebar')
      const rows = sidebar
        ? [...sidebar.querySelectorAll('.cart-sidebar__rows > *')].map((r) => ({
            cls: r.className,
            dt: text(r.querySelector('dt')),
            dd: text(r.querySelector('dd')),
          }))
        : []
      const total = q('.cart-sidebar__total')
      const btns = line
        ? [...line.querySelectorAll('button')].map((b) => ({
            label: b.getAttribute('aria-label'),
            text: text(b),
            rect: rect(b),
            disabled: b.disabled,
            describedby: b.getAttribute('aria-describedby'),
          }))
        : []
      const qtyInput = line ? q('.cart-line__qty-value', line) : null
      return {
        lines: document.querySelectorAll('.cart-line').length,
        line: line
          ? {
              rect: rect(line),
              display: getComputedStyle(line).display,
              ariaBusy: line.getAttribute('aria-busy'),
              dataAttrs: [...line.attributes]
                .filter((a) => a.name.startsWith('data-'))
                .map((a) => a.name),
              thumb: rect(q('.cart-line__thumb', line)),
              thumbDisplay: q('.cart-line__thumb', line)
                ? getComputedStyle(q('.cart-line__thumb', line)).display
                : null,
              name: text(q('.cart-line__name', line)),
              unitRow: q('.cart-line__unit', line)
                ? {
                    display: getComputedStyle(q('.cart-line__unit', line)).display,
                    text: text(q('.cart-line__unit', line)),
                  }
                : null,
              meta: q('.cart-line__meta', line)
                ? {
                    display: getComputedStyle(q('.cart-line__meta', line)).display,
                    text: text(q('.cart-line__meta', line)),
                  }
                : null,
              price: text(q('.cart-line__price', line)),
              priceRect: rect(q('.cart-line__price', line)),
              qty: qtyInput
                ? {
                    value: qtyInput.value,
                    min: qtyInput.min,
                    max: qtyInput.max,
                    inputMode: qtyInput.getAttribute('inputmode'),
                    rect: rect(qtyInput),
                    pill: rect(q('.cart-line__qty', line)),
                  }
                : null,
              qtyHint: text(q('.cart-line__qty-hint', line)),
              liveRegions: [...line.querySelectorAll('[aria-live], output')].map((el) => ({
                tag: el.tagName.toLowerCase(),
                live: el.getAttribute('aria-live'),
                text: text(el),
              })),
              buttons: btns,
            }
          : null,
        sidebar: sidebar
          ? {
              rect: rect(sidebar),
              rows,
              total: total
                ? {
                    text: text(total),
                    live:
                      total.getAttribute('aria-live') ??
                      q('[aria-live]', total)?.getAttribute('aria-live') ??
                      null,
                    rect: rect(total),
                  }
                : null,
              savings: text(q('[data-testid="cart-savings-row"]')),
              grand: text(q('[data-testid="cart-grand-total"]')),
              vatNote: text(q('.cart-sidebar__vat')),
              breakdown: q('.cart-sidebar__breakdown')
                ? {
                    tag: q('.cart-sidebar__breakdown').tagName.toLowerCase(),
                    text: text(q('.cart-sidebar__breakdown')).slice(0, 200),
                  }
                : null,
            }
          : null,
        checkout: text(q('.cart-checkout-btn')),
      }
    },
    [rectFn],
  )
  await page.screenshot({ path: `logs/ux16/${TAG}-${width}.png`, fullPage: true })
  // Press plus once: what does the total do, and is anything announced?
  const plus = page.locator('.cart-line').first().getByRole('button', { name: 'הוסף כמות' })
  const totalBefore = await page.locator('.cart-sidebar__total strong').textContent()
  await plus.click()
  await page
    .waitForFunction(
      (prev) => document.querySelector('.cart-sidebar__total strong')?.textContent !== prev,
      totalBefore,
      { timeout: 10000 },
    )
    .catch(() => null)
  await page.waitForTimeout(300)
  const afterPlus = await page.evaluate(() => {
    const text = (el) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? null
    const price = document.querySelector('.cart-line__price')
    const total = document.querySelector('.cart-sidebar__total strong')
    return {
      qty: document.querySelector('.cart-line__qty-value')?.value ?? null,
      linePrice: text(price),
      priceAnimation: price ? getComputedStyle(price).animationName : null,
      total: text(total),
      totalAnimation: total ? getComputedStyle(total).animationName : null,
      announced: [...document.querySelectorAll('.cart-line [aria-live], .cart-line output')]
        .map((el) => text(el))
        .filter(Boolean),
      itemsRow: text(document.querySelector('.cart-sidebar__row dt')),
    }
  })
  // Remove the line: one frame or an exit?
  const remove = page
    .locator('.cart-line')
    .first()
    .getByRole('button', { name: /^הסר .* מהעגלה$/ })
  await remove.click()
  await page.waitForTimeout(60)
  const midRemove = await page.evaluate(() => {
    const line = document.querySelector('.cart-line')
    if (!line) return { present: false }
    const cs = getComputedStyle(line)
    return {
      present: true,
      leaving: line.getAttribute('data-leaving'),
      animationName: cs.animationName,
      animationDuration: cs.animationDuration,
      opacity: cs.opacity,
      maxHeight: cs.maxHeight,
      controlsDisabled: [...line.querySelectorAll('button')].every((b) => b.disabled),
    }
  })
  await page
    .waitForFunction(() => !document.querySelector('.cart-line'), null, { timeout: 10000 })
    .catch(() => null)
  const afterRemove = await page.evaluate(() => {
    const text = (el) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? null
    return {
      lines: document.querySelectorAll('.cart-line').length,
      empty: text(document.querySelector('.cart-empty')),
      toast: text(document.querySelector('[role="status"], [data-sonner-toast]')),
    }
  })
  await page.screenshot({ path: `logs/ux16/${TAG}-removed-${width}.png` })
  out[width] = { product: PRODUCT, atRest, afterPlus, midRemove, afterRemove }
  await ctx.close()
}
await browser.close()
writeFileSync(`logs/ux16/${TAG}.json`, `${JSON.stringify(out, null, 2)}\n`)
console.log(JSON.stringify(out, null, 2))
