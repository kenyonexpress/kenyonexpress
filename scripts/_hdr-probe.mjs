// Measure the header stack (topbar + masthead rows) on the live site and on ours,
// so the 70px content-offset gap can be attributed to specific rows.
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache
}

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 1 })

const probe = async (label, url, sels) => {
  const p = await ctx.newPage()
  try {
    await p.goto(url, { waitUntil: 'networkidle', timeout: 90000 })
  } catch {
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 })
  }
  await p.waitForTimeout(url.includes('localhost') ? 1500 : 3500)
  const out = await p.evaluate((sels) => {
    const r = (el) => {
      if (!el) return null
      const b = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return {
        top: +(b.top + scrollY).toFixed(1),
        h: +b.height.toFixed(1),
        w: +b.width.toFixed(1),
        py: `${cs.paddingTop}/${cs.paddingBottom}`,
        mh: cs.minHeight,
      }
    }
    const pick = (list) => {
      for (const s of list) {
        const el = document.querySelector(s)
        if (el) return { sel: s, ...r(el) }
      }
      return null
    }
    const firstContent =
      document.querySelector(
        '.woocommerce-breadcrumb, .category-breadcrumb, nav.category-breadcrumb',
      ) || document.querySelector('main')
    return {
      topbar: pick(sels.topbar),
      masthead: pick(sels.masthead),
      headerWhole: pick(sels.header),
      firstContentTop: firstContent
        ? +(firstContent.getBoundingClientRect().top + scrollY).toFixed(1)
        : null,
    }
  }, sels)
  await p.close()
  console.log(`\n### ${label}`)
  console.log(JSON.stringify(out, null, 1))
}

await probe('LIVE', 'https://kenyonexpress.co.il/product-category/hot-deals/', {
  topbar: ['.electro-header-bar', '#topbar', '.top-bar', '.header-top'],
  masthead: ['.masthead', '#masthead', '.site-header'],
  header: ['header', '#masthead', '.site-header'],
})
await probe('MINE', 'http://localhost:3000/category/hot-deals', {
  topbar: ['[class*="topbar" i]', '[class*="TopBar"]', '.top-bar'],
  masthead: ['[class*="masthead" i]', 'header > div', '.main-header'],
  header: ['header', '[class*="SiteHeader"]'],
})
await b.close()
