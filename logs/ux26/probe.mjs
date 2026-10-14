import { writeFileSync } from 'node:fs'
// UX26 probe: the page a shopper lands on when a server render throws, at
// 380 / 768 / 1440 on a built server with the debug-throw gate on, anonymous.
// Opens the root throw route (/debug/sentry/render, no layout but the root
// one), the storefront throw route (/debug/sentry/store-render, inside
// StoreShell; 404 before UX26) and /status (404 before UX26), and reads what
// the error page offers: the chrome (header, footer, skip link), the heading,
// every link and button with its box, the status region and what it says
// after the health probe, the support button, the digest, page errors. The
// same script runs before and after.
import { chromium } from '@playwright/test'

const BASE = process.env.BASE ?? 'http://localhost:3364'
const TAG = process.env.TAG ?? 'before'
const WIDTHS = (process.env.WIDTHS ?? '380,768,1440').split(',').map(Number)
const PATHS = {
  rootThrow: '/debug/sentry/render',
  storeThrow: '/debug/sentry/store-render',
  status: '/status',
}

const browser = await chromium.launch()
const out = {}
const CONSENT = { name: 'ke_consent', value: 'denied.2', domain: 'localhost', path: '/' }

const shapeFn = `(() => {
  const rect = (el) => {
    if (!el) return null
    const b = el.getBoundingClientRect()
    return { x: +b.x.toFixed(1), y: +(b.y + window.scrollY).toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }
  }
  const visible = (el) => !!el && el.getClientRects().length > 0
  const q = (s) => document.querySelector(s)
  const main = q('main') ?? document.body
  const links = [...main.querySelectorAll('a')].filter(visible).map((a) => ({ href: a.getAttribute('href'), text: a.textContent.trim().slice(0, 50), rect: rect(a), target: a.getAttribute('target') }))
  const buttons = [...main.querySelectorAll('button')].filter(visible).map((b) => ({ text: (b.getAttribute('aria-label') ?? b.textContent).trim().slice(0, 40), rect: rect(b) }))
  const status = main.querySelector('[data-error-status], [data-status-panel]')
  const support = main.querySelector('[data-error-support]')
  const digest = main.querySelector('[data-error-digest]') ?? [...main.querySelectorAll('p[dir="ltr"]')].pop()
  return {
    url: location.pathname,
    title: document.title,
    htmlDir: document.documentElement.getAttribute('dir'),
    mainDir: main.getAttribute('dir'),
    mains: document.querySelectorAll('main').length,
    robots: q('meta[name="robots"]')?.getAttribute('content') ?? null,
    header: !!q('header'),
    footer: !!q('footer'),
    skipLink: !!q('a[href="#main-content"]'),
    h1: q('h1')?.textContent.trim() ?? null,
    headings: [...main.querySelectorAll('h1, h2, h3')].map((h) => ({ tag: h.tagName, text: h.textContent.trim().slice(0, 60), rect: rect(h) })),
    brandMark: !!main.querySelector('[data-error-mark], [data-status-mark]'),
    statusRegion: status ? { rect: rect(status), role: status.getAttribute('role'), live: status.getAttribute('aria-live'), state: status.getAttribute('data-state'), text: status.textContent.trim().slice(0, 160) } : null,
    statusLink: links.find((l) => l.href === '/status') ?? null,
    support: support ? { tag: support.tagName, href: support.getAttribute('href'), text: support.textContent.trim().slice(0, 60), rect: rect(support) } : null,
    contactLink: links.find((l) => (l.href ?? '').startsWith('/contact')) ?? null,
    homeLink: links.find((l) => l.href === '/') ?? null,
    retryButton: buttons.find((b) => b.text === 'נסו שוב') ?? null,
    digest: digest ? digest.textContent.trim().slice(0, 80) : null,
    links,
    buttons,
    pageHeight: document.documentElement.scrollHeight,
    scrollWidth: document.documentElement.scrollWidth,
  }
})()`

for (const width of WIDTHS) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: 1,
    locale: 'he-IL',
    hasTouch: width < 768,
  })
  await ctx.addCookies([CONSENT])
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)))
  const w = {}
  out[width] = w
  for (const [key, path] of Object.entries(PATHS)) {
    const res = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
    // The health probe answers after mount; give the region its answer.
    await page.waitForTimeout(1500)
    const shape = await page.evaluate(shapeFn)
    w[key] = { status: res?.status() ?? null, ...shape }
    await page.screenshot({ path: `logs/ux26/${TAG}-${width}-${key}.png`, fullPage: true })
  }
  w.pageErrors = errors
  await ctx.close()
}

await browser.close()
writeFileSync(`logs/ux26/${TAG}.json`, `${JSON.stringify(out, null, 2)}\n`)
console.log(JSON.stringify(out, null, 1).slice(0, 6000))
