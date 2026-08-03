// One-off probe: does the live archive template render a shop sidebar at all?
// Checks several live category URLs so a single collection page cannot mislead.
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache
}

const urls = [
  'https://kenyonexpress.co.il/product-category/hot-deals/',
  'https://kenyonexpress.co.il/product-category/restaurants-cafes/',
  'https://kenyonexpress.co.il/product-category/electronics/',
  'https://kenyonexpress.co.il/shop/',
]

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1440, height: 2600 }, deviceScaleFactor: 1 })

for (const url of urls) {
  const p = await ctx.newPage()
  try {
    await p.goto(url, { waitUntil: 'networkidle', timeout: 90000 })
  } catch {
    try {
      await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 })
    } catch {
      console.log(`${url}  -> UNREACHABLE`)
      await p.close()
      continue
    }
  }
  await p.waitForTimeout(3500)
  const out = await p.evaluate(() => {
    const r = (el) => {
      if (!el) return null
      const b = el.getBoundingClientRect()
      return {
        cls: el.className.toString().slice(0, 60),
        top: +(b.top + scrollY).toFixed(0),
        left: +b.left.toFixed(0),
        w: +b.width.toFixed(0),
        h: +b.height.toFixed(0),
      }
    }
    const main = document.querySelector('main.site-main, .content-area')
    const shopSidebar = document.querySelector(
      '#sidebar-shop, .sidebar-shop, aside#secondary, .widget-area',
    )
    const inner = document.querySelector('.site-content-inner')
    return {
      title: document.title.slice(0, 50),
      products: document.querySelectorAll('ul.products li.product').length,
      main: r(main),
      inner: r(inner),
      shopSidebar: r(shopSidebar),
      // Any aside that sits ABOVE the footer is a real content sidebar.
      asidesAboveFooter: [...document.querySelectorAll('aside')]
        .map((el) => r(el))
        .filter(
          (x) =>
            x &&
            x.top <
              (document.querySelector('footer')?.getBoundingClientRect().top ?? 1e9) + scrollY,
        ),
      ordering: r(document.querySelector('.woocommerce-ordering')),
      pagination: r(document.querySelector('.woocommerce-pagination, nav.pagination')),
    }
  })
  console.log(`\n### ${url}`)
  console.log(JSON.stringify(out, null, 1))
  await p.close()
}
await b.close()
