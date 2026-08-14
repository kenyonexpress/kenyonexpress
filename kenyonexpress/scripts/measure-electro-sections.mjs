import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

// Measures electro home-v7 sections 1-4 (hero, deals, category tiles,
// products carousel) and prints markdown tables of computed styles.
// Run from the DESKTOP terminal: the live site sits behind a Cloudflare
// managed challenge that hard-blocks headless Chromium, so this launches
// headed Chrome exactly like scripts/extract-electro.mjs does.
//
//   node scripts/measure-electro-sections.mjs
//
// Output: markdown to stdout + raw JSON at refs/electro-section-measurements.json

const URL = 'https://electro.madrasthemes.com/home-v7/'
const VIEW = { width: 1440, height: 2400 }

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
  console.error('goto timed out, continuing')
}

console.error('Waiting for Cloudflare challenge to clear…')
let cleared = false
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(1500)
  cleared = await page.evaluate(() => !!document.querySelector('#masthead, header.site-header'))
  if (cleared) break
}
if (!cleared) console.error('WARNING: theme markup never appeared')

console.error('Waiting 5s for RevSlider init…')
await page.waitForTimeout(5000)

const data = await page.evaluate(() => {
  const PROPS = [
    'width',
    'height',
    'padding',
    'margin',
    'gap',
    'font-family',
    'font-size',
    'font-weight',
    'line-height',
    'letter-spacing',
    'color',
    'background-color',
    'border',
    'border-radius',
    'text-transform',
    'display',
    '-webkit-line-clamp',
    'overflow',
  ]
  const pick = (el) => {
    if (!el) return null
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    const out = { rect: { w: Math.round(r.width), h: Math.round(r.height) } }
    for (const p of PROPS) {
      const v = cs.getPropertyValue(p)
      if (v && v !== 'normal' && v !== 'none' && v !== 'auto') out[p] = v
    }
    out._sel =
      el.tagName.toLowerCase() +
      (el.className ? `.${String(el.className).trim().split(/\s+/).slice(0, 3).join('.')}` : '')
    return out
  }
  const hover = (el, _prop) => {
    // computed hover styles are not queryable; read the matching :hover rule text instead
    if (!el) return null
    const found = []
    for (const sheet of document.styleSheets) {
      let rules
      try {
        rules = sheet.cssRules
      } catch {
        continue
      }
      for (const rule of rules || []) {
        if (rule.selectorText?.includes(':hover')) {
          const base = rule.selectorText.replace(/:hover.*$/, '')
          try {
            if (el.matches(base)) found.push(rule.cssText)
          } catch {}
        }
      }
    }
    return found.slice(0, 5)
  }
  const byText = (txt) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT)
    while (walker.nextNode()) {
      const el = walker.currentNode
      if (
        el.children.length === 0 &&
        el.textContent.trim().toLowerCase().includes(txt.toLowerCase())
      )
        return el
    }
    return null
  }
  const gapBetween = (a, b) => {
    if (!a || !b) return null
    const ra = a.getBoundingClientRect()
    const rb = b.getBoundingClientRect()
    return Math.round(rb.left - ra.right)
  }

  const out = {}

  // 1. hero slider
  const slider = document.querySelector('rs-module, .rev_slider, .home-v7-slider, .slider-area')
  const slide = document.querySelector('rs-slide, .tp-revslider-slidesli')
  out.hero = {
    container: pick(slider),
    slide: pick(slide),
    headings: [...document.querySelectorAll('rs-layer, .tp-caption')].slice(0, 8).map(pick),
    cta: pick(document.querySelector('rs-layer a, .tp-caption a, rs-module .btn')),
    dots: {
      wrap: pick(document.querySelector('.tp-bullets')),
      bullet: pick(document.querySelector('.tp-bullet')),
      active: pick(document.querySelector('.tp-bullet.selected')),
    },
  }

  // 2. deals section (Catch Big Deals)
  const dealsHead = byText('Catch Big Deals')
  const dealsSection = dealsHead
    ? dealsHead.closest('section, .container > div, [class*="deal"]') ||
      dealsHead.parentElement.parentElement
    : null
  out.deals = {
    headingEl: pick(dealsHead),
    section: pick(dealsSection),
    banners: dealsSection
      ? [...dealsSection.querySelectorAll('a, .banner, img')].slice(0, 6).map(pick)
      : [],
    shopNow: pick(
      dealsSection &&
        ([...dealsSection.querySelectorAll('a')].find((a) => /shop now/i.test(a.textContent)) ||
          null),
    ),
    images: dealsSection ? [...dealsSection.querySelectorAll('img')].slice(0, 4).map(pick) : [],
  }

  // 3. category tiles row
  const catTile = document.querySelector(
    '.product-category, [class*="category-item"], .cat-item, .categories-list li',
  )
  const catRow = catTile ? catTile.parentElement : null
  out.categories = {
    row: pick(catRow),
    tile: pick(catTile),
    icon: pick(catTile?.querySelector('img, svg, i')),
    label: pick(catTile?.querySelector('h3, h4, .title, a, span')),
    tileGap: catRow ? gapBetween(catRow.children[0], catRow.children[1]) : null,
    hoverRules: hover(catTile, 'all'),
  }

  // 4. products carousel
  const card = document.querySelector('.product.type-product, li.product, .product-item')
  out.carousel = {
    card: pick(card),
    imageArea: pick(
      card?.querySelector('.product-thumbnail, .woocommerce-LoopProduct-link img, img'),
    ),
    title: pick(card?.querySelector('.woocommerce-loop-product__title, h2, h3, .product-title')),
    price: pick(card?.querySelector('.price, .amount')),
    cardGap: card?.parentElement ? gapBetween(card, card.nextElementSibling) : null,
  }

  return out
})

const outDir = resolve(import.meta.dirname, '../refs')
mkdirSync(outDir, { recursive: true })
writeFileSync(resolve(outDir, 'electro-section-measurements.json'), JSON.stringify(data, null, 2))
console.error('Raw JSON written to refs/electro-section-measurements.json')

// ---- markdown output ----
const row = (label, o) => {
  if (!o) return `| ${label} | (not found) |  |  |  |  |`
  const f = (k) => o[k] || ''
  return `| ${label} | ${o.rect ? `${o.rect.w}x${o.rect.h}` : ''} | ${f('font-size')} ${f('font-weight')} | ${f('color')} | ${f('padding')} | ${f('background-color')} |`
}
const table = (title, entries) => {
  console.log(`\n### ${title}\n`)
  console.log('| element | rect (px) | font size/weight | color | padding | background |')
  console.log('|---|---|---|---|---|---|')
  for (const [label, o] of entries) console.log(row(label, o))
}

table('1. Hero slider', [
  ['container', data.hero.container],
  ['slide', data.hero.slide],
  ...data.hero.headings.map((h, i) => [`layer ${i}`, h]),
  ['CTA', data.hero.cta],
  ['dots wrap', data.hero.dots.wrap],
  ['bullet', data.hero.dots.bullet],
  ['bullet active', data.hero.dots.active],
])
table('2. Deals section', [
  ['heading', data.deals.headingEl],
  ['section', data.deals.section],
  ...data.deals.banners.map((b, i) => [`banner ${i}`, b]),
  ['shop-now', data.deals.shopNow],
  ...data.deals.images.map((im, i) => [`image ${i}`, im]),
])
table('3. Category tiles', [
  ['row', data.categories.row],
  ['tile', data.categories.tile],
  ['icon', data.categories.icon],
  ['label', data.categories.label],
])
console.log(`\ntile gap: ${data.categories.tileGap}px`)
console.log(`hover rules:\n${(data.categories.hoverRules || []).join('\n')}`)
table('4. Products carousel', [
  ['card', data.carousel.card],
  ['image area', data.carousel.imageArea],
  ['title', data.carousel.title],
  ['price', data.carousel.price],
])
console.log(`\ncard gap: ${data.carousel.cardGap}px`)

await browser.close()
