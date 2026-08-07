import { existsSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

// Captures the live checkout and writes refs/live-checkout.png +
// refs/checkout-measured.json.
//
// The live /checkout/ redirects to /cart/ when the cart is empty, which is why
// every earlier attempt to reference this page produced a picture of the cart.
// A product is added over the WooCommerce `?add-to-cart=` GET first, in the
// same browser context, so the page under measurement is the real one.

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache
}

const ADD_TO_CART_ID = process.env.LIVE_ATC_ID ?? '6166'
const VIEW = { width: 1440, height: 2600 }

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: VIEW, deviceScaleFactor: 1 })
const p = await ctx.newPage()

await p.goto(`https://kenyonexpress.co.il/?add-to-cart=${ADD_TO_CART_ID}&quantity=1`, {
  waitUntil: 'domcontentloaded',
  timeout: 120000,
})
await p.goto('https://kenyonexpress.co.il/checkout/', {
  waitUntil: 'domcontentloaded',
  timeout: 120000,
})
await p.waitForTimeout(5000)

if (!p.url().includes('/checkout')) {
  console.error(`REFUSING to measure: /checkout/ redirected to ${p.url()} (cart did not stick).`)
  process.exit(3)
}

const measured = await p.evaluate(() => {
  const box = (sel) => {
    const e = document.querySelector(sel)
    if (!e) return null
    const r = e.getBoundingClientRect()
    const s = getComputedStyle(e)
    return {
      sel,
      top: Math.round(r.top + scrollY),
      left: Math.round(r.left),
      w: Math.round(r.width),
      h: Math.round(r.height),
      font: `${s.fontSize} / ${s.lineHeight} ${s.fontWeight}`,
      family: s.fontFamily.split(',')[0].replace(/["']/g, ''),
      color: s.color,
      bg: s.backgroundColor,
      border: s.borderTopWidth === '0px' ? null : `${s.borderTopWidth} ${s.borderTopColor}`,
      radius: s.borderTopLeftRadius,
      padding: `${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft}`,
      margin: `${s.marginTop} ${s.marginRight} ${s.marginBottom} ${s.marginLeft}`,
    }
  }
  const fields = [...document.querySelectorAll('.woocommerce-billing-fields p.form-row')].map(
    (row) => {
      const input = row.querySelector('input, select, textarea')
      const label = row.querySelector('label')
      const r = row.getBoundingClientRect()
      const ir = input?.getBoundingClientRect()
      const is = input ? getComputedStyle(input) : null
      return {
        id: input?.id ?? null,
        label: label?.textContent?.trim() ?? null,
        required: row.classList.contains('validate-required'),
        rowW: Math.round(r.width),
        rowLeft: Math.round(r.left),
        rowTop: Math.round(r.top + scrollY),
        inputH: ir ? Math.round(ir.height) : null,
        inputBg: is?.backgroundColor ?? null,
        inputBorder: is ? `${is.borderTopWidth} ${is.borderTopColor}` : null,
        inputRadius: is?.borderTopLeftRadius ?? null,
        inputFont: is ? `${is.fontSize} ${is.fontFamily.split(',')[0].replace(/["']/g, '')}` : null,
        inputPadding: is ? `${is.paddingTop} ${is.paddingRight}` : null,
      }
    },
  )
  // The accent under each h3 is a pseudo-element, so it has no box to query.
  // Its geometry is the only thing that says whether the yellow rule is the
  // width of the heading text or a fixed segment, and guessing it wrong is
  // visible on every section.
  const accent = (sel) => {
    const e = document.querySelector(sel)
    if (!e) return null
    const s = getComputedStyle(e, '::after')
    if (s.content === 'none') return null
    return {
      sel: `${sel}::after`,
      content: s.content,
      w: s.width,
      h: s.height,
      bg: s.backgroundColor,
      position: s.position,
      inset: `${s.top} ${s.right} ${s.bottom} ${s.left}`,
    }
  }

  return {
    url: location.href,
    dir: document.documentElement.dir || getComputedStyle(document.body).direction,
    docH: document.documentElement.scrollHeight,
    pageTitle: box('.page-title, h1.entry-title, .page-heading h1'),
    loginNotice: box('.woocommerce-form-login-toggle, .woocommerce-info'),
    // The grey panel behind the order summary is not #order_review itself on
    // every theme. Walk up until something actually paints a background, and
    // report that box: it is the one whose width, padding and radius have to be
    // reproduced.
    reviewPanel: (() => {
      let e = document.querySelector('#order_review')
      while (e && e !== document.body) {
        const s = getComputedStyle(e)
        const painted =
          s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent'
        if (painted || s.borderTopWidth !== '0px') {
          const r = e.getBoundingClientRect()
          return {
            sel: `${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ''}.${(e.className || '').toString().split(' ').filter(Boolean).slice(0, 3).join('.')}`,
            top: Math.round(r.top + scrollY),
            left: Math.round(r.left),
            w: Math.round(r.width),
            h: Math.round(r.height),
            bg: s.backgroundColor,
            border: `${s.borderTopWidth} ${s.borderTopColor}`,
            radius: s.borderTopLeftRadius,
            padding: `${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft}`,
          }
        }
        e = e.parentElement
      }
      return null
    })(),
    billingAccent: accent('.woocommerce-billing-fields h3'),
    orderRows: [...document.querySelectorAll('.woocommerce-checkout-review-order-table tr')].map(
      (tr) => {
        const r = tr.getBoundingClientRect()
        return {
          cls: tr.className || tr.parentElement?.tagName,
          top: Math.round(r.top + scrollY),
          h: Math.round(r.height),
          text: (tr.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
        }
      },
    ),
    container: box('.woocommerce > form.checkout') ?? box('form.checkout'),
    col1: box('.col-1'),
    col2: box('.col-2'),
    billingHeading: box('.woocommerce-billing-fields h3'),
    orderReviewHeading: box('#order_review_heading'),
    orderReview: box('#order_review'),
    orderTable: box('.woocommerce-checkout-review-order-table'),
    payment: box('#payment'),
    placeOrder: box('#place_order'),
    terms: box('.woocommerce-terms-and-conditions-wrapper'),
    fields,
  }
})

writeFileSync('refs/checkout-measured.json', `${JSON.stringify(measured, null, 2)}\n`)
await p.screenshot({ path: 'refs/live-checkout.png', fullPage: true })
await b.close()

console.log(`refs/live-checkout.png written (${measured.url}, docH=${measured.docH})`)
console.log(`refs/checkout-measured.json written (${measured.fields.length} billing fields)`)
