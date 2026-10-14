import { writeFileSync } from 'node:fs'
// UX15 probe: the product detail page's buy column and gallery at 380 / 768 /
// 1440 on a built server. It reads what the page actually offers a shopper:
// whether the gallery magnifies under a resting mouse pointer (not only on a
// tap), how the thumbnails lay out (wrapping rows or one scroll strip), what
// the quantity control is (a bare number field or a stepper), whether the
// variant picker is a labelled group with a pressed state, and whether a buy
// bar follows the shopper once the buy row has scrolled off the top. The same
// script runs before and after, so the two JSON files diff cleanly.
import { chromium } from '@playwright/test'
const BASE = process.env.BASE ?? 'http://localhost:3350'
const TAG = process.env.TAG ?? 'before'
const PATH = process.env.PRODUCT ?? '/product/6253'
const WIDTHS = (process.env.WIDTHS ?? '380,768,1440').split(',').map(Number)
const browser = await chromium.launch()
const out = {}
const consent = () => {
  localStorage.setItem('ke_consent', JSON.stringify({ v: 1, analytics: false, marketing: false }))
  document.cookie = 'ke_consent=denied; path=/'
}
for (const width of WIDTHS) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: 1,
    locale: 'he-IL',
    hasTouch: width < 768,
  })
  await ctx.addInitScript(consent)
  const page = await ctx.newPage()
  await page.goto(`${BASE}${PATH}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  const frame = page.locator('.pdp-gallery__frame')
  const atRest = await page.evaluate(() => {
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
    const frame = document.querySelector('.pdp-gallery__frame')
    const zoom = document.querySelector('.pdp-gallery__zoom')
    const thumbs = document.querySelector('.pdp-gallery__thumbs')
    const thumbStyle = thumbs ? getComputedStyle(thumbs) : null
    const qty = document.querySelector('.pdp-buy__qty')
    const buy = document.querySelector('.pdp-buy')
    const steppers = [...document.querySelectorAll('.pdp-buy button')]
      .filter((b) => !b.classList.contains('pdp-buy__atc'))
      .map((b) => ({ label: b.getAttribute('aria-label'), rect: rect(b), disabled: b.disabled }))
    const atc = document.querySelector('.pdp-buy__atc')
    const variants = document.querySelector('.pdp-summary__variants')
    const sticky = document.querySelector('[data-pdp-sticky]')
    return {
      frame: rect(frame),
      frameCursor: frame ? getComputedStyle(frame).cursor : null,
      zoomedAttr: frame?.getAttribute('data-zoomed') ?? null,
      zoomTransform: zoom ? getComputedStyle(zoom).transform : null,
      thumbs: thumbs
        ? {
            count: thumbs.querySelectorAll('.pdp-gallery__thumb').length,
            display: thumbStyle.display,
            flexWrap: thumbStyle.flexWrap,
            overflowX: thumbStyle.overflowX,
            scrollSnapType: thumbStyle.scrollSnapType,
            rect: rect(thumbs),
            current: [...thumbs.querySelectorAll('.pdp-gallery__thumb')].findIndex(
              (b) => b.getAttribute('aria-current') === 'true',
            ),
          }
        : null,
      qty: qty
        ? {
            tag: qty.tagName.toLowerCase(),
            type: qty.getAttribute('type'),
            inputMode: qty.getAttribute('inputmode'),
            min: qty.getAttribute('min'),
            max: qty.getAttribute('max'),
            rect: rect(qty),
            group: rect(qty.closest('.pdp-buy__qty-group')),
          }
        : null,
      steppers,
      buyRow: rect(buy),
      atc: atc ? { text: atc.textContent.trim(), rect: rect(atc), disabled: atc.disabled } : null,
      variants: variants
        ? {
            tag: variants.tagName.toLowerCase(),
            role: variants.getAttribute('role'),
            labelled: variants.getAttribute('aria-labelledby'),
            buttons: [...variants.querySelectorAll('button')].map((b) => ({
              text: b.textContent.trim(),
              pressed: b.getAttribute('aria-pressed'),
              disabled: b.disabled,
            })),
          }
        : null,
      stickyAtTop: sticky ? rect(sticky) : null,
      statusRegion: !!document.querySelector('.pdp-buy output, .pdp-buy [role="status"]'),
    }
  })
  // A resting mouse over the photo: does it magnify? (width >= 768 only; a
  // phone context has no hover.)
  let hover = null
  if (width >= 768 && (await frame.count()) > 0) {
    const box = await frame.boundingBox()
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.75)
    await page.waitForTimeout(250)
    hover = await page.evaluate(() => {
      const frame = document.querySelector('.pdp-gallery__frame')
      const zoom = document.querySelector('.pdp-gallery__zoom')
      return {
        zoomedAttr: frame?.getAttribute('data-zoomed') ?? null,
        zoomMode: frame?.getAttribute('data-zoom-mode') ?? null,
        transform: zoom?.style.transform || null,
        origin: zoom?.style.transformOrigin || null,
        cursor: frame ? getComputedStyle(frame).cursor : null,
      }
    })
    // A click while hovering must pin nothing.
    await page.mouse.down()
    await page.mouse.up()
    await page.waitForTimeout(100)
    hover.afterClick = await page.evaluate(() => ({
      zoomMode:
        document.querySelector('.pdp-gallery__frame')?.getAttribute('data-zoom-mode') ?? null,
    }))
    await page.mouse.move(5, 5)
    await page.waitForTimeout(250)
    hover.afterLeave = await page.evaluate(() => ({
      zoomedAttr:
        document.querySelector('.pdp-gallery__frame')?.getAttribute('data-zoomed') ?? null,
      transform: document.querySelector('.pdp-gallery__zoom')?.style.transform || null,
    }))
  }
  await page.screenshot({ path: `logs/ux15/${TAG}-${width}.png` })
  // Scroll past the buy row: does a bar follow?
  const scrolled = await page.evaluate(async () => {
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
    const buy = document.querySelector('.pdp-buy')
    if (!buy) return null
    const top = buy.getBoundingClientRect().top + window.scrollY
    window.scrollTo(0, top + buy.getBoundingClientRect().height + 600)
    await new Promise((r) => setTimeout(r, 500))
    const sticky = document.querySelector('[data-pdp-sticky]')
    const cartBar = document.querySelector('[data-mobile-cart-bar]')
    const button = sticky?.querySelector('button')
    return {
      scrollY: window.scrollY,
      sticky: sticky
        ? {
            rect: rect(sticky),
            position: getComputedStyle(sticky).position,
            bottom: getComputedStyle(sticky).bottom,
            zIndex: getComputedStyle(sticky).zIndex,
            text: sticky.textContent.trim().slice(0, 120),
            button: button
              ? { text: button.textContent.trim(), rect: rect(button), disabled: button.disabled }
              : null,
            bodyClass: document.body.className,
            bodyPaddingBottom: getComputedStyle(document.body).paddingBottom,
          }
        : null,
      cartBar: cartBar ? rect(cartBar) : null,
    }
  })
  await page.screenshot({ path: `logs/ux15/${TAG}-scrolled-${width}.png` })
  // And back to the top: the bar must leave when the buy row is on screen.
  const backAtTop = await page.evaluate(async () => {
    window.scrollTo(0, 0)
    await new Promise((r) => setTimeout(r, 400))
    return { sticky: !!document.querySelector('[data-pdp-sticky]') }
  })
  out[width] = { path: PATH, atRest, hover, scrolled, backAtTop }
  await ctx.close()
}
await browser.close()
writeFileSync(`logs/ux15/${TAG}.json`, `${JSON.stringify(out, null, 2)}\n`)
console.log(JSON.stringify(out, null, 2))
