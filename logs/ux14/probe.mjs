import { writeFileSync } from 'node:fs'
// UX14 probe: the product listing page controls at 380 / 768 / 1440 on a built
// server, for /products and one real category. It reads what the control bar,
// the sidebar, the grid and the pagination actually render: whether the view
// switcher is real (buttons with a pressed state) or decoration (aria-hidden
// spans), which sort options the select offers, how wide a card is, whether an
// active filter is shown anywhere outside the collapsed sidebar, and what the
// pagination items are labelled. The same script runs before and after.
import { chromium } from '@playwright/test'
const BASE = process.env.BASE ?? 'http://localhost:3349'
const TAG = process.env.TAG ?? 'before'
const WIDTHS = (process.env.WIDTHS ?? '380,768,1440').split(',').map(Number)
const PATHS = (
  process.env.PATHS ?? '/products,/products?type=coupon&min=50,/category/restaurants-cafes'
).split(',')
const browser = await chromium.launch()
const out = {}
const consent = () => {
  localStorage.setItem('ke_consent', JSON.stringify({ v: 1, analytics: false, marketing: false }))
}
for (const width of WIDTHS) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: 1,
    locale: 'he-IL',
  })
  await ctx.addInitScript(consent)
  const page = await ctx.newPage()
  for (const path of PATHS) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
    await page
      .waitForSelector(
        '.category-page__count:not(.category-page__count--pending), .category-page__empty',
        { timeout: 20000 },
      )
      .catch(() => undefined)
    await page.waitForTimeout(300)
    const data = await page.evaluate(() => {
      const rect = (el) => {
        if (!el) return null
        const b = el.getBoundingClientRect()
        return {
          x: +b.x.toFixed(1),
          y: +b.y.toFixed(1),
          w: +b.width.toFixed(1),
          h: +b.height.toFixed(1),
        }
      }
      const visible = (el) => {
        if (!el) return false
        const b = el.getBoundingClientRect()
        return (
          b.width > 0 &&
          b.height > 0 &&
          el.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true })
        )
      }
      const bar = document.querySelector('.category-control-bar')
      const switcher = document.querySelector('.category-view-switcher')
      const select = document.querySelector('.category-control-bar__select')
      const items = [...document.querySelectorAll('.category-products__item')]
      const cards = items.map((li) => li.querySelector('.category-card'))
      const pag = document.querySelector('.category-pagination')
      const summary = document.querySelector('.category-sidebar__summary')
      const chips = document.querySelector('[data-active-filters]')
      return {
        url: location.pathname + location.search,
        bar: { rect: rect(bar), visible: visible(bar) },
        switcher: switcher
          ? {
              visible: visible(switcher),
              rect: rect(switcher),
              ariaHidden: switcher.getAttribute('aria-hidden'),
              role: switcher.getAttribute('role'),
              label: switcher.getAttribute('aria-label'),
              children: [...switcher.children].map((c) => ({
                tag: c.tagName.toLowerCase(),
                pressed: c.getAttribute('aria-pressed'),
                label: c.getAttribute('aria-label'),
                active: c.classList.contains('is-active'),
                rect: rect(c),
              })),
            }
          : null,
        select: select
          ? {
              rect: rect(select),
              value: select.value,
              options: [...select.options].map((o) => o.value),
            }
          : null,
        filtersLink: (() => {
          const a = document.querySelector('.category-control-bar__filters')
          return a
            ? { visible: visible(a), text: a.textContent.trim(), href: a.getAttribute('href') }
            : null
        })(),
        grid: {
          count: items.length,
          firstItemRect: rect(items[0]),
          secondItemRect: rect(items[1]),
          dataView:
            document.querySelector('.category-page__body')?.getAttribute('data-view') ?? null,
          cardClasses: cards[0]?.className ?? null,
          descShown: cards.filter((c) => visible(c?.querySelector('.category-card__desc'))).length,
        },
        pagination: pag
          ? {
              rect: rect(pag),
              items: [...pag.querySelectorAll('a, span')].map((el) => ({
                tag: el.tagName.toLowerCase(),
                text: el.textContent.trim(),
                label: el.getAttribute('aria-label'),
                current: el.getAttribute('aria-current'),
                rect: rect(el),
              })),
              listTag: pag.firstElementChild?.tagName.toLowerCase(),
            }
          : null,
        sidebar: {
          summaryText: summary?.textContent.trim() ?? null,
          open: document.querySelector('.category-sidebar__disclosure')?.open ?? null,
          pressed: [...document.querySelectorAll('.category-sidebar [aria-pressed="true"]')].map(
            (b) => b.textContent.trim(),
          ),
          priceError:
            document.querySelector('.category-sidebar [role="alert"]')?.textContent.trim() ?? null,
        },
        activeFilters: chips
          ? {
              visible: visible(chips),
              text: chips.textContent.trim().replace(/\s+/g, ' '),
              links: chips.querySelectorAll('a').length,
            }
          : null,
      }
    })
    const key = `${width}|${path}`
    out[key] = data
    if (path === '/products') {
      await page
        .locator('.category-control-bar')
        .screenshot({ path: `logs/ux14/${TAG}-bar-${width}.png` })
        .catch(() => undefined)
      await page.screenshot({ path: `logs/ux14/${TAG}-${width}.png`, fullPage: false })
    }
  }
  await ctx.close()
}
await browser.close()
writeFileSync(`logs/ux14/${TAG}.json`, `${JSON.stringify(out, null, 2)}\n`)
console.log(JSON.stringify(out, null, 2))
