/**
 * QA section 6 (/checkout) probe. Fills a cart through the real product pages,
 * then reads the checkout form back out of the rendered DOM.
 *
 * Guest run: no session, so no wallet and no saved cards. Those two rows are
 * measured by their ABSENCE here and are marked blocked in the checklist.
 */
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'
if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const c = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(c)) process.env.PLAYWRIGHT_BROWSERS_PATH = c
}
const BASE = process.env.LOCAL_BASE ?? 'http://localhost:3311'
const SLUGS = (process.env.SLUGS ?? 'demo-coupon-1,demo-physical-1').split(',')

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 2400 } })
const page = await ctx.newPage()
const log = (...a) => console.log(...a)

for (const slug of SLUGS) {
  await page.goto(`${BASE}/product/${slug}`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  const atc = page.locator('.pdp-buy__atc, button:has-text("הוספה לסל"), button:has-text("הוסף לסל")').first()
  await atc.waitFor({ state: 'visible', timeout: 20000 })
  await atc.click()
  await page.waitForTimeout(2500)
  log(`# added ${slug}`)
}

await page.goto(`${BASE}/cart`, { waitUntil: 'domcontentloaded', timeout: 90000 })
await page.waitForTimeout(1500)
log('# cart url:', page.url())

await page.goto(`${BASE}/checkout`, { waitUntil: 'domcontentloaded', timeout: 90000 })
await page.waitForTimeout(3000)
log('# checkout url:', page.url())

const snap = await page.evaluate(() => {
  const t = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : null)
  const dirOf = (el) => (el ? getComputedStyle(el).direction : null)
  const field = (name) => document.querySelector(`[name="${name}"]`)
  const items = [...document.querySelectorAll('.checkout-summary__item, .checkout-item, li')]
    .map(t)
    .filter((x) => x && /₪/.test(x))
    .slice(0, 12)
  const inputs = [...document.querySelectorAll('input')].map((el) => ({
    name: el.name || el.id || '?',
    type: el.type,
    required: el.required,
    checked: el.type === 'checkbox' ? el.checked : undefined,
    max: el.max || undefined,
    min: el.min || undefined,
    value: el.type === 'hidden' ? el.value : undefined,
    dir: dirOf(el),
  }))
  return {
    title: t(document.querySelector('h1')),
    bodyDir: dirOf(document.body),
    payButton: t(document.querySelector('button[type="submit"], .checkout-submit')),
    hasWalletField: Boolean(field('apply_wallet_ils')),
    hasTerms: Boolean(document.querySelector('[name="accept_terms"], #co-terms')),
    hasSaveCard: Boolean(document.querySelector('[name="save_card"], #co-save-card')),
    clientRef: field('client_ref')?.value ?? null,
    addressIdHidden: field('address_id')?.value ?? null,
    balanceCopy: [...document.querySelectorAll('*')]
      .filter((el) => el.children.length === 0 && /יתרה|באתר|בעסק/.test(el.textContent))
      .map(t)
      .slice(0, 8),
    items,
    inputs,
  }
})
log(JSON.stringify(snap, null, 2))

// client_ref must be a fresh UUID on every load.
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
const second = await page.evaluate(
  () => document.querySelector('[name="client_ref"]')?.value ?? null,
)
log('# client_ref second load:', second, '| differs:', second !== snap.clientRef)

await browser.close()
