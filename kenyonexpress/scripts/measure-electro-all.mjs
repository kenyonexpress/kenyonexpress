import { chromium } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

// Measures electro.madrasthemes.com with real computed styles and writes
// ten markdown files into ~/Downloads, one per topic:
//   measurements-cart-page.md         cart table, buttons, totals
//   measurements-checkout-page.md     form fields, widths, error states
//   measurements-product-gallery.md   product page images, thumbs, zoom
//   measurements-buttons.md           every button variant + hover
//   measurements-forms.md             fields, focus state, errors
//   measurements-modal.md             quick view modal
//   measurements-typography.md        heading hierarchy h1-h6, body, links
//   measurements-mobile-390.md        390px header + menu
//   measurements-account-pages.md     my-account login/register
//   measurements-spacing.md           vertical gaps between home sections
//
// Desktop only (Cloudflare challenge blocks headless / datacenter traffic):
//   node scripts/measure-electro-all.mjs

const BASE = 'https://electro.madrasthemes.com'
const OUT = join(homedir(), 'Downloads')

const PROPS = [
  'width', 'height', 'max-width', 'min-height',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'gap',
  'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-transform',
  'color', 'background-color', 'border', 'border-top', 'border-bottom', 'border-radius',
  'box-shadow', 'transition', 'outline', 'opacity', 'display', 'position', 'z-index',
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

async function dumpMany(page, pairs) {
  const rows = []
  for (const [label, sel] of pairs) rows.push([label, await dump(page, sel)])
  return rows
}

function md(title, rows, extra = '') {
  const lines = [`# ${title}`, '', `Source: ${BASE}, measured ${new Date().toISOString().slice(0, 10)}, headed Chrome computed styles.`, '']
  for (const [label, o] of rows) {
    lines.push(`## ${label}`, '')
    if (!o) { lines.push('_not found_', ''); continue }
    lines.push('| property | value |', '|---|---|')
    for (const [k, v] of Object.entries(o)) lines.push(`| ${k === '_rect' ? 'rect' : k} | ${v} |`)
    lines.push('')
  }
  return lines.join('\n') + extra
}

function save(name, content) {
  writeFileSync(join(OUT, name), content)
  console.error(`✓ ${join(OUT, name)}`)
}

const desktop = await newPage()

// ---------- 1+2. cart + checkout ----------
{
  await open(desktop, `${BASE}/home-v7/`)
  await desktop.waitForTimeout(3000)
  try {
    await desktop.click('li.product .add_to_cart_button', { timeout: 8000 })
    await desktop.waitForTimeout(2500)
  } catch { console.error('  add-to-cart failed, cart may be empty') }

  await open(desktop, `${BASE}/cart/`)
  await desktop.waitForTimeout(2000)
  save('measurements-cart-page.md', md('Cart page (1440px)', await dumpMany(desktop, [
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
  ])))

  await open(desktop, `${BASE}/checkout/`)
  await desktop.waitForTimeout(2000)
  const coRows = await dumpMany(desktop, [
    ['form wrapper', 'form.checkout, .woocommerce-checkout'],
    ['billing column', '.col2-set .col-1, #customer_details .col-1'],
    ['order review column', '#order_review, .col2-set .col-2'],
    ['field row', '.form-row'],
    ['label', '.form-row label'],
    ['text input', '.form-row input.input-text, #billing_first_name'],
    ['select / dropdown', '.form-row select, .select2-selection'],
    ['textarea', '#order_comments'],
    ['order table', 'table.woocommerce-checkout-review-order-table'],
    ['place order button', '#place_order'],
  ])
  try {
    await desktop.click('#place_order', { timeout: 8000 })
    await desktop.waitForTimeout(3500)
    coRows.push(['error banner', await dump(desktop, '.woocommerce-error')])
    coRows.push(['error list item', await dump(desktop, '.woocommerce-error li')])
    coRows.push(['invalid field input', await dump(desktop, '.form-row.woocommerce-invalid input')])
  } catch { coRows.push(['error states', null]) }
  save('measurements-checkout-page.md', md('Checkout page (1440px)', coRows))
}

// ---------- 3. product gallery + 6. quick view modal + buttons/forms sources ----------
let productUrl = null
{
  await open(desktop, `${BASE}/shop/`)
  await desktop.waitForTimeout(2000)
  productUrl = await desktop.evaluate(() => {
    const a = document.querySelector('li.product a.woocommerce-LoopProduct-link, li.product a')
    return a ? a.href : null
  })

  // quick view modal from the shop grid
  const modalRows = []
  try {
    await desktop.hover('li.product', { timeout: 5000 })
    await desktop.waitForTimeout(500)
    await desktop.click('li.product .quick-view, li.product a[class*="quick"]', { timeout: 5000 })
    await desktop.waitForTimeout(2500)
    modalRows.push(...await dumpMany(desktop, [
      ['overlay / backdrop', '.mfp-bg, .modal-backdrop'],
      ['modal container', '.mfp-content, .modal-dialog, #quick-view-content'],
      ['modal inner', '.mfp-content .product, .modal-content'],
      ['modal image column', '.mfp-content .woocommerce-product-gallery, .modal-content img'],
      ['modal title', '.mfp-content h1, .mfp-content .product_title, .modal-content h1'],
      ['modal price', '.mfp-content .price, .modal-content .price'],
      ['modal add-to-cart', '.mfp-content .single_add_to_cart_button'],
      ['close button', '.mfp-close, .modal .close'],
    ]))
    await desktop.keyboard.press('Escape')
    await desktop.waitForTimeout(800)
  } catch { modalRows.push(['quick view', null]) }
  save('measurements-modal.md', md('Quick view modal (shop, 1440px)', modalRows))
}

{
  await open(desktop, productUrl || `${BASE}/product/`)
  await desktop.waitForTimeout(2500)
  save('measurements-product-gallery.md', md(`Product gallery (${productUrl || 'product page'}, 1440px)`, await dumpMany(desktop, [
    ['gallery wrapper', '.woocommerce-product-gallery'],
    ['main image viewport', '.woocommerce-product-gallery .flex-viewport, .woocommerce-product-gallery__wrapper'],
    ['main image', '.woocommerce-product-gallery__image img'],
    ['zoom trigger button', '.woocommerce-product-gallery__trigger'],
    ['thumbnails strip', '.flex-control-thumbs'],
    ['single thumbnail', '.flex-control-thumbs li'],
    ['thumbnail image', '.flex-control-thumbs img'],
    ['summary column', '.entry-summary, .summary'],
    ['product title (h1)', '.product_title'],
    ['product price', '.summary .price'],
    ['qty + add-to-cart row', 'form.cart'],
    ['single add-to-cart button', '.single_add_to_cart_button'],
  ]), '\nzoom: WooCommerce zoom activates on hover inside .woocommerce-product-gallery__image (inline transformed img). Hover state is not a static style; note the trigger button specs above.\n'))

  // ---------- 4. buttons: every variant across pages ----------
  const btnRows = []
  const variants = [
    ['single add-to-cart (product)', '.single_add_to_cart_button'],
    ['qty input (product)', 'form.cart .qty'],
  ]
  for (const [label, sel] of variants) btnRows.push([label, await dump(desktop, sel)])
  try {
    await desktop.hover('.single_add_to_cart_button', { timeout: 4000 })
    await desktop.waitForTimeout(500)
    btnRows.push(['single add-to-cart :hover', await dump(desktop, '.single_add_to_cart_button')])
  } catch {}

  await open(desktop, `${BASE}/home-v7/`)
  await desktop.waitForTimeout(2500)
  for (const [label, sel] of [
    ['loop add-to-cart', 'li.product .add_to_cart_button'],
    ['hero / banner CTA', 'rs-layer a, .tp-caption a'],
    ['newsletter submit', '.footer-newsletter button, .newsletter form button, input[type="submit"]'],
    ['generic .button', '.button'],
    ['generic .btn', '.btn'],
  ]) btnRows.push([label, await dump(desktop, sel)])
  try {
    await desktop.hover('li.product .add_to_cart_button', { timeout: 4000 })
    await desktop.waitForTimeout(500)
    btnRows.push(['loop add-to-cart :hover', await dump(desktop, 'li.product .add_to_cart_button')])
  } catch {}
  save('measurements-buttons.md', md('Buttons, all variants (1440px)', btnRows, '\ncart/checkout button specs: see measurements-cart-page.md and measurements-checkout-page.md.\n'))

  // ---------- 7. typography hierarchy (home + product page) ----------
  const typRows = await dumpMany(desktop, [
    ['html base', 'html'],
    ['body', 'body'],
    ['h1 (page/product title)', 'h1, .product_title'],
    ['h2 (section title)', 'h2'],
    ['h3', 'h3'],
    ['h4', 'h4'],
    ['h5', 'h5'],
    ['h6', 'h6'],
    ['paragraph', 'p'],
    ['small / meta', 'small, .posted_in, .sku_wrapper'],
    ['link (body)', '.site-content a'],
    ['product title in grid', '.woocommerce-loop-product__title, li.product h2, li.product h3'],
    ['price in grid', 'li.product .price'],
    ['widget title', '.widget-title'],
  ])
  save('measurements-typography.md', md('Typography hierarchy (1440px)', typRows))

  // ---------- 10. section spacing on home-v7 ----------
  const spacing = await desktop.evaluate(() => {
    const main = document.querySelector('#main, .site-main, #content') || document.body
    const blocks = [...main.children].filter((el) => el.getBoundingClientRect().height > 40)
    const rows = []
    for (let i = 0; i < blocks.length; i++) {
      const el = blocks[i]
      const cs = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      const name = (el.tagName + '.' + String(el.className).trim().split(/\s+/).slice(0, 2).join('.')).toLowerCase()
      const next = blocks[i + 1]
      rows.push({
        section: name,
        height: Math.round(r.height),
        marginTop: cs.marginTop, marginBottom: cs.marginBottom,
        paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom,
        gapToNext: next ? Math.round(next.getBoundingClientRect().top - r.bottom) : null,
      })
    }
    return rows
  })
  const spLines = ['# Section spacing (home-v7, 1440px)', '', '| section | height | margin t/b | padding t/b | visual gap to next |', '|---|---|---|---|---|']
  for (const s of spacing) spLines.push(`| ${s.section} | ${s.height}px | ${s.marginTop} / ${s.marginBottom} | ${s.paddingTop} / ${s.paddingBottom} | ${s.gapToNext === null ? '' : s.gapToNext + 'px'} |`)
  save('measurements-spacing.md', spLines.join('\n') + '\n')
}

// ---------- 5. forms: default, focus, error ----------
{
  await open(desktop, `${BASE}/my-account/`)
  await desktop.waitForTimeout(2000)
  const formRows = await dumpMany(desktop, [
    ['login form box', '.woocommerce form.login, .u-column1'],
    ['field row', 'form.login .form-row'],
    ['label', 'form.login label'],
    ['input default', '#username, form.login input.input-text'],
    ['checkbox row (remember me)', '.woocommerce-form-login__rememberme'],
    ['submit button', 'form.login button[type="submit"], button[name="login"]'],
    ['lost password link', '.lost_password a'],
  ])
  try {
    await desktop.click('#username', { timeout: 5000 })
    await desktop.waitForTimeout(400)
    formRows.push(['input :focus', await dump(desktop, '#username')])
  } catch { formRows.push(['input :focus', null]) }
  try {
    await desktop.click('button[name="login"]', { timeout: 5000 })
    await desktop.waitForTimeout(2500)
    formRows.push(['error banner (empty submit)', await dump(desktop, '.woocommerce-error')])
    formRows.push(['error text item', await dump(desktop, '.woocommerce-error li')])
  } catch { formRows.push(['error state', null]) }
  save('measurements-forms.md', md('Forms: default / focus / error (my-account, 1440px)', formRows, '\ncheckout field + invalid-field specs: see measurements-checkout-page.md.\n'))

  // ---------- 9. account pages ----------
  save('measurements-account-pages.md', md('Account pages (my-account, logged out, 1440px)', await dumpMany(desktop, [
    ['page container', '.woocommerce'],
    ['columns wrapper (login/register)', '.u-columns, #customer_login'],
    ['login column', '.u-column1'],
    ['register column', '.u-column2'],
    ['column heading (h2)', '.u-column1 h2, #customer_login h2'],
    ['form box', 'form.login'],
    ['register form box', 'form.register'],
    ['input', 'form.login input.input-text'],
    ['primary button', 'form.login button'],
  ]), '\nlogged-in dashboard (nav tabs, orders table) requires an account; demo is measured logged out.\n'))
  await desktop.close()
}

// ---------- 8. mobile 390px: header + menu ----------
{
  const page = await newPage(390, 844)
  await open(page, `${BASE}/home-v7/`)
  await page.waitForTimeout(3000)
  const mRows = await dumpMany(page, [
    ['header (mobile)', '.handheld-header, header.site-header'],
    ['header inner row', '.handheld-header .container, header .container'],
    ['logo', '.site-branding, .header-logo, .custom-logo-link'],
    ['hamburger toggle', '.navbar-toggler, .menu-toggle, .handheld-header button'],
    ['search toggle / bar', '.handheld-header .search, .header-search'],
    ['cart icon block', '.handheld-header .cart, .site-header-cart'],
  ])
  try {
    await page.click('.navbar-toggler, .menu-toggle', { timeout: 6000 })
    await page.waitForTimeout(1200)
    mRows.push(...await dumpMany(page, [
      ['open menu panel', '.off-canvas-navigation, .mobile-navigation, .handheld-navigation'],
      ['menu item', '.off-canvas-navigation li, .handheld-navigation li'],
      ['menu link', '.off-canvas-navigation a, .handheld-navigation a'],
      ['submenu expander', '.dropdown-toggle, .off-canvas-navigation .expand'],
    ]))
  } catch { mRows.push(['open menu', null]) }
  save('measurements-mobile-390.md', md('Header + menu (390px viewport)', mRows))
  await page.close()
}

await browser.close()
console.error('Done. 10 files in ~/Downloads')
