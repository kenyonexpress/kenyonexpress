import { chromium } from '@playwright/test'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const URL = 'https://electro.madrasthemes.com/home-v7/'
const VIEW = { width: 1440, height: 2400 }

// Headed Chrome with a realistic fingerprint — the live site sits behind a
// Cloudflare managed challenge that hard-blocks plain headless Chromium.
const browser = await chromium.launch({
  headless: false,
  args: ['--disable-blink-features=AutomationControlled'],
})
const ctx = await browser.newContext({
  viewport: VIEW,
  deviceScaleFactor: 1,
  locale: 'en-US',
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
})
await ctx.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
})
const page = await ctx.newPage()

console.error(`Opening ${URL} at ${VIEW.width}px…`)
try {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
} catch {
  console.error('goto timed out — continuing')
}

// Poll until the Cloudflare challenge clears and the real theme markup appears
console.error('Waiting for Cloudflare challenge to clear…')
let cleared = false
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(1500)
  cleared = await page.evaluate(() => !!document.querySelector('#masthead, header.site-header'))
  if (cleared) break
}
if (!cleared) {
  console.error('WARNING: theme markup never appeared — page may still be challenged')
}

// Wait for RevSlider to initialize and animate the first slide in
console.error('Waiting 5s for RevSlider init…')
await page.waitForTimeout(5000)

// ---- helpers evaluated in the page ----
const tokens = await page.evaluate(() => {
  const round = (v) => {
    const n = parseFloat(v)
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : v
  }
  // pick the first element matching any of the selectors
  const pick = (selectors) => {
    for (const sel of selectors) {
      const el = document.querySelector(sel)
      if (el) return el
    }
    return null
  }
  const cs = (el) => (el ? getComputedStyle(el) : null)
  const rect = (el) => {
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { width: round(r.width), height: round(r.height), top: round(r.top), left: round(r.left) }
  }
  // collect box/typography/color props for an element
  const styleOf = (el, props) => {
    const s = cs(el)
    if (!s) return null
    const out = {}
    for (const p of props) out[p] = s.getPropertyValue(p)
    return out
  }
  const box = (el) =>
    styleOf(el, [
      'height',
      'padding-top',
      'padding-right',
      'padding-bottom',
      'padding-left',
      'background-color',
      'color',
      'border-top-width',
      'border-bottom-width',
    ])
  const type = (el) =>
    styleOf(el, ['font-size', 'font-weight', 'line-height', 'color', 'font-family', 'letter-spacing', 'text-transform'])

  const result = {}

  // ===================== HEADER =====================
  const header = pick(['#masthead', '.site-header', 'header.site-header', 'header'])
  const topBar = pick(['.electro-pre-header', '.header-top', '.pre-header'])
  const mainRow = pick(['.masthead', '.header-v7 .masthead', '.electro-header-container', '.header-main'])
  const bottomNav = pick(['.electro-navbar', '.secondary-nav-menu', '.header-v7 .electro-navbar'])
  const logo = pick([
    '.navbar-brand img',
    'a.navbar-brand img',
    '.site-header .logo img',
    '.header-logo img',
    '.site-branding img',
  ])
  const searchForm = pick(['form.navbar-search', '.navbar-search', '.electro-search-form', 'form.search-form'])
  const searchInput = pick(['.navbar-search input[type="text"]', '.navbar-search .form-control', '.search-field', '.electro-search-form input[type="text"]'])

  result.header = {
    header: { rect: rect(header), style: box(header) },
    top_bar: { rect: rect(topBar), style: box(topBar) },
    main_row: { rect: rect(mainRow), style: box(mainRow) },
    bottom_nav: { rect: rect(bottomNav), style: box(bottomNav) },
    logo: {
      rect: rect(logo),
      natural: logo ? { width: logo.naturalWidth, height: logo.naturalHeight } : null,
      src: logo ? logo.currentSrc || logo.src : null,
    },
    search_form: { rect: rect(searchForm) },
    search_input: { rect: rect(searchInput), style: styleOf(searchInput, ['height', 'font-size', 'border-top-width', 'background-color']) },
  }

  // ===================== HERO SLIDER =====================
  const revContainer = pick(['rs-module-wrap', '.rev_slider_wrapper', '#rev_slider_1_1_wrapper', '.rev_slider_wrapper'])
  const revModule = pick(['rs-module', '.rev_slider', '#rev_slider_1_1'])
  // the currently active slide
  const activeSlide =
    pick(['rs-slide[style*="opacity: 1"]', 'rs-slide.rs-active', '.tp-revslider-slidesli.active-revslide']) ||
    pick(['rs-slide'])

  // RevSlider stores the *authored* responsive type scale in each layer's
  // data-text attribute, e.g. "s:58,58,43,43;l:58,58,43,43;ls:-1px;fw:300;".
  // The four comma-separated values are breakpoints [desktop, desktop(notebook),
  // mobile(tablet), mobile]. We read these instead of computed font-size because
  // computed size only reflects whatever breakpoint/zoom the slider rendered at
  // (and is unreliable if RevSlider never finished initialising).
  const parseDataText = (raw) => {
    if (!raw) return null
    const map = {}
    for (const part of raw.split(';')) {
      const [k, v] = part.split(':')
      if (k && v !== undefined) map[k.trim()] = v.trim()
    }
    const breakpoints = (v) => {
      if (!v) return null
      const nums = v.split(',').map((n) => round(n))
      // [desktop, desktop, mobile, mobile] per RevSlider's 4-breakpoint model
      return { desktop: nums[0], mobile: nums[nums.length - 1], raw: v }
    }
    return {
      font_size: breakpoints(map.s),
      line_height: breakpoints(map.l),
      font_weight: map.fw || null,
      letter_spacing: map.ls || null,
      align: map.a || null,
    }
  }

  // every visible text layer inside the active slide (or the whole module)
  const layerRoot = activeSlide || revModule || document
  const layers = Array.from(layerRoot.querySelectorAll('rs-layer, .tp-caption'))
    .filter((el) => {
      const txt = (el.textContent || '').trim()
      const dataType = el.getAttribute('data-type')
      // keep authored text layers even if RevSlider hasn't laid them out yet
      return txt.length > 0 && (dataType === 'text' || dataType === null)
    })
    .slice(0, 12)
    .map((el) => {
      const authored = parseDataText(el.getAttribute('data-text'))
      return {
        text: (el.textContent || '').trim().slice(0, 60),
        color: el.getAttribute('data-color') || (type(el) || {}).color || null,
        font_family: (type(el) || {})['font-family'] || null,
        // authored responsive scale from data-text (desktop / mobile)
        font_size_desktop: authored?.font_size?.desktop ?? null,
        font_size_mobile: authored?.font_size?.mobile ?? null,
        line_height_desktop: authored?.line_height?.desktop ?? null,
        line_height_mobile: authored?.line_height?.mobile ?? null,
        font_weight: authored?.font_weight ?? null,
        letter_spacing: authored?.letter_spacing ?? null,
        authored, // full parsed data-text for reference
        rect: rect(el), // computed box (may reflect default breakpoint only)
      }
    })

  // RevSlider navigation dots / bullets
  const dots = pick(['.tp-bullets', 'rs-bullets', '.rev_slider_wrapper .tp-bullets'])
  const dot = pick(['.tp-bullet', 'rs-bullet'])

  // home-v7 hero row = [vertical departments menu] [slider] [stacked side banners]
  const catCol = pick(['.home-vertical-nav.departments-menu-v2', '.home-vertical-nav', '.departments-menu-v2'])
  const sideBanners = pick(['.slider-das-block', '.slider-with-catogory + .slider-das-block'])
  const sideBanner = pick(['.slider-das-block a', '.slider-das-block img', '.slider-das-block > div'])

  result.hero = {
    container: { rect: rect(revContainer), style: styleOf(revContainer, ['height', 'background-color']) },
    module: { rect: rect(revModule), style: styleOf(revModule, ['height']) },
    active_slide: { rect: rect(activeSlide) },
    text_layers: layers,
    dots: { rect: rect(dots), style: styleOf(dots, ['bottom', 'top', 'left', 'right', 'text-align']) },
    dot: { rect: rect(dot), style: styleOf(dot, ['width', 'height', 'background-color', 'border-radius', 'margin-left', 'margin-right']) },
    category_column: { rect: rect(catCol), style: box(catCol) },
    side_banners: {
      block: { rect: rect(sideBanners) },
      item: { rect: rect(sideBanner) },
      count: sideBanners ? sideBanners.querySelectorAll('a, img, .das-banner').length : 0,
    },
  }

  // ===================== PRODUCT CARD =====================
  const card = pick([
    'ul.products li.product',
    '.products .product',
    '.product-loop .product',
    '.products-grid .product',
    'li.product',
  ])
  const cardInner = card ? card.querySelector('.product-outer, .product-inner, .content-product') : null
  const cardTitle = card ? card.querySelector('.woocommerce-loop-product__title, .product-title, h2, h3, .product_title') : null
  const cardPrice = card ? card.querySelector('.price, .woocommerce-Price-amount, .amount') : null
  const cardImg = card ? card.querySelector('img') : null

  const cardStyleTarget = cardInner || card
  result.product_card = {
    card: {
      rect: rect(card),
      style: styleOf(cardStyleTarget, [
        'border-top-width',
        'border-top-style',
        'border-top-color',
        'border-radius',
        'box-shadow',
        'background-color',
        'padding-top',
        'padding-bottom',
        'padding-left',
        'padding-right',
      ]),
    },
    title: { rect: rect(cardTitle), style: type(cardTitle) },
    price: { rect: rect(cardPrice), style: type(cardPrice) },
    image: { rect: rect(cardImg) },
  }

  // ===================== SECTION HEADINGS =====================
  const sectionHeadings = Array.from(
    document.querySelectorAll('h2.h1, .section-title-normal h2, .products-carousel-header h2, .vc_custom_heading')
  )
    .filter((el) => {
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      return (el.textContent || '').trim() && r.width > 0 && r.height > 0 && s.display !== 'none'
    })
    .slice(0, 6)
    .map((el) => ({ text: (el.textContent || '').trim().slice(0, 50), rect: rect(el), style: type(el) }))

  result.section_headings = sectionHeadings

  // ===================== FOOTER =====================
  const footer = pick(['#colophon', '.site-footer', 'footer.site-footer', 'footer'])
  const footerWidgets = pick(['.footer-widgets', '#colophon .footer-widgets', '.footer-widget-area'])
  const footerBottom = pick(['.copyright-bar', '#colophon .footer-bottom-widgets', '.footer-bottom', '.site-info'])
  const footerHeading = footer ? footer.querySelector('.widget-title, h4, h3') : null
  const footerLink = footer ? footer.querySelector('a') : null

  result.footer = {
    footer: { rect: rect(footer), style: box(footer) },
    widgets: { rect: rect(footerWidgets), style: box(footerWidgets) },
    bottom: { rect: rect(footerBottom), style: box(footerBottom) },
    heading: { style: type(footerHeading) },
    link: { style: type(footerLink) },
  }

  // body base for reference
  result.body = { style: type(document.body) }

  return result
})

await browser.close()

const outDir = resolve('refs')
mkdirSync(outDir, { recursive: true })
const outPath = resolve(outDir, 'electro-tokens.json')
const json = JSON.stringify(
  { source: URL, viewport: VIEW, extractedAt: new Date().toISOString(), ...tokens },
  null,
  2
)
writeFileSync(outPath, json)
console.error(`\nWrote ${outPath}\n`)
console.log(json)
