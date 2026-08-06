import { writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

// QA the local site (dev server must be running with a live DB):
//   node scripts/qa-local-site.mjs
// Writes to ~/Downloads: qa-console-errors.md, qa-rtl-issues.md,
// and qa-shot-<route>-<width>.png per page. Visual diff vs electro is
// covered by the existing compare scripts (scripts/compare*.mjs).

const BASE = process.env.QA_BASE || 'http://localhost:3000'
const OUT = join(homedir(), 'Downloads')
const VIEWPORTS = [1440, 390]
const ROUTES = ['/', '/cart', '/checkout', '/login']

const browser = await chromium.launch({ args: ['--no-proxy-server'] })
const consoleReport = [
  `# QA: console errors (${new Date().toISOString().slice(0, 10)})`,
  '',
  `Base: ${BASE}`,
  '',
]
const rtlReport = [
  `# QA: RTL issues (${new Date().toISOString().slice(0, 10)})`,
  '',
  `Base: ${BASE}`,
  '',
]

// discover one product + one category from the homepage
const disc = await browser.newPage()
let extra = []
try {
  await disc.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 45000 })
} catch {}
try {
  extra = await disc.evaluate(() => {
    const pick = (sel) => document.querySelector(sel)?.getAttribute('href')
    return [pick('a[href*="/product/"]'), pick('a[href*="/category/"]')].filter(Boolean)
  })
} catch {}
await disc.close()
const routes = [...new Set([...ROUTES, ...extra])]

for (const width of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width, height: width < 500 ? 844 : 900 } })
  for (const r of routes) {
    const errs = []
    const failed = []
    page.on('console', (m) => {
      if (['error', 'warning'].includes(m.type()))
        errs.push(`[${m.type()}] ${m.text().slice(0, 250)}`)
    })
    page.on('pageerror', (e) => errs.push(`[pageerror] ${String(e).slice(0, 250)}`))
    page.on('requestfailed', (q) =>
      failed.push(`${q.method()} ${q.url().slice(0, 120)} :: ${q.failure()?.errorText}`),
    )
    let status = 'TIMEOUT'
    try {
      const resp = await page.goto(`${BASE}${r}`, { waitUntil: 'networkidle', timeout: 45000 })
      status = resp?.status()
      await page.waitForTimeout(2000)
    } catch (e) {
      errs.push(`[nav] ${String(e).slice(0, 150)}`)
    }
    const slug = r.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'home'
    try {
      await page.screenshot({ path: join(OUT, `qa-shot-${slug}-${width}.png`), fullPage: true })
    } catch {}

    consoleReport.push(`## ${r} @ ${width}px (HTTP ${status})`, '')
    const uniq = [...new Set(errs)]
    consoleReport.push(...(uniq.length ? uniq.map((e) => `- ${e}`) : ['- clean']), '')
    if (failed.length)
      consoleReport.push(
        'failed requests:',
        ...[...new Set(failed)].slice(0, 10).map((f) => `- ${f}`),
        '',
      )

    const rtl = await page
      .evaluate(() => {
        const issues = []
        const html = document.documentElement
        if (html.getAttribute('dir') !== 'rtl')
          issues.push(`html dir="${html.getAttribute('dir')}", expected rtl`)
        if (document.body.scrollWidth > innerWidth + 2)
          issues.push(
            `horizontal scroll: body ${document.body.scrollWidth}px vs viewport ${innerWidth}px`,
          )
        let n = 0
        for (const el of document.querySelectorAll('*')) {
          const r2 = el.getBoundingClientRect()
          if (r2.width > 10 && (r2.right > innerWidth + 8 || r2.left < -8)) {
            issues.push(
              `overflows viewport: ${el.tagName.toLowerCase()}.${String(el.className).trim().split(/\s+/)[0] || ''} (${Math.round(r2.left)}..${Math.round(r2.right)})`,
            )
            if (++n >= 8) break
          }
        }
        for (const el of document.querySelectorAll('[dir="ltr"]')) {
          if (
            !el.closest('[data-allow-ltr]') &&
            !/^\+?[\d\s-]+$|@|http/.test(el.textContent || '')
          ) {
            issues.push(
              `suspicious dir=ltr on ${el.tagName.toLowerCase()} "${(el.textContent || '').trim().slice(0, 40)}"`,
            )
          }
        }
        return issues
      })
      .catch(() => ['page did not render, see console report'])
    rtlReport.push(
      `## ${r} @ ${width}px`,
      '',
      ...(rtl.length ? rtl.map((i) => `- ${i}`) : ['- clean']),
      '',
    )
    page.removeAllListeners('console')
    page.removeAllListeners('pageerror')
    page.removeAllListeners('requestfailed')
  }
  await page.close()
}

writeFileSync(join(OUT, 'qa-console-errors.md'), `${consoleReport.join('\n')}\n`)
writeFileSync(join(OUT, 'qa-rtl-issues.md'), `${rtlReport.join('\n')}\n`)
console.error('Done: qa-console-errors.md, qa-rtl-issues.md + screenshots in ~/Downloads')
await browser.close()
