/**
 * Interaction states, which a computed-style dump cannot contain.
 *
 * `refs/ke_live_computed.json` records every element at rest. A button's
 * hover, active and disabled appearance is not in the DOM at rest: it lives in
 * `:hover` / `:active` / `[disabled]` rules that only apply while the
 * pseudo-class matches. So the button token set cannot be derived from that
 * file, and inventing the three missing states is exactly what the brief
 * forbids.
 *
 * This script measures them the only way they can be measured: it drives a
 * real pointer onto each candidate button, reads the computed style while the
 * pointer is there, holds the mouse down and reads it again, and separately
 * reads any element that is genuinely disabled on the page.
 *
 * A state that cannot be measured is reported as `null` and is written into
 * the provenance table as UNMEASURED. It is never filled in with a guess.
 *
 * Writes refs/ke_live_states.json.
 *
 *   node scripts/measure-live-states.mjs
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

async function loadPlaywright() {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    resolve(here, '..'),
    resolve(here, '../../kenyonexpress'),
    resolve(homedir(), 'kenyonexpress-web/kenyonexpress'),
  ]
  for (const root of candidates) {
    if (!existsSync(resolve(root, 'node_modules/@playwright/test/package.json'))) continue
    const require = createRequire(pathToFileURL(resolve(root, 'noop.js')))
    const mod = await import(pathToFileURL(require.resolve('@playwright/test')).href)
    return mod.chromium ? mod : mod.default
  }
  throw new Error('@playwright/test not found; install it in the main checkout.')
}
const { chromium } = await loadPlaywright()

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache
}

const ORIGIN = 'https://kenyonexpress.co.il'
const ATC_ID = process.env.LIVE_ATC_ID ?? '6166'

/**
 * The button-shaped controls the live site actually paints, by the selector
 * WooCommerce and the Electro child theme give them. Each entry says which
 * page it can be found on, because the add-to-cart only exists on a product
 * page and the checkout button only exists with a cart line.
 */
const TARGETS = [
  { key: 'atc-product', page: `${ORIGIN}/product/מוצר-לדוגמא/`, selector: 'button.single_add_to_cart_button, .single_add_to_cart_button' },
  { key: 'atc-loop', page: `${ORIGIN}/shop/`, selector: 'a.add_to_cart_button' },
  { key: 'cart-checkout', page: `${ORIGIN}/cart/`, selector: '.checkout-button, a.checkout-button', seed: true },
  { key: 'cart-update', page: `${ORIGIN}/cart/`, selector: 'button[name="update_cart"], input[name="update_cart"]', seed: true },
  { key: 'coupon-apply', page: `${ORIGIN}/cart/`, selector: 'button[name="apply_coupon"], input[name="apply_coupon"]', seed: true },
  { key: 'place-order', page: `${ORIGIN}/checkout/`, selector: '#place_order', seed: true },
  { key: 'search-submit', page: `${ORIGIN}/`, selector: '.header-search-form button[type="submit"], form.search-form button[type="submit"], button.search-submit' },
  { key: 'newsletter-submit', page: `${ORIGIN}/`, selector: 'form input[type="submit"], .newsletter form button' },
  { key: 'login-submit', page: `${ORIGIN}/my-account/`, selector: 'button[name="login"], input[name="login"]' },
]

const PROPS = [
  'background-color',
  'color',
  'border-radius',
  'border-width',
  'border-color',
  'border-style',
  'box-shadow',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'letter-spacing',
  'text-transform',
  'padding',
  'margin',
  'width',
  'height',
  'min-height',
  'min-width',
  'opacity',
  'cursor',
  'transition',
]

/**
 * Self-contained on purpose. Playwright serialises this to a string and
 * evaluates it in the page, so it CANNOT close over anything in this module:
 * a `props` captured from the outer scope arrives as a ReferenceError in the
 * browser, not as a compile error here. Everything it needs comes in as the
 * second argument.
 */
const READ = (el, props) => {
  const shorthand = {
    'border-radius': ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'],
    'border-width': ['border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width'],
    'border-color': ['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'],
    'border-style': ['border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style'],
    padding: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
    margin: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
  }
  const collapse = (parts) => {
    const [t, r, b, l] = parts
    if (t === r && r === b && b === l) return t
    if (t === b && r === l) return `${t} ${r}`
    if (r === l) return `${t} ${r} ${b}`
    return `${t} ${r} ${b} ${l}`
  }
  const cs = getComputedStyle(el)
  const out = {}
  for (const p of props) {
    out[p] = shorthand[p]
      ? collapse(shorthand[p].map((k) => cs.getPropertyValue(k)))
      : cs.getPropertyValue(p)
  }
  const r = el.getBoundingClientRect()
  out.__rect = [r.x, r.y, r.width, r.height].map((n) => Math.round(n * 100) / 100)
  out.__disabled =
    el.disabled === true || el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true'
  out.__tag = el.tagName.toLowerCase()
  out.__class = typeof el.className === 'string' ? el.className : ''
  out.__text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40)
  return out
}

const widths = (process.argv.find((a) => a.startsWith('--widths='))?.slice(9) ?? '1440')
  .split(',')
  .map(Number)
  .filter(Boolean)

if (!existsSync('refs')) mkdirSync('refs', { recursive: true })

const browser = await chromium.launch()
const out = {
  meta: {
    origin: ORIGIN,
    capturedAt: new Date().toISOString(),
    widths,
    properties: PROPS,
    note:
      'rest/hover/active are the SAME element read three times: at rest, with a real ' +
      'pointer over it, and with the pointer held down. disabled is only present when ' +
      'the live page genuinely paints a disabled control. null means NOT MEASURED and ' +
      'must be recorded as UNMEASURED in the provenance table, never guessed.',
  },
  states: {},
}

for (const width of widths) {
  const context = await browser.newContext({ viewport: { width, height: 1400 }, deviceScaleFactor: 1 })

  if (TARGETS.some((t) => t.seed)) {
    const seeder = await context.newPage()
    try {
      await seeder.goto(`${ORIGIN}/?add-to-cart=${ATC_ID}&quantity=1`, { waitUntil: 'commit', timeout: 60000 })
      await seeder.waitForTimeout(3000)
      console.log(`[${width}] cart seeded`)
    } catch (e) {
      console.log(`[${width}] seed failed: ${String(e.message).split('\n')[0]}`)
    } finally {
      await seeder.close()
    }
  }

  for (const target of TARGETS) {
    const label = `${target.key}@${width}`
    const page = await context.newPage()
    try {
      await page.goto(target.page, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.waitForTimeout(2500)
      await page.evaluate(() => document.fonts?.ready).catch(() => {})

      const locator = page.locator(target.selector).first()
      const count = await page.locator(target.selector).count()
      if (count === 0) {
        console.log(`[${label}] absent (selector matched nothing)`)
        out.states[label] = { selector: target.selector, page: target.page, found: false }
        await page.close()
        continue
      }
      await locator.scrollIntoViewIfNeeded({ timeout: 10000 }).catch(() => {})
      await page.waitForTimeout(400)

      const read = async () => locator.evaluate(READ, PROPS)

      const rest = await read()
      await locator.hover({ timeout: 10000, force: true })
      await page.waitForTimeout(600) // live transitions run 0.15s-0.3s
      const hover = await read()

      let active = null
      try {
        const box = await locator.boundingBox()
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
          await page.mouse.down()
          await page.waitForTimeout(400)
          active = await read()
          await page.mouse.up()
        }
      } catch {
        active = null
      }

      // A disabled sibling, if the page paints one at all. Never synthesised:
      // setting the attribute ourselves would measure OUR disabled styling, not
      // live's, and the two are not the same thing.
      const disabled = await page
        .evaluate(
          ({ sel, readerSource, props }) => {
            // eslint-disable-next-line no-eval
            const reader = eval(`(${readerSource})`)
            const el = [...document.querySelectorAll(sel)].find(
              (n) =>
                n.disabled === true ||
                n.hasAttribute('disabled') ||
                n.getAttribute('aria-disabled') === 'true',
            )
            return el ? reader(el, props) : null
          },
          { sel: target.selector, readerSource: READ.toString(), props: PROPS },
        )
        .catch(() => null)

      out.states[label] = {
        selector: target.selector,
        page: target.page,
        found: true,
        matches: count,
        rest,
        hover,
        active,
        disabled,
      }
      const moved = ['background-color', 'color', 'border-radius', 'opacity'].filter(
        (p) => rest[p] !== hover[p],
      )
      console.log(
        `[${label}] rest bg ${rest['background-color']} / ink ${rest.color} / r ${rest['border-radius']} / h ${rest.__rect[3]}px` +
          (moved.length ? `  hover moves: ${moved.join(', ')}` : '  hover: no change'),
      )
    } catch (error) {
      console.log(`[${label}] FAILED: ${String(error.message).split('\n')[0]}`)
      out.states[label] = { selector: target.selector, page: target.page, found: false, error: String(error.message).split('\n')[0] }
    } finally {
      await page.close()
    }
  }
  await context.close()
}

await browser.close()
writeFileSync('refs/ke_live_states.json', JSON.stringify(out, null, 2))
console.log(`\nrefs/ke_live_states.json written (${Object.keys(out.states).length} targets)`)
