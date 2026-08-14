import { writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

// Measures electro.madrasthemes.com with real computed styles and writes
// one markdown file per topic into ~/Downloads:
//   measurements-footer.md            footer columns, padding, fonts, colors
//   measurements-product-card.md      card dims, hover, shadow, transition
//   measurements-cart-page.md         cart table, buttons, totals
//   measurements-checkout-page.md     form fields, widths, error styles
//   measurements-category-sidebar.md  filters, price widget, spacing
//   measurements-header-mobile.md     390px viewport header + menu
//
// Desktop only (Cloudflare challenge blocks headless / datacenter traffic):
//   node scripts/measure-electro-deep.mjs

const BASE = 'https://electro.madrasthemes.com'
const OUT = join(homedir(), 'Downloads')

const PROPS = [
  'width',
  'height',
  'max-width',
  'min-height',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'gap',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'letter-spacing',
  'text-transform',
  'color',
  'background-color',
  'border',
  'border-top',
  'border-bottom',
  'border-radius',
  'box-shadow',
  'transition',
  'display',
  'flex-direction',
  'justify-content',
  'align-items',
]

const browser = await chromium.launch({
  headless: false,
  args: ['--disable-blink-features=AutomationControlled'],
})

async function newPage(width = 1440, height = 2400) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    locale: 'en-US',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  })
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })
  return ctx.newPage()
}

async function open(page, url) {
  console.error(`→ ${url}`)
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  } catch {
    console.error('  goto timed out, continuing')
  }
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(1500)
    const ok = await page.evaluate(
      () => !!document.querySelector('#masthead, header.site-header, .site-content'),
    )
    if (ok) return true
  }
  console.error('  WARNING: challenge did not clear')
  return false
}

// Evaluated in the page: dump computed styles for a selector (or element).
const DUMP_FN = `(sel, props) => {
  const el = typeof sel === 'string' ? document.querySelector(sel) : sel
  if (!el) return null
  const cs = getComputedStyle(el)
  const r = el.getBoundingClientRect()
  const out = { _rect: Math.round(r.width) + ' x ' + Math.round(r.height) + ' px' }
  for (const p of props) {
    const v = cs.getPropertyValue(p)
    if (v && v !== 'normal' && v !== 'none' && v !== 'auto' && v !== 'rgba(0, 0, 0, 0)') out[p] = v
  }
  return out
}`

async function dump(page, sel) {
  return page.evaluate(`(${DUMP_FN})(${JSON.stringify(sel)}, ${JSON.stringify(PROPS)})`)
}

function md(title, rows) {
  const lines = [
    `# ${title}`,
    '',
    `Source: ${BASE} (electro home-v7 demo), measured ${new Date().toISOString().slice(0, 10)} via headed Chrome computed styles.`,
    '',
  ]
  for (const [label, o] of rows) {
    lines.push(`## ${label}`, '')
    if (!o) {
      lines.push('_not found_', '')
      continue
    }
    lines.push('| property | value |', '|---|---|')
    for (const [k, v] of Object.entries(o)) lines.push(`| ${k === '_rect' ? 'rect' : k} | ${v} |`)
    lines.push('')
  }
  return lines.join('\n')
}

function save(name, content) {
  const p = join(OUT, name)
  writeFileSync(p, content)
  console.error(`✓ ${p}`)
}

// ---------- 1. footer + 2. product card (home-v7, 1440px) ----------
{
  const page = await newPage()
  await open(page, `${BASE}/home-v7/`)
  await page.waitForTimeout(3000)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(1500)

  const footerRows = []
  for (const [label, sel] of [
    ['footer root', 'footer.site-footer, #colophon, footer'],
    ['widgets area', '.footer-widgets'],
    ['single column', '.footer-widgets [class*="col-"]'],
    ['widget title', '.footer-widgets .widget-title, footer .widget-title'],
    ['widget link', '.footer-widgets a, footer .widget a'],
    ['body text', '.footer-widgets p, footer .widget p, footer address'],
    ['newsletter block', '.footer-newsletter, footer .newsletter'],
    ['bottom bar', '.copyright-bar, .site-info, .footer-bottom'],
    ['payment icons row', '.footer-payment, .payment-methods'],
  ])
    footerRows.push([label, await dump(page, sel)])
  const colCount = await page.evaluate(
    () => document.querySelectorAll('.footer-widgets [class*="col-"]').length,
  )
  save(
    'measurements-footer.md',
    `${md('Footer (home-v7, 1440px)', footerRows)}\ncolumn count: ${colCount}\n`,
  )

  // product card + real hover state
  await page.evaluate(() => window.scrollTo(0, 900))
  await page.waitForTimeout(800)
  const cardSel = 'li.product, .product.type-product, .product-item'
  const cardRows = [
    ['card', await dump(page, cardSel)],
    ['image', await dump(page, `${cardSel} img`)],
    ['title', await dump(page, '.woocommerce-loop-product__title, li.product h2, li.product h3')],
    ['price', await dump(page, 'li.product .price, .product .amount')],
    ['add-to-cart button', await dump(page, 'li.product .add_to_cart_button, li.product .button')],
  ]
  try {
    await page.hover(cardSel, { timeout: 5000 })
    await page.waitForTimeout(600)
    cardRows.push(['card :hover (after 600ms)', await dump(page, cardSel)])
    cardRows.push([
      'button :hover state',
      await dump(page, 'li.product .add_to_cart_button, li.product .button'),
    ])
  } catch {
    cardRows.push(['card :hover', null])
  }
  save('measurements-product-card.md', md('Product card (home-v7, 1440px)', cardRows))

  // ---------- 3. cart: add a product first, then measure ----------
  try {
    await page.click('li.product .add_to_cart_button', { timeout: 8000 })
    await page.waitForTimeout(2500)
  } catch {
    console.error('  add-to-cart click failed, cart may be empty')
  }
  await open(page, `${BASE}/cart/`)
  await page.waitForTimeout(2000)
  const cartRows = []
  for (const [label, sel] of [
    ['page container', '.woocommerce, .site-content .container'],
    ['cart table', 'table.shop_table.cart, table.cart'],
    ['table header cell', 'table.cart th'],
    ['table row', 'table.cart tbody tr.cart_item'],
    ['product thumbnail', 'table.cart .product-thumbnail img'],
    ['product name link', 'table.cart .product-name a'],
    ['quantity input', 'table.cart .qty, input.qty'],
    ['remove (x) link', 'table.cart .product-remove a, a.remove'],
    ['coupon input', '#coupon_code'],
    ['apply coupon button', 'button[name="apply_coupon"]'],
    ['update cart button', 'button[name="update_cart"]'],
    ['totals box', '.cart_totals'],
    ['totals heading', '.cart_totals h2'],
    ['totals table row', '.cart_totals table tr'],
    ['checkout button', '.checkout-button, a.checkout-button'],
  ])
    cartRows.push([label, await dump(page, sel)])
  save('measurements-cart-page.md', md('Cart page (1440px)', cartRows))

  // ---------- 4. checkout: fields, widths, then trigger errors ----------
  await open(page, `${BASE}/checkout/`)
  await page.waitForTimeout(2000)
  const coRows = []
  for (const [label, sel] of [
    ['form wrapper', 'form.checkout, .woocommerce-checkout'],
    ['billing column', '.col2-set .col-1, #customer_details .col-1'],
    ['order review column', '#order_review, .col2-set .col-2'],
    ['field row', '.form-row'],
    ['label', '.form-row label'],
    ['text input', '.form-row input.input-text, #billing_first_name'],
    ['select / dropdown', '.form-row select, .select2-selection'],
    ['textarea', '#order_comments'],
    ['order table', 'table.shop_table.woocommerce-checkout-review-order-table'],
    ['place order button', '#place_order'],
  ])
    coRows.push([label, await dump(page, sel)])
  try {
    await page.click('#place_order', { timeout: 8000 })
    await page.waitForTimeout(3500)
    coRows.push([
      'error banner',
      await dump(page, '.woocommerce-error, .woocommerce-NoticeGroup .woocommerce-error'),
    ])
    coRows.push(['error list item', await dump(page, '.woocommerce-error li')])
    coRows.push(['invalid field row', await dump(page, '.form-row.woocommerce-invalid input')])
  } catch {
    coRows.push(['error states', null])
  }
  save('measurements-checkout-page.md', md('Checkout page (1440px)', coRows))

  // ---------- 5. category sidebar (shop page) ----------
  await open(page, `${BASE}/shop/`)
  await page.waitForTimeout(2000)
  const sbRows = []
  for (const [label, sel] of [
    ['sidebar container', '#secondary, .widget-area, .shop-sidebar'],
    ['widget block', '#secondary .widget'],
    ['widget title', '#secondary .widget-title'],
    ['filter list item', '#secondary .widget li'],
    ['filter link', '#secondary .widget li a'],
    ['item count badge', '#secondary .widget li .count'],
    ['price filter widget', '.widget_price_filter'],
    ['price slider bar', '.price_slider, .ui-slider'],
    ['price slider handle', '.ui-slider-handle'],
    ['price slider range', '.ui-slider-range'],
    ['price filter button', '.price_slider_amount .button'],
    ['price label', '.price_slider_amount .price_label'],
  ])
    sbRows.push([label, await dump(page, sel)])
  const widgetGap = await page.evaluate(() => {
    const ws = document.querySelectorAll('#secondary .widget')
    if (ws.length < 2) return null
    const a = ws[0].getBoundingClientRect()
    const b = ws[1].getBoundingClientRect()
    return `${Math.round(b.top - a.bottom)}px`
  })
  save(
    'measurements-category-sidebar.md',
    `${md('Category sidebar (shop, 1440px)', sbRows)}\ngap between widgets: ${widgetGap}\n`,
  )
  await page.close()
}

// ---------- 6. mobile header @ 390px ----------
{
  const page = await newPage(390, 844)
  await open(page, `${BASE}/home-v7/`)
  await page.waitForTimeout(3000)
  const mRows = []
  for (const [label, sel] of [
    ['header (mobile)', '.handheld-header, header.site-header'],
    ['header inner row', '.handheld-header .container, header .container'],
    ['logo', '.site-branding, .header-logo, .custom-logo-link'],
    [
      'hamburger toggle',
      '.navbar-toggler, .menu-toggle, .handheld-header .off-canvas-navigation-wrapper button',
    ],
    ['search toggle / bar', '.handheld-header .search, .header-search'],
    ['cart icon block', '.handheld-header .cart, .site-header-cart'],
  ])
    mRows.push([label, await dump(page, sel)])
  try {
    await page.click('.navbar-toggler, .menu-toggle', { timeout: 6000 })
    await page.waitForTimeout(1200)
    for (const [label, sel] of [
      ['open menu panel', '.off-canvas-navigation, .mobile-navigation, .handheld-navigation'],
      ['menu item', '.off-canvas-navigation li, .handheld-navigation li'],
      ['menu link', '.off-canvas-navigation a, .handheld-navigation a'],
      ['submenu expander', '.dropdown-toggle, .off-canvas-navigation .expand'],
    ])
      mRows.push([label, await dump(page, sel)])
  } catch {
    mRows.push(['open menu', null])
  }
  save('measurements-header-mobile.md', md('Header mobile (390px)', mRows))
  await page.close()
}

await browser.close()
console.error('Done. 6 files in ~/Downloads')
