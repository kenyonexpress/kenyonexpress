// UX04 probe: the category panel (1440) and the off-canvas drawer (380 / 768),
// before/after. Every number here is compared with refs/ke_live_home.html's
// stylesheet, not with a picture.
import { chromium } from '@playwright/test'
const BASE = process.env.BASE ?? 'http://localhost:3345'
const browser = await chromium.launch()
const out = {}

const consent = () => {
  localStorage.setItem('ke_consent', JSON.stringify({ v: 1, analytics: false, marketing: false }))
}

const READ = (el, props) => {
  if (!el) return null
  const s = getComputedStyle(el)
  const b = el.getBoundingClientRect()
  const o = {
    x: +b.x.toFixed(1),
    y: +b.y.toFixed(1),
    w: +b.width.toFixed(1),
    h: +b.height.toFixed(1),
  }
  for (const p of props) o[p] = s.getPropertyValue(p)
  return o
}

for (const width of [380, 768]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 })
  await ctx.addInitScript(consent)
  const page = await ctx.newPage()
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  const r = { width }
  const trigger = page.getByRole('button', { name: 'תפריט קטגוריות' })
  r.hamburger = await trigger.evaluate((el) => {
    const s = getComputedStyle(el)
    const svg = el.querySelector('svg')
    const b = el.getBoundingClientRect()
    return {
      x: b.x,
      w: b.width,
      h: b.height,
      color: s.color,
      transition: s.transitionProperty,
      svgW: svg?.getBoundingClientRect().width,
    }
  })
  await trigger.hover()
  await page.waitForTimeout(350)
  r.hamburgerHover = await trigger.evaluate((el) => ({
    color: getComputedStyle(el).color,
    opacity: getComputedStyle(el).opacity,
  }))
  // closed-state scrim: is it hit-tested at its centre?
  r.scrimClosed = await page.evaluate(() => {
    const scrim = [...document.querySelectorAll('button[aria-label="סגירת התפריט"]')].find((b) =>
      b.className.includes('fixed'),
    )
    const s = getComputedStyle(scrim)
    const b = scrim.getBoundingClientRect()
    const at = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)
    return {
      inert: scrim.hasAttribute('inert'),
      ariaHidden: scrim.getAttribute('aria-hidden'),
      opacity: s.opacity,
      pointer: s.pointerEvents,
      hitSelf: at === scrim,
      hit: at ? `${at.tagName.toLowerCase()}.${String(at.className).slice(0, 40)}` : null,
    }
  })
  await trigger.click()
  await page.waitForTimeout(500)
  r.panel = await page.evaluate((READ_SRC) => {
    const READ = new Function(`return ${READ_SRC}`)()
    const dialog = document.querySelector('[role="dialog"][aria-modal="true"]')
    const scrim = [...document.querySelectorAll('button[aria-label="סגירת התפריט"]')].find((b) =>
      b.className.includes('fixed'),
    )
    const links = [...dialog.querySelectorAll('nav a')]
    const first = links[0]
    const title = dialog.querySelector('h2')
    return {
      dialog: READ(dialog, [
        'background-color',
        'border-inline-start-width',
        'border-inline-end-width',
        'border-left-color',
        'border-right-color',
        'border-left-width',
        'border-right-width',
        'transition-duration',
        'transition-timing-function',
        'transition-property',
        'scrollbar-width',
        'z-index',
      ]),
      scrim: READ(scrim, [
        'background-color',
        'opacity',
        'transition-duration',
        'transition-property',
      ]),
      titleRow: READ(title?.parentElement, ['border-bottom-color', 'border-bottom-width']),
      title: READ(title, ['font-size', 'font-weight', 'color']),
      rows: links.length,
      firstRow: READ(first, [
        'padding-left',
        'padding-right',
        'line-height',
        'font-size',
        'color',
        'border-bottom-color',
        'border-bottom-width',
        'background-color',
        'transition-property',
      ]),
    }
  }, READ.toString())
  const firstLink = page.locator('[role="dialog"] nav a').first()
  await firstLink.hover()
  await page.waitForTimeout(350)
  r.rowHover = await firstLink.evaluate((el) => ({
    bg: getComputedStyle(el).backgroundColor,
    color: getComputedStyle(el).color,
  }))
  await page.screenshot({
    path: `logs/ux04/${process.env.TAG ?? 'before'}-drawer-${width}.png`,
    clip: { x: 0, y: 0, width, height: 700 },
  })
  out[width] = r
  await ctx.close()
}

{
  const width = 1440
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 })
  await ctx.addInitScript(consent)
  const page = await ctx.newPage()
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  const r = { width }
  r.panel = await page.evaluate((READ_SRC) => {
    const READ = new Function(`return ${READ_SRC}`)()
    const aside = document.querySelector('aside.departments-menu-v2')
    const bar = aside.querySelector('.vertical-menu-title')
    const nav = aside.querySelector('nav')
    const links = [...aside.querySelectorAll('ul a')]
    return {
      aside: READ(aside, ['width']),
      bar: READ(bar, [
        'background-color',
        'color',
        'font-weight',
        'border-radius',
        'padding-left',
        'padding-right',
      ]),
      barTitle: READ(bar.querySelector('.title'), ['font-weight', 'font-size']),
      navName: nav.getAttribute('aria-label'),
      rows: links.length,
      firstRow: READ(links[0], [
        'font-weight',
        'background-color',
        'color',
        'transition-property',
        'transition-duration',
        'font-size',
      ]),
      fourthRow: READ(links[3], ['font-weight', 'background-color', 'color']),
    }
  }, READ.toString())
  const fourth = page.locator('aside.departments-menu-v2 ul a').nth(3)
  await fourth.hover()
  await page.waitForTimeout(350)
  r.rowHover = await fourth.evaluate((el) => ({
    bg: getComputedStyle(el).backgroundColor,
    fontWeight: getComputedStyle(el).fontWeight,
  }))
  await page.mouse.move(5, 5)
  // Focus-not-obscured: tab to a lower row after scrolling so the sticky header is in play.
  r.focusObscured = await page.evaluate(() => {
    const links = [...document.querySelectorAll('aside.departments-menu-v2 ul a')]
    const last = links[links.length - 1]
    window.scrollTo(0, 2000)
    last.focus()
    const b = last.getBoundingClientRect()
    const at = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)
    return {
      scrollPaddingTop: getComputedStyle(document.documentElement).scrollPaddingTop,
      y: +b.y.toFixed(1),
      hitSelf: at === last || last.contains(at),
      hit: at ? `${at.tagName.toLowerCase()}.${String(at.className).slice(0, 40)}` : null,
      scrollY: window.scrollY,
    }
  })
  await page.screenshot({
    path: `logs/ux04/${process.env.TAG ?? 'before'}-panel-1440.png`,
    clip: { x: 1000, y: 140, width: 440, height: 480 },
  })
  out[width] = r
  await ctx.close()
}
await browser.close()
console.log(JSON.stringify(out, null, 2))
