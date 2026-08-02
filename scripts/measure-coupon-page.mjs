#!/usr/bin/env node
/**
 * Measure computed styles on a LIVE coupon product page.
 * Writes docs/coupon-page-measured.md as selector | property | value.
 *
 * Usage:
 *   node scripts/measure-coupon-page.mjs
 *   COUPON_URL=https://kenyonexpress.co.il/product/... node scripts/measure-coupon-page.mjs
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(__dirname, '..', 'docs', 'coupon-page-measured.md')
const VIEWPORT = { width: 1440, height: 900 }

const CANDIDATES = [
  process.env.COUPON_URL,
  'https://kenyonexpress.co.il/product/ארוחת-בוקר-זוגית-בקפה-קפה/',
  'https://kenyonexpress.co.il/product/פינוק-גלידה/',
  'https://kenyonexpress.co.il/product/קופון-טסט/',
  'https://kenyonexpress.co.il/product/עוזרת-אישית-שירותי-משרד/',
].filter(Boolean)

const STYLE_PROPS = [
  'display',
  'position',
  'box-sizing',
  'width',
  'height',
  'max-width',
  'min-height',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'gap',
  'row-gap',
  'column-gap',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'line-height',
  'letter-spacing',
  'text-align',
  'text-decoration',
  'text-transform',
  'color',
  'background-color',
  'background-image',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-top-style',
  'border-right-style',
  'border-bottom-style',
  'border-left-style',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'border-radius',
  'box-shadow',
  'opacity',
  'overflow',
  'flex-direction',
  'justify-content',
  'align-items',
  'grid-template-columns',
]

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 })

let url = null
for (const candidate of CANDIDATES) {
  const res = await page
    .goto(candidate, { waitUntil: 'domcontentloaded', timeout: 90000 })
    .catch(() => null)
  if (!res || !res.ok()) continue
  await page.waitForTimeout(2500)
  const ok = await page.evaluate(() => {
    const t = document.body.innerText
    return /קופון|בבית העסק|לתשלום|יתרה|שובר|מימוש|ספק|מוכר|Vendor|vendor|wcfm/i.test(t)
  })
  if (
    ok ||
    candidate.includes('קפה') ||
    candidate.includes('גלידה') ||
    candidate.includes('קופון')
  ) {
    url = page.url()
    break
  }
}

if (!url) {
  // Fallback: open homepage, pick first product with coupon signals.
  await page.goto('https://kenyonexpress.co.il/', { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForTimeout(2000)
  const links = await page.evaluate(() =>
    [...document.querySelectorAll('a[href*="/product/"]')].map((a) => a.href),
  )
  for (const link of [...new Set(links)].slice(0, 25)) {
    await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {})
    await page.waitForTimeout(1000)
    const hit = await page.evaluate(() =>
      /קופון|בבית העסק|לתשלום באתר|יתרה|שובר/.test(document.body.innerText),
    )
    if (hit) {
      url = page.url()
      break
    }
  }
}

if (!url) {
  console.error('No coupon product found')
  process.exit(1)
}

await page.waitForTimeout(1500)

const dump = await page.evaluate(
  ({ styleProps }) => {
    function pathOf(el) {
      if (!el || el.nodeType !== 1) return ''
      if (el.id) return `#${CSS.escape(el.id)}`
      const parts = []
      let node = el
      while (node && node.nodeType === 1 && node.tagName.toLowerCase() !== 'html') {
        let part = node.tagName.toLowerCase()
        if (node.classList?.length) {
          const cls = [...node.classList]
            .filter((c) => c && !c.startsWith('sf-') && c.length < 60)
            .slice(0, 3)
          if (cls.length) part += `.${cls.map((c) => CSS.escape(c)).join('.')}`
        }
        const parent = node.parentElement
        if (parent) {
          const siblings = [...parent.children].filter((c) => c.tagName === node.tagName)
          if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`
        }
        parts.unshift(part)
        if (node.id || parts.length >= 7) break
        node = parent
      }
      return parts.join(' > ')
    }

    function measure(el, label) {
      if (!el) return null
      const cs = getComputedStyle(el)
      const rect = el.getBoundingClientRect()
      const styles = {}
      for (const prop of styleProps) styles[prop] = cs.getPropertyValue(prop)
      styles['--rect-width'] = `${Math.round(rect.width * 100) / 100}px`
      styles['--rect-height'] = `${Math.round(rect.height * 100) / 100}px`
      styles['--rect-top'] = `${Math.round(rect.top * 100) / 100}px`
      styles['--rect-left'] = `${Math.round(rect.left * 100) / 100}px`
      styles['--text'] = (el.innerText || el.textContent || '')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 160)
      styles['--tag'] = el.tagName.toLowerCase()
      styles['--label'] = label
      return { selector: pathOf(el), styles }
    }

    const pick = (sels) => {
      for (const s of sels) {
        const el = document.querySelector(s)
        if (el) return el
      }
      return null
    }

    const targets = []

    const add = (label, el) => {
      const m = measure(el, label)
      if (m) targets.push(m)
    }

    // Page shell / product root
    add(
      'product-root',
      pick(['div.product', '.single-product .product', 'main .product', '#product-']),
    )
    add('summary', pick(['.summary.entry-summary', '.summary', '.product .summary']))
    add('gallery', pick(['.woocommerce-product-gallery', '.product-gallery', '.images']))
    add(
      'gallery-main-img',
      pick([
        '.woocommerce-product-gallery__image img',
        '.woocommerce-product-gallery img',
        '.product-gallery img',
      ]),
    )
    add('title', pick(['h1.product_title', '.product_title', 'h1.entry-title', 'main h1', 'h1']))
    add(
      'breadcrumb',
      pick(['.woocommerce-breadcrumb', 'nav.woocommerce-breadcrumb', '.breadcrumb']),
    )

    // Price block (site price / strike)
    add('price-block', pick(['.summary .price', 'p.price', '.product .price', '.price']))
    add(
      'price-ins',
      pick(['.summary .price ins', '.summary .price .woocommerce-Price-amount', 'p.price ins']),
    )
    add('price-del', pick(['.summary .price del', 'p.price del']))
    add(
      'price-amount-current',
      pick([
        '.summary .price ins .woocommerce-Price-amount',
        '.summary .price > .woocommerce-Price-amount',
        'p.price .woocommerce-Price-amount',
      ]),
    )
    add(
      'price-amount-strike',
      pick([
        '.summary .price del .woocommerce-Price-amount',
        'p.price del .woocommerce-Price-amount',
      ]),
    )
    add(
      'price-currency',
      pick([
        '.summary .price .woocommerce-Price-currencySymbol',
        '.price .woocommerce-Price-currencySymbol',
      ]),
    )

    // Custom dual-price wrappers seen on live cards / PDP
    const customPriceRoots = [
      ...document.querySelectorAll(
        '.custom-price-wrapper, .full-price, .discount-price, [class*="custom-price"], [class*="balance"], [class*="pay-now"], [class*="at-business"]',
      ),
    ]
    for (const [i, el] of customPriceRoots.slice(0, 12).entries()) {
      add(`custom-price-${i}`, el)
    }

    // Text nodes that mention site vs business payment
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT)
    const keywordEls = []
    while (walker.nextNode()) {
      const el = walker.currentNode
      if (el.children.length > 8) continue
      const t = (el.innerText || '').trim()
      if (!t || t.length > 120) continue
      if (/באתר|בבית העסק|יתרה|לתשלום|קופון|שובר|מימוש|ספק|מוכר|Vendor|Sold by|נמכר/i.test(t)) {
        keywordEls.push(el)
      }
    }
    // Prefer deepest unique nodes
    const uniqueKeyword = []
    for (const el of keywordEls) {
      if (!keywordEls.some((other) => other !== el && el.contains(other))) uniqueKeyword.push(el)
    }
    for (const [i, el] of uniqueKeyword.slice(0, 30).entries()) {
      add(`keyword-block-${i}`, el)
    }

    // Supplier / vendor block
    const supplierRoots = [
      ...document.querySelectorAll(
        [
          '.wcfmmp-product-policies',
          '.wcfmmp-store-info',
          '.vendor-info',
          '.product-vendor',
          '.sold-by',
          '.sold_by',
          '.wcfm_ele_wrapper',
          '[class*="vendor"]',
          '[class*="supplier"]',
          '[class*="store-info"]',
          '.product_meta',
          '.dokan-store',
        ].join(','),
      ),
    ]
    for (const [i, el] of supplierRoots.slice(0, 20).entries()) {
      add(`supplier-${i}`, el)
      for (const child of [
        ...el.querySelectorAll('a, span, p, div, img, h2, h3, h4, strong'),
      ].slice(0, 12)) {
        add(`supplier-${i}-child`, child)
      }
    }

    // Buy box / cart form
    add('cart-form', pick(['form.cart', '.summary form.cart', 'form.variations_form']))
    add(
      'qty-input',
      pick(['form.cart input.qty', 'input.qty', 'form.cart .quantity input', '.quantity input']),
    )
    add('qty-wrap', pick(['form.cart .quantity', '.quantity']))
    add(
      'add-to-cart',
      pick([
        'form.cart .single_add_to_cart_button',
        '.single_add_to_cart_button',
        'button[name="add-to-cart"]',
        'form.cart button.button',
      ]),
    )

    // Meta / SKU / categories
    add('product-meta', pick(['.product_meta', '.summary .product_meta']))
    for (const [i, el] of [
      ...document.querySelectorAll('.product_meta > span, .product_meta > div'),
    ].entries()) {
      add(`product-meta-row-${i}`, el)
    }

    // Tabs / description
    add('tabs', pick(['.woocommerce-tabs', '.wc-tabs-wrapper', '.product-tabs']))
    add(
      'description',
      pick(['#tab-description', '.woocommerce-Tabs-panel--description', '.product-description']),
    )
    add(
      'short-description',
      pick(['.woocommerce-product-details__short-description', '.product-short-description']),
    )

    // Related
    add('related', pick(['.related.products', 'section.related']))
    add(
      'related-heading',
      pick(['.related.products > h2', '.related.products h2', 'section.related h2']),
    )

    // Any element with class containing coupon
    for (const [i, el] of [
      ...document.querySelectorAll('[class*="coupon"], [class*="voucher"], [class*="redeem"]'),
    ]
      .slice(0, 15)
      .entries()) {
      add(`coupon-class-${i}`, el)
    }

    // Deduplicate by selector+label
    const seen = new Set()
    const rows = []
    for (const t of targets) {
      const key = `${t.styles['--label']}::${t.selector}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push(t)
    }

    return {
      title: document.title,
      h1: document.querySelector('h1')?.textContent?.trim() || '',
      url: location.href,
      bodySnippet: document.body.innerText.slice(0, 2500),
      rows,
    }
  },
  { styleProps: STYLE_PROPS },
)

await browser.close()

mkdirSync(dirname(OUT), { recursive: true })

const lines = []
lines.push('# Coupon product page: measured computed styles')
lines.push('')
lines.push(`Source URL: ${dump.url}`)
lines.push('')
lines.push(`Page title: ${dump.h1 || dump.title}`)
lines.push('')
lines.push(`Viewport: ${VIEWPORT.width}x${VIEWPORT.height}`)
lines.push('')
lines.push(`Captured: ${new Date().toISOString().slice(0, 10)}`)
lines.push('')
lines.push('Values from `getComputedStyle` plus `getBoundingClientRect` (`--rect-*`).')
lines.push('`--text` is the visible text snippet of the node (not a CSS property).')
lines.push('')
lines.push('## Measurements')
lines.push('')
lines.push('| selector | property | value |')
lines.push('| --- | --- | --- |')

for (const row of dump.rows) {
  const sel = row.selector.replace(/\|/g, '\\|')
  // Always emit label as a pseudo property first
  lines.push(`| \`${sel}\` | label | ${row.styles['--label']} |`)
  for (const [prop, value] of Object.entries(row.styles)) {
    if (prop === '--label') continue
    const v = String(value ?? '')
      .replace(/\|/g, '\\|')
      .replace(/\n/g, ' ')
    if (!v) continue
    // Skip noisy none/auto defaults that add no signal? User asked for all - keep key ones.
    // Skip empty/transparent noise lightly.
    if (prop.startsWith('border-') && (v === '0px' || v === 'none' || v === 'rgba(0, 0, 0, 0)'))
      continue
    if (prop === 'background-image' && v === 'none') continue
    if (prop === 'box-shadow' && v === 'none') continue
    if (prop === 'text-decoration' && v.includes('none solid')) continue
    if (prop === 'letter-spacing' && (v === 'normal' || v === '0px')) continue
    if (prop === 'text-transform' && v === 'none') continue
    if (prop === 'opacity' && v === '1') continue
    if (prop === 'overflow' && v === 'visible') continue
    if (
      (prop === 'gap' || prop === 'row-gap' || prop === 'column-gap') &&
      (v === 'normal' || v === '0px')
    )
      continue
    if (prop === 'grid-template-columns' && v === 'none') continue
    if (
      (prop === 'flex-direction' || prop === 'justify-content' || prop === 'align-items') &&
      v === 'normal'
    )
      continue
    if (prop === 'position' && v === 'static') continue
    lines.push(`| \`${sel}\` | ${prop} | ${v} |`)
  }
}

lines.push('')
lines.push('## Body text excerpt (for pricing / supplier copy)')
lines.push('')
lines.push('```')
lines.push(dump.bodySnippet.replace(/```/g, "'''"))
lines.push('```')
lines.push('')

writeFileSync(OUT, lines.join('\n'), 'utf8')
console.log(`Wrote ${OUT}`)
console.log(`URL: ${dump.url}`)
console.log(`Rows: ${dump.rows.length}`)
