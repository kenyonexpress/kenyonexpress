import { writeFileSync } from 'node:fs'
// UX13 probe: the site footer at 380 / 768 / 1440 on a built server. It reads
// what the footer actually paints: how many link columns the desktop grid
// resolves to, how many disclosure rows a phone gets and whether they are
// closed, the social links (label, href, size), the payment row (text badges
// or marks) and the handheld dark bar. Before UX13: three columns at lg, two
// `<details>` rows below it, payment as four text badges on the desktop bar
// only. The same script runs after, so the two JSON files diff cleanly.
import { chromium } from '@playwright/test'
const BASE = process.env.BASE ?? 'http://localhost:3347'
const TAG = process.env.TAG ?? 'before'
const WIDTHS = (process.env.WIDTHS ?? '380,768,1440').split(',').map(Number)
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
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  const footer = page.locator('footer').last()
  await footer.scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  const data = await footer.evaluate((root) => {
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
    // checkVisibility, not a rect: content under a closed <details> keeps a
    // layout box in Chromium 131+ while content-visibility hides the paint,
    // which is exactly what a rect-based "visible" missed (see details-probe.mjs).
    const visible = (el) => {
      if (!el) return false
      const b = el.getBoundingClientRect()
      return (
        b.width > 0 &&
        b.height > 0 &&
        el.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true })
      )
    }
    const grid = root.querySelector('[data-footer-columns]') ?? root.querySelector('.grid')
    const gridStyle = grid ? getComputedStyle(grid) : null
    const columns = grid ? [...grid.children].filter(visible) : []
    const details = [...root.querySelectorAll('details')].map((d) => ({
      title: d.querySelector('summary')?.textContent?.trim() ?? '',
      open: d.open,
      summaryVisible: visible(d.querySelector('summary')),
      summaryH: rect(d.querySelector('summary'))?.h ?? null,
      links: d.querySelectorAll('a').length,
      linksVisible: [...d.querySelectorAll('a')].filter(visible).length,
      chevron: visible(d.querySelector('summary svg')),
    }))
    const headings = [...root.querySelectorAll('h2, summary')]
      .filter(visible)
      .map((h) => h.textContent?.trim() ?? '')
    const socialRow = [...root.querySelectorAll('a[target="_blank"]')].filter(
      (a) => a.getAttribute('aria-label') && a.querySelector('svg'),
    )
    const socials = socialRow.map((a) => ({
      label: a.getAttribute('aria-label'),
      href: a.getAttribute('href'),
      rel: a.getAttribute('rel'),
      visible: visible(a),
      size: rect(a),
      bg: getComputedStyle(a).backgroundColor,
    }))
    const payLists = [...root.querySelectorAll('[aria-label="אמצעי תשלום"]')]
    const payment = payLists.map((ul) => ({
      visible: visible(ul),
      items: [...ul.querySelectorAll('li')].map((li) => ({
        text: li.textContent?.trim() ?? '',
        svg: li.querySelectorAll('svg').length,
        img: li.querySelectorAll('img').length,
        label:
          li.querySelector('[role="img"]')?.getAttribute('aria-label') ??
          li.querySelector('svg title')?.textContent ??
          null,
        size: rect(li),
      })),
    }))
    const handheld = [...root.querySelectorAll('div')].find(
      (d) => d.className.includes('bg-footer-bg') && d.className.includes('lg:hidden'),
    )
    const bottom = [...root.querySelectorAll('div')].find((d) =>
      d.className.includes('bg-bottom-bar'),
    )
    const newsletter = root.querySelector('form')
    return {
      footer: rect(root),
      dir: root.getAttribute('dir'),
      grid: grid
        ? {
            templateColumns: gridStyle.gridTemplateColumns,
            resolvedColumns: gridStyle.gridTemplateColumns.split(' ').length,
            visibleChildren: columns.length,
            childRects: columns.map(rect),
          }
        : null,
      details,
      headings,
      socials,
      payment,
      handheldBar: handheld ? { visible: visible(handheld), rect: rect(handheld) } : null,
      bottomBar: bottom ? { visible: visible(bottom), rect: rect(bottom) } : null,
      newsletterVisible: visible(newsletter),
      deadHrefs: [...root.querySelectorAll('a[href="#"]')].map(
        (a) => a.getAttribute('aria-label') ?? a.textContent?.trim(),
      ),
    }
  })
  await footer.screenshot({ path: `logs/ux13/${TAG}-${width}.png` })
  out[width] = data
  await ctx.close()
}
await browser.close()
writeFileSync(`logs/ux13/${TAG}.json`, `${JSON.stringify(out, null, 2)}\n`)
console.log(JSON.stringify(out, null, 2))
