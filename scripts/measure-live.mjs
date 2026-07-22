// Measure live kenyonexpress.co.il with getComputedStyle + getBoundingClientRect.
// Output: MEASURED-LIVE.md (single table) + screenshots in ./shots/.
// MEASURED VALUES ONLY - anything not found is reported as NOT FOUND / hidden.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache
}

const BASE = 'https://kenyonexpress.co.il'
const VIEWPORTS = [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '375x812', width: 375, height: 812 },
]

const PRODUCT_URL = `${BASE}/product/${encodeURIComponent('מוצר-לדוגמא')}/`
const CATEGORY_URL = `${BASE}/product-category/${encodeURIComponent('מסעדות-ובתי-קפה')}/`

// Spec: label -> candidate selectors (first visible match wins) + computed props.
// rect:* pseudo-props come from getBoundingClientRect.
const RECT = ['rect:width', 'rect:height', 'rect:top', 'rect:left', 'rect:right']

const HEADER_FOOTER_SPECS = [
  { label: 'header', sel: ['#masthead', '.site-header', 'header'], props: [...RECT, 'background-color', 'position'] },
  { label: 'header logo img', sel: ['.header-site-branding img', '.site-branding img', '.header-logo img'], props: [...RECT, 'max-width'] },
  { label: 'header search bar', sel: ['.navbar-search', 'form.navbar-search', '.header-search'], props: [...RECT] },
  { label: 'header search input', sel: ['.navbar-search .form-control', '.navbar-search input[type=text]', '.navbar-search .input-text', '.search-field'], props: [...RECT, 'font-size', 'border-radius', 'border-top-left-radius', 'background-color', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'border-top-width', 'border-top-color'] },
  { label: 'header search button', sel: ['.navbar-search button[type=submit]', '.navbar-search .btn', '.navbar-search .input-group-btn button'], props: [...RECT, 'background-color', 'border-radius', 'color', 'font-size'] },
  { label: 'header icon 1 (of N)', sel: ['.header-icon:nth-of-type(1)', '.header-icons .header-icon'], props: [...RECT, 'margin-right', 'margin-left', 'font-size'] },
  { label: 'header icon 2', sel: ['.header-icon:nth-of-type(2)'], props: [...RECT, 'margin-right', 'margin-left', 'font-size'] },
  { label: 'header icon 3', sel: ['.header-icon:nth-of-type(3)'], props: [...RECT, 'margin-right', 'margin-left', 'font-size'] },
  { label: 'header icons row', sel: ['.header-icons', '.masthead .float-lg-right', '.masthead .justify-content-lg-end'], props: [...RECT, 'gap'] },
  { label: 'header cart amount', sel: ['.header-icon .cart-amount', '.header-icon-counter'], props: [...RECT, 'font-size', 'color', 'background-color'] },
  { label: 'handheld header (mobile)', sel: ['.handheld-header', '.handheld-stick-this'], props: [...RECT, 'background-color'] },
  { label: 'footer', sel: ['.site-footer', 'footer.site-footer', '#colophon'], props: [...RECT, 'background-color', 'color', 'font-size'] },
  { label: 'footer widgets area', sel: ['.footer-bottom-widgets', '.footer-widgets'], props: [...RECT, 'padding-top', 'padding-bottom', 'background-color'] },
  { label: 'footer column 1 (contact)', sel: ['.footer-contact', '.footer-bottom-widgets-inner > div:nth-child(1)'], props: [...RECT, 'font-size', 'color'] },
  { label: 'footer column 2 (menus)', sel: ['.footer-bottom-widgets-menu'], props: [...RECT] },
  { label: 'footer columns count', sel: ['.footer-bottom-widgets-inner.row', '.footer-bottom-widgets-inner'], props: ['children-count', ...RECT] },
  { label: 'footer menu columns count', sel: ['.footer-bottom-widgets-menu-inner'], props: ['children-count'] },
  { label: 'footer payment logos', sel: ['.footer-payment-logo'], props: [...RECT, 'background-color', 'padding-top', 'padding-bottom'] },
  { label: 'footer widget title', sel: ['.footer-widgets .widget-title', '.site-footer .widget-title', '.site-footer .gamma'], props: ['font-size', 'font-weight', 'color', 'margin-bottom'] },
  { label: 'footer link', sel: ['.footer-widgets a', '.site-footer .widget a'], props: ['font-size', 'color', 'line-height'] },
  { label: 'footer newsletter bar', sel: ['.footer-newsletter', '.newsletter-v2'], props: [...RECT, 'background-color', 'padding-top', 'padding-bottom'] },
  { label: 'footer copyright bar', sel: ['.copyright-bar', '.site-info'], props: [...RECT, 'background-color', 'color', 'font-size', 'padding-top', 'padding-bottom'] },
]

const PRODUCT_SPECS = [
  { label: 'gallery container', sel: ['.woocommerce-product-gallery', '.single-product .images'], props: [...RECT, 'float', 'margin-bottom'] },
  { label: 'gallery main image', sel: ['.woocommerce-product-gallery__image img', '.woocommerce-product-gallery img'], props: [...RECT] },
  { label: 'gallery thumbnails wrap', sel: ['.flex-control-thumbs', 'ol.flex-control-thumbs'], props: [...RECT, 'margin-top'] },
  { label: 'gallery thumbnail', sel: ['.flex-control-thumbs li', '.flex-control-thumbs li img'], props: [...RECT, 'margin-right', 'margin-left', 'margin-bottom', 'padding-right', 'padding-left'] },
  { label: 'summary column', sel: ['.single-product .summary', '.entry-summary'], props: [...RECT, 'padding-left', 'padding-right'] },
  { label: 'product title h1', sel: ['.product_title', '.summary h1'], props: [...RECT, 'font-size', 'font-weight', 'color', 'line-height', 'margin-bottom'] },
  { label: 'price current', sel: ['.summary .price ins .woocommerce-Price-amount', '.summary .price > .woocommerce-Price-amount', '.summary .price .woocommerce-Price-amount'], props: ['font-size', 'font-weight', 'color'] },
  { label: 'price strike (del)', sel: ['.summary .price del .woocommerce-Price-amount', '.summary .price del'], props: ['font-size', 'color', 'text-decoration-line'] },
  { label: 'price wrap', sel: ['.summary .price'], props: [...RECT, 'font-size', 'color', 'margin-bottom'] },
  { label: 'add-to-cart button', sel: ['.single_add_to_cart_button'], props: [...RECT, 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'height', 'border-radius', 'background-color', 'color', 'font-size', 'font-weight', 'border-top-width', 'line-height'] },
  { label: 'add-to-cart button HOVER', sel: ['.single_add_to_cart_button'], props: ['background-color', 'color'], hover: true },
  { label: 'quantity input', sel: ['.summary .quantity .qty', 'input.qty'], props: [...RECT, 'border-radius', 'border-top-width', 'border-top-color', 'font-size', 'text-align'] },
  { label: 'supplier/meta block', sel: ['.product_meta', '.summary .product_meta'], props: [...RECT, 'font-size', 'color', 'margin-top', 'padding-top', 'border-top-width', 'border-top-color'] },
  { label: 'supplier/meta link', sel: ['.product_meta a'], props: ['font-size', 'color', 'font-weight'] },
  { label: 'tabs section', sel: ['.woocommerce-tabs'], props: [...RECT, 'margin-top', 'margin-bottom', 'padding-top'] },
  { label: 'related section', sel: ['.related.products', '.related'], props: [...RECT, 'margin-top', 'padding-top'] },
  { label: 'related heading', sel: ['.related.products > h2', '.related h2', '.related .section-title'], props: ['font-size', 'font-weight', 'color', 'margin-bottom'] },
  { label: 'related list', sel: ['.related ul.products', '.related .products'], props: [...RECT, 'display', 'grid-template-columns', 'gap', 'margin-right', 'margin-left'] },
  { label: 'related item card', sel: ['.related ul.products li.product', '.related .products .product'], props: [...RECT, 'padding-right', 'padding-left', 'margin-bottom', 'width'] },
  { label: 'related items count', sel: ['.related ul.products', '.related .products'], props: ['children-count'] },
  { label: 'main content container', sel: ['.single-product .site-main', '#main'], props: [...RECT, 'padding-right', 'padding-left'] },
]

const CATEGORY_SPECS = [
  { label: 'breadcrumb', sel: ['.woocommerce-breadcrumb', 'nav.woocommerce-breadcrumb'], props: [...RECT, 'font-size', 'color', 'padding-top', 'padding-bottom'] },
  { label: 'category h1', sel: ['.page-title', 'h1.page-title'], props: [...RECT, 'font-size', 'font-weight', 'color', 'line-height', 'margin-bottom'] },
  { label: 'shop control bar', sel: ['.shop-control-bar', '.woocommerce-shop-control-bar'], props: [...RECT, 'background-color', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'border-radius', 'font-size'] },
  { label: 'result count', sel: ['.woocommerce-result-count'], props: [...RECT, 'font-size', 'color'] },
  { label: 'orderby select', sel: ['.woocommerce-ordering select', 'select.orderby'], props: [...RECT, 'font-size', 'border-radius', 'border-top-width', 'background-color', 'padding-top', 'padding-right'] },
  { label: 'view switcher', sel: ['.shop-view-switcher'], props: [...RECT, 'font-size'] },
  { label: 'products grid (ul)', sel: ['ul.products', '.products'], props: [...RECT, 'display', 'grid-template-columns', 'gap', 'flex-wrap', 'margin-right', 'margin-left'] },
  { label: 'product card (li)', sel: ['ul.products li.product', '.products .product'], props: [...RECT, 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'margin-bottom', 'border-left-width', 'border-left-color', 'border-right-width'] },
  { label: 'cards count', sel: ['ul.products'], props: ['children-count'] },
  { label: 'card category tag', sel: ['ul.products li.product .loop-product-categories', 'li.product .posted_in'], props: ['font-size', 'color', 'margin-bottom'] },
  { label: 'card category tag link', sel: ['.loop-product-categories a'], props: ['font-size', 'color'] },
  { label: 'card title', sel: ['li.product .woocommerce-loop-product__title', 'li.product h2'], props: ['font-size', 'font-weight', 'color', 'line-height', 'margin-bottom'] },
  { label: 'card price', sel: ['li.product .price'], props: [...RECT, 'font-size', 'color', 'margin-bottom'] },
  { label: 'card price sale (ins)', sel: ['li.product .price ins .woocommerce-Price-amount', 'li.product .price ins'], props: ['font-size', 'color', 'font-weight'] },
  { label: 'card price strike (del)', sel: ['li.product .price del'], props: ['font-size', 'color'] },
  { label: 'card image', sel: ['li.product img'], props: [...RECT] },
  { label: 'sale badge', sel: ['li.product .onsale', '.ribbon', 'li.product .badge'], props: [...RECT, 'background-color', 'color', 'font-size', 'font-weight', 'border-radius', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left'] },
  { label: 'add-to-cart icon btn', sel: ['li.product .add-to-cart-wrap a', 'li.product .add_to_cart_button'], props: [...RECT, 'background-color', 'color', 'border-radius', 'font-size'] },
  { label: 'filter sidebar', sel: ['#secondary', '.widget-area', '.shop-sidebar', '.sidebar'], props: [...RECT, 'background-color', 'padding-right', 'padding-left'] },
  { label: 'sidebar widget', sel: ['#secondary .widget', '.widget-area .widget'], props: [...RECT, 'margin-bottom'] },
  { label: 'pagination', sel: ['.woocommerce-pagination', 'nav.woocommerce-pagination'], props: [...RECT, 'font-size', 'text-align'] },
  { label: 'pagination link', sel: ['.woocommerce-pagination a', '.woocommerce-pagination .page-numbers'], props: [...RECT, 'background-color', 'color', 'border-radius', 'font-size'] },
  { label: 'main container', sel: ['.site-main', '#main'], props: [...RECT] },
]

const CART_SPECS = [
  { label: 'cart page title', sel: ['h1.entry-title', '.page-title', 'h1'], props: [...RECT, 'font-size', 'font-weight', 'color'] },
  { label: 'cart form/table', sel: ['.woocommerce-cart-form', 'form.woocommerce-cart-form'], props: [...RECT] },
  { label: 'cart table', sel: ['table.shop_table', '.shop_table.cart'], props: [...RECT, 'border-top-width', 'border-top-color', 'border-collapse', 'font-size'] },
  { label: 'cart table th', sel: ['table.shop_table th'], props: ['font-size', 'font-weight', 'color', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'background-color'] },
  { label: 'cart line item td', sel: ['table.shop_table td.product-name', '.cart_item td'], props: ['font-size', 'color', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'border-top-width'] },
  { label: 'cart item thumbnail', sel: ['.cart_item .product-thumbnail img', 'td.product-thumbnail img'], props: [...RECT] },
  { label: 'cart qty input', sel: ['.cart_item .qty', 'td.product-quantity input'], props: [...RECT, 'border-radius', 'font-size', 'text-align'] },
  { label: 'cart remove x', sel: ['.cart_item .remove', 'td.product-remove a'], props: [...RECT, 'color', 'font-size', 'border-radius', 'background-color'] },
  { label: 'update cart button', sel: ['button[name=update_cart]'], props: [...RECT, 'background-color', 'color', 'border-radius', 'font-size', 'padding-top', 'padding-right'] },
  { label: 'cart totals box', sel: ['.cart_totals', '.cart-collaterals .cart_totals'], props: [...RECT, 'background-color', 'border-top-width', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left'] },
  { label: 'cart totals heading', sel: ['.cart_totals h2'], props: ['font-size', 'font-weight', 'color'] },
  { label: 'checkout button', sel: ['.checkout-button', 'a.checkout-button'], props: [...RECT, 'background-color', 'color', 'font-size', 'font-weight', 'border-radius', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'display'] },
  { label: 'empty cart message', sel: ['.cart-empty', 'p.cart-empty', '.wc-empty-cart-message'], props: [...RECT, 'font-size', 'color', 'text-align'] },
  { label: 'return to shop button', sel: ['.return-to-shop a', 'a.wc-backward'], props: [...RECT, 'background-color', 'color', 'border-radius', 'padding-top', 'padding-right'] },
]

async function measurePage(page, specs) {
  return page.evaluate((specList) => {
    const visible = (el) => {
      const cs = getComputedStyle(el)
      return cs.display !== 'none' && cs.visibility !== 'hidden'
    }
    const rows = []
    for (const spec of specList) {
      let el = null
      let matched = null
      for (const s of spec.sel) {
        try {
          const cands = [...document.querySelectorAll(s)]
          el = cands.find(visible) ?? cands[0] ?? null
        } catch {
          el = null
        }
        if (el) {
          matched = s
          break
        }
      }
      if (!el) {
        rows.push({ label: spec.label, prop: '-', value: 'NOT FOUND' })
        continue
      }
      const cs = getComputedStyle(el)
      const rect = el.getBoundingClientRect()
      if (!visible(el)) rows.push({ label: spec.label, prop: 'visibility', value: 'hidden (display:none)' })
      for (const prop of spec.props) {
        let value
        if (prop.startsWith('rect:')) {
          const k = prop.slice(5)
          value = `${+rect[k].toFixed(2)}px`
        } else if (prop === 'children-count') {
          value = String(el.children.length)
        } else {
          value = cs.getPropertyValue(prop)
        }
        if (value !== '' && value != null) rows.push({ label: spec.label, prop, value, matched })
      }
    }
    return rows
  }, specs)
}

async function hoverMeasure(page, specs, allRows, pageName, vpName) {
  for (const spec of specs.filter((s) => s.hover)) {
    for (const s of spec.sel) {
      const loc = page.locator(s).first()
      if ((await loc.count()) > 0) {
        try {
          await loc.hover({ timeout: 5000 })
          await page.waitForTimeout(500)
          const vals = await loc.evaluate((el, props) => {
            const cs = getComputedStyle(el)
            return props.map((p) => ({ prop: p, value: cs.getPropertyValue(p) }))
          }, spec.props)
          for (const v of vals) allRows.push({ page: pageName, vp: vpName, label: spec.label, ...v })
        } catch {
          allRows.push({ page: pageName, vp: vpName, label: spec.label, prop: '-', value: 'HOVER FAILED' })
        }
        break
      }
    }
  }
}

const rows = []
mkdirSync('shots', { recursive: true })
const browser = await chromium.launch()

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    userAgent:
      vp.width < 500
        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
        : undefined,
    locale: 'he-IL',
  })
  const page = await ctx.newPage()

  const targets = [
    { name: 'header+footer (home)', url: `${BASE}/`, specs: HEADER_FOOTER_SPECS, shot: `home-${vp.name}` },
    { name: 'product', url: PRODUCT_URL, specs: PRODUCT_SPECS, shot: `product-${vp.name}` },
    { name: 'category', url: CATEGORY_URL, specs: CATEGORY_SPECS, shot: `category-${vp.name}` },
  ]

  for (const t of targets) {
    console.log(`[${vp.name}] ${t.name} -> ${t.url}`)
    try {
      await page.goto(t.url, { waitUntil: 'networkidle', timeout: 90000 })
    } catch {
      await page.goto(t.url, { waitUntil: 'domcontentloaded', timeout: 90000 })
    }
    await page.waitForTimeout(3500)
    const r = await measurePage(page, t.specs)
    for (const row of r) rows.push({ page: t.name, vp: vp.name, ...row })
    await hoverMeasure(page, t.specs, rows, t.name, vp.name)
    await page.screenshot({ path: `shots/${t.shot}.png`, fullPage: true })
  }

  // Cart: add the sample product by really clicking add-to-cart on the product page.
  console.log(`[${vp.name}] cart`)
  try {
    await page.goto(PRODUCT_URL, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await page.waitForTimeout(2500)
    const atc = page.locator('.single_add_to_cart_button').first()
    if ((await atc.count()) > 0) {
      await atc.click({ timeout: 10000 })
      await page.waitForTimeout(4000)
    }
  } catch {}
  try {
    await page.goto(`${BASE}/cart/`, { waitUntil: 'networkidle', timeout: 90000 })
  } catch {
    await page.goto(`${BASE}/cart/`, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {})
  }
  await page.waitForTimeout(3000)
  const cartRows = await measurePage(page, CART_SPECS)
  for (const row of cartRows) rows.push({ page: 'cart', vp: vp.name, ...row })
  await page.screenshot({ path: `shots/cart-${vp.name}.png`, fullPage: true })

  await ctx.close()
}

await browser.close()

const lines = [
  '# MEASURED-LIVE.md',
  '',
  `Source: ${BASE} | Tool: Playwright chromium, getComputedStyle + getBoundingClientRect`,
  `Product page: ${decodeURIComponent(PRODUCT_URL)}`,
  `Category page: ${decodeURIComponent(CATEGORY_URL)}`,
  'Screenshots: ./shots/*.png',
  '',
  '| Page | Viewport | Element | CSS Property | Value |',
  '|------|----------|---------|--------------|-------|',
]
for (const r of rows) {
  const val = String(r.value).replaceAll('|', '\\|').trim()
  lines.push(`| ${r.page} | ${r.vp} | ${r.label} | ${r.prop} | ${val} |`)
}
writeFileSync('MEASURED-LIVE.md', `${lines.join('\n')}\n`)
console.log(`\nMEASURED-LIVE.md written: ${rows.length} rows`)
