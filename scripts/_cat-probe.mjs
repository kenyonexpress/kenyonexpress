// One-off probe: dump the category archive skeleton (rects of the main blocks)
// from the live site and from localhost, so layout deltas are read off measured
// numbers instead of guessed from a screenshot.
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache
}

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1440, height: 2600 }, deviceScaleFactor: 1 })

const probe = async (label, url) => {
  const p = await ctx.newPage()
  try {
    await p.goto(url, { waitUntil: 'networkidle', timeout: 120000 })
  } catch {
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 })
  }
  await p.waitForTimeout(url.includes('localhost') ? 2000 : 4000)
  const out = await p.evaluate(() => {
    const r = (el) => {
      if (!el) return null
      const b = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return {
        tag: `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]}`,
        top: +(b.top + window.scrollY).toFixed(1),
        left: +b.left.toFixed(1),
        w: +b.width.toFixed(1),
        h: +b.height.toFixed(1),
        display: cs.display,
        minH: cs.minHeight,
      }
    }
    const pick = (...sels) => {
      for (const s of sels) {
        const el = document.querySelector(s)
        if (el) return r(el)
      }
      return null
    }
    // Anything that occupies a big vertical slice is worth seeing, so also dump
    // the tallest blocks in document order.
    const tall = [...document.querySelectorAll('body *')]
      .map((el) => ({ el, b: el.getBoundingClientRect() }))
      .filter((x) => x.b.height > 300 && x.b.width > 200)
      .slice(0, 40)
      .map((x) => r(x.el))
    return {
      docHeight: document.documentElement.scrollHeight,
      breadcrumb: pick(
        '.woocommerce-breadcrumb',
        '.category-breadcrumb',
        'nav[aria-label*="breadcrumb" i]',
      ),
      title: pick('h1.page-title', 'h1'),
      controlBar: pick('.electro-sort-bar', '.category-page__control-bar', '.woocommerce-ordering'),
      sidebar: pick('#sidebar', '.sidebar-shop', 'aside', '.category-filter-sidebar'),
      grid: pick('ul.products', '.category-products'),
      firstCard: pick('ul.products li.product', '.category-products__item'),
      footer: pick('footer', '.site-footer'),
      newsletter: pick('.newsletter', '.footer-newsletter', '[class*="newsletter" i]'),
      productCount: document.querySelectorAll('ul.products li.product, .category-products__item')
        .length,
      tall,
    }
  })
  await p.close()
  console.log(`\n===== ${label} :: ${url}`)
  console.log(JSON.stringify(out, null, 1))
}

await probe('LIVE', 'https://kenyonexpress.co.il/product-category/hot-deals/')
await probe('MINE', 'http://localhost:3000/category/hot-deals')
await b.close()
