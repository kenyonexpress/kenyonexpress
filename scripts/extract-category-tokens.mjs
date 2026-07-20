// Extract category page DOM tokens from live kenyonexpress.co.il.
// Usage: node scripts/extract-category-tokens.mjs [slug]
// Default slug: hot-deals
import { existsSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

const slug = process.argv[2] ?? 'hot-deals'
const OUT = resolve('refs/category-tokens.json')

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache
}

const URL = `https://kenyonexpress.co.il/product-category/${encodeURIComponent(slug)}/`

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 2600 },
  deviceScaleFactor: 1,
  locale: 'he-IL',
})
const page = await ctx.newPage()
try {
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 })
} catch {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
}
await page.waitForTimeout(4000)

const tokens = await page.evaluate(() => {
  const round = (v) => {
    const n = Number.parseFloat(v)
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : v
  }
  const cs = (el) => (el ? getComputedStyle(el) : null)
  const rect = (el) => {
    if (!el) return null
    const r = el.getBoundingClientRect()
    return {
      width: round(r.width),
      height: round(r.height),
      top: round(r.top),
      left: round(r.left),
      right: round(r.right),
    }
  }
  const styleOf = (el, props) => {
    const s = cs(el)
    if (!s) return null
    const out = {}
    for (const p of props) out[p] = s.getPropertyValue(p)
    return out
  }
  const pick = (sels) => {
    for (const s of sels) {
      const el = document.querySelector(s)
      if (el) return el
    }
    return null
  }
  const box = (el) =>
    styleOf(el, [
      'width',
      'height',
      'padding-top',
      'padding-right',
      'padding-bottom',
      'padding-left',
      'margin-top',
      'margin-bottom',
      'background-color',
      'color',
      'border',
      'font-size',
      'font-weight',
      'line-height',
      'gap',
      'display',
      'grid-template-columns',
      'max-width',
    ])

  const breadcrumb = pick(['.woocommerce-breadcrumb'])
  const h1 = pick(['h1.page-title', 'header.woocommerce-products-header h1'])
  const header = pick(['header.woocommerce-products-header', '.page-header'])
  const controlBar = pick([
    '.electro-shop-control-bar',
    '.shop-control-bar-top',
    '.shop-control-bar',
  ])
  const resultCount = pick(['.woocommerce-result-count'])
  const ordering = pick(['form.woocommerce-ordering', '.woocommerce-ordering'])
  const sidebar = pick(['#secondary', '.sidebar', '#sidebar', '.widget-area'])
  const grid = pick(['ul.products'])
  const pagination = pick(['nav.woocommerce-pagination'])
  const contentArea = pick(['#primary', '.content-area'])
  const siteContainer = pick(['.col-full', '.container', '.site-content .col-full'])

  const cards = [...document.querySelectorAll('ul.products li.product')].map((card, i) => {
    const title = card.querySelector('h2, .woocommerce-loop-product__title')
    const price = card.querySelector('.price')
    const saleBadge = card.querySelector('.onsale, .electro-onsale')
    const cat = card.querySelector('.loop-product-categories')
    const img = card.querySelector('img')
    const del = card.querySelector('.price del')
    const ins = card.querySelector('.price ins')
    return {
      i,
      title: title?.textContent?.trim(),
      price: price?.textContent?.trim(),
      saleBadge: saleBadge?.textContent?.trim(),
      categories: cat?.textContent?.trim(),
      rect: rect(card),
      titleStyle: styleOf(title, ['font-size', 'font-weight', 'color', 'line-height']),
      priceStyle: styleOf(price, ['font-size', 'color']),
      delStyle: styleOf(del, ['color', 'text-decoration']),
      insStyle: styleOf(ins, ['color']),
      saleStyle: styleOf(saleBadge, ['background-color', 'color', 'font-size']),
      imgRect: rect(img),
    }
  })

  const widgets = sidebar
    ? [...sidebar.querySelectorAll('.widget')].map((w) => ({
        title: w.querySelector('.widget-title')?.textContent?.trim(),
        class: w.className,
        rect: rect(w),
      }))
    : []

  return {
    extractedAt: new Date().toISOString(),
    url: location.href,
    pageTitle: document.title,
    h1: { text: h1?.textContent?.trim(), style: box(h1), rect: rect(h1) },
    breadcrumb: {
      text: breadcrumb?.textContent?.trim(),
      style: box(breadcrumb),
      rect: rect(breadcrumb),
      links: [...(breadcrumb?.querySelectorAll('a') || [])].map((a) => ({
        text: a.textContent?.trim(),
        href: a.getAttribute('href'),
      })),
    },
    header: { rect: rect(header), style: box(header) },
    controlBar: {
      rect: rect(controlBar),
      style: box(controlBar),
      resultCount: resultCount?.textContent?.trim(),
      resultCountStyle: box(resultCount),
      orderingOptions: [...(ordering?.querySelectorAll('option') || [])].map((o) => ({
        value: o.value,
        text: o.textContent?.trim(),
      })),
    },
    sidebar: { present: !!sidebar, rect: rect(sidebar), style: box(sidebar), widgets },
    grid: {
      rect: rect(grid),
      style: box(grid),
      cardCount: cards.length,
      cardWidth: cards[0]?.rect?.width,
    },
    cards,
    pagination: {
      rect: rect(pagination),
      pages: pagination?.textContent?.trim(),
      style: box(pagination),
    },
    layout: {
      contentArea: rect(contentArea),
      siteContainer: rect(siteContainer),
      containerMaxWidth: box(siteContainer)?.['max-width'],
    },
    colors: {
      body: styleOf(document.body, ['background-color', 'color', 'font-family']),
    },
  }
})

writeFileSync(OUT, `${JSON.stringify(tokens, null, 2)}\n`)
console.log(`wrote ${OUT} (${tokens.grid.cardCount} cards, slug=${slug})`)

await page.screenshot({ path: resolve('refs/live-category.png'), fullPage: true })
console.log('wrote refs/live-category.png')

await browser.close()
