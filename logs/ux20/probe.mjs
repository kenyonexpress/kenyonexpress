import { writeFileSync } from 'node:fs'
// UX20 probe: the wishlist page at 380 / 768 / 1440 on a built server, signed
// in as the seeded E2E customer, with three products saved (the hearts on
// their product pages are pressed first when they are not lit). It reads the
// grid (how many columns the cards sit in, the card, thumb and button
// geometry), the toolbar (count, move-all, share), the share card, what a
// remove press does to the DOM mid-flight and after (is there a leaving
// state, an undo, a live announcement), and what a move-to-cart press leaves
// behind (the card, the header cart count, the announcement). The same script
// runs before and after, so the two JSON files diff cleanly.
import { chromium } from '@playwright/test'

const BASE = process.env.BASE ?? 'http://localhost:3360'
const TAG = process.env.TAG ?? 'before'
const WIDTHS = (process.env.WIDTHS ?? '380,768,1440').split(',').map(Number)
const EMAIL = process.env.E2E_CUSTOMER_EMAIL ?? 'e2e-customer@test.kenyonexpress.local'
const PASSWORD = process.env.E2E_CUSTOMER_PASSWORD ?? 'E2eCustomer!pass1'
const SLUGS = ['e2e-test-physical', 'e2e-test-coupon', '6253']
const ROUTE = '/account/wishlist'

const browser = await chromium.launch()
const out = {}

const CONSENT = { name: 'ke_consent', value: 'denied.2', domain: 'localhost', path: '/' }

const rectFn = `(el) => {
  if (!el) return null
  const b = el.getBoundingClientRect()
  return { x: +b.x.toFixed(1), y: +(b.y + window.scrollY).toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }
}`

const shapeFn = `(() => {
  const rect = ${rectFn}
  const q = (s) => document.querySelector(s)
  const qa = (s) => [...document.querySelectorAll(s)]
  const main = q('.account-content') ?? q('main') ?? document.body
  const list = main.querySelector('ul.wishlist-grid, ul.grid, ul[class*="grid"]')
  const cards = list ? [...list.children] : []
  const firstRowY = cards[0] ? cards[0].getBoundingClientRect().y : null
  const columns = cards.filter((c) => Math.abs(c.getBoundingClientRect().y - firstRowY) < 2).length
  const card = cards[0] ?? null
  const img = card ? card.querySelector('img') : null
  const move = card ? [...card.querySelectorAll('button')].find((b) => /לסל|אזל|זמין/.test(b.textContent)) : null
  const remove = card ? [...card.querySelectorAll('button')].find((b) => /הסר/.test(b.getAttribute('aria-label') ?? '')) : null
  const toolbarButtons = [...main.querySelectorAll('button, a')].filter((b) => /העברת הכל|שיתוף|שתף/.test(b.textContent))
  const share = [...main.querySelectorAll('section')].find((s) => /שיתוף הרשימה/.test(s.textContent))
  const live = qa('[aria-live]').filter((el) => main.contains(el)).map((el) => ({ tag: el.tagName, live: el.getAttribute('aria-live'), text: el.textContent.trim().slice(0, 80) }))
  return {
    h1: q('h1')?.textContent.trim() ?? null,
    count: cards.length,
    columns,
    list: rect(list),
    listClass: list?.className ?? null,
    card: rect(card),
    cardAttrs: card ? Object.fromEntries([...card.attributes].map((a) => [a.name, a.value])) : null,
    thumb: rect(img),
    thumbSizes: img?.getAttribute('sizes') ?? null,
    name: card?.querySelector('h2, h3, [class*="title"], a span.block')?.textContent.trim() ?? null,
    price: card?.querySelector('[class*="price"]')?.textContent.trim() ?? null,
    savedAt: card ? /נשמר/.test(card.textContent) : false,
    move: move ? { text: move.textContent.trim(), rect: rect(move), disabled: move.disabled } : null,
    remove: remove ? { label: remove.getAttribute('aria-label'), rect: rect(remove), disabled: remove.disabled } : null,
    toolbar: toolbarButtons.map((b) => ({ tag: b.tagName, text: b.textContent.trim(), rect: rect(b) })),
    countText: [...main.querySelectorAll('p')].map((p) => p.textContent.trim()).find((t) => /שמור/.test(t)) ?? null,
    share: share ? { rect: rect(share), hasLink: Boolean(share.querySelector('input[readonly]')), buttons: [...share.querySelectorAll('button, a')].map((b) => b.textContent.trim()) } : null,
    live,
    pageHeight: document.documentElement.scrollHeight,
    scrollWidth: document.documentElement.scrollWidth,
  }
})()`

const cartCountFn = `(() => {
  const el = [...document.querySelectorAll('button[aria-label], a[aria-label]')].find((b) => /^עגלת קניות/.test(b.getAttribute('aria-label')))
  const m = el ? el.getAttribute('aria-label').match(/(\\d+) פריטים/) : null
  return m ? Number(m[1]) : null
})()`

for (const width of WIDTHS) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: 1,
    locale: 'he-IL',
    hasTouch: width < 768,
    // A fresh client IP per width and per tag: the login limiter is 10/h per IP.
    extraHTTPHeaders: { 'x-forwarded-for': `10.20.${TAG === 'before' ? 1 : 2}.${width % 250}` },
  })
  await ctx.addCookies([CONSENT])
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.goto(`${BASE}/login?next=%2Faccount`, { waitUntil: 'networkidle' })
  await page.getByLabel('אימייל').fill(EMAIL)
  await page.getByLabel('סיסמה').fill(PASSWORD)
  await page.getByRole('button', { name: 'כניסה', exact: true }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 })

  // Make sure the three fixtures are saved, through the product's OWN heart
  // (the inline one in ProductInfo, which streams in after the shell; the
  // overlay hearts on the related-products cards are in the shell and come
  // first in a bare role query).
  const seeded = []
  for (const slug of SLUGS) {
    await page.goto(`${BASE}/product/${slug}`, { waitUntil: 'load' })
    const heart = page
      .getByRole('button', { name: /רשימת המשאלות/ })
      .filter({ hasText: /שמירה|נשמר/ })
      .first()
    await heart.waitFor({ timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(600)
    const label = await heart.getAttribute('aria-label').catch(() => null)
    if (label === 'הוסף לרשימת המשאלות') {
      await heart.click()
      await page
        .waitForFunction(
          (el) => el?.getAttribute('aria-label') === 'הסר מרשימת המשאלות',
          await heart.elementHandle(),
          { timeout: 8000 },
        )
        .catch(() => {})
    }
    seeded.push({
      slug,
      before: label,
      after: await heart.getAttribute('aria-label').catch(() => null),
    })
  }

  // Production's seo_redirects answers /wishlist with a 410 (UX18); a goto
  // reports "Download is starting" on it, so the status is read off a request.
  const publicRes = await page.request.get(`${BASE}/wishlist`, { maxRedirects: 0 })
  const publicStatus = publicRes.status()

  const res = await page.goto(`${BASE}${ROUTE}`, { waitUntil: 'load' })
  await page
    .locator('ul li button')
    .first()
    .waitFor({ timeout: 15000 })
    .catch(() => {})
  await page.waitForTimeout(400)
  const initial = await page.evaluate(shapeFn)
  initial.moveButtons = await page
    .locator('ul li button', { hasText: /לסל|אזל|זמין/ })
    .evaluateAll((bs) => bs.map((b) => ({ text: b.textContent.trim(), disabled: b.disabled })))
  await page.screenshot({ path: `logs/ux20/${TAG}-${width}.png`, fullPage: true })

  // Remove the last card: sample the DOM one frame in, then settle.
  const removeButtons = page.locator('ul li button[aria-label^="הסרת"]')
  const removeCount = await removeButtons.count()
  let midRemove = null
  let afterRemove = null
  if (removeCount > 0) {
    const last = removeButtons.nth(removeCount - 1)
    const li = last.locator('xpath=ancestor::li[1]')
    await last.scrollIntoViewIfNeeded()
    await last.click()
    await page.waitForTimeout(80)
    midRemove = await li
      .evaluate((el) => {
        const cs = getComputedStyle(el)
        const card = el.querySelector('article') ?? el
        const ccs = getComputedStyle(card)
        return {
          present: true,
          leaving: card.getAttribute('data-leaving') ?? el.getAttribute('data-leaving'),
          busy: card.getAttribute('aria-busy') ?? el.getAttribute('aria-busy'),
          animation: ccs.animationName !== 'none' ? ccs.animationName : cs.animationName,
          duration: ccs.animationDuration,
          opacity: ccs.opacity,
          maxHeight: ccs.maxHeight,
          buttonsDisabled: [...card.querySelectorAll('button')].every((b) => b.disabled),
        }
      })
      .catch(() => ({ present: false }))
    if (width === 380 || width === 1440) {
      await page.screenshot({ path: `logs/ux20/${TAG}-${width}-leaving.png`, fullPage: true })
    }
    await page
      .locator('[data-sonner-toast]')
      .first()
      .waitFor({ timeout: 8000 })
      .catch(() => {})
    await page.waitForTimeout(150)
    afterRemove = await page.evaluate(`(() => {
      const main = document.querySelector('.account-content') ?? document.querySelector('main') ?? document.body
      const toasts = [...document.querySelectorAll('[data-sonner-toast], [role="status"], li[data-sonner-toast]')].map((t) => t.textContent.trim()).filter(Boolean)
      const undo = [...document.querySelectorAll('button')].find((b) => /ביטול|החזר/.test(b.textContent) && b.closest('[data-sonner-toast]'))
      return {
        count: main.querySelectorAll('ul li button[aria-label^="הסרת"]').length,
        toasts,
        undo: undo ? undo.textContent.trim() : null,
        live: [...main.querySelectorAll('[aria-live]')].map((el) => el.textContent.trim()).filter(Boolean),
      }
    })()`)
    // Undo when offered, so the fixture stays saved for the next width.
    const undo = page.locator('[data-sonner-toast] button', { hasText: /ביטול|החזר/ }).first()
    if (await undo.count()) {
      await undo.click()
      await page
        .waitForFunction(
          (n) => document.querySelectorAll('ul li button[aria-label^="הסרת"]').length >= n,
          removeCount,
          { timeout: 8000 },
        )
        .catch(() => {})
      afterRemove.afterUndoCount = await page.locator('ul li button[aria-label^="הסרת"]').count()
      afterRemove.afterUndoLive = await page.evaluate(
        `[...document.querySelectorAll('.account-content [aria-live], main [aria-live]')].map((el) => el.textContent.trim()).filter(Boolean)`,
      )
    }
  }

  // Move the first card to the cart.
  const cartBefore = await page.evaluate(cartCountFn)
  const moveButtons = page.locator('ul li button:not([disabled])', { hasText: /העברה לסל/ })
  let move = null
  if ((await moveButtons.count()) > 0) {
    const first = moveButtons.first()
    const productId = await first.evaluate(
      (b) => b.closest('[data-product-id]')?.getAttribute('data-product-id') ?? null,
    )
    const card = productId
      ? page.locator(`article[data-product-id="${productId}"]`)
      : first.locator('xpath=ancestor::article[1]')
    const countBefore = await page.locator('ul li button[aria-label^="הסרת"]').count()
    await first.scrollIntoViewIfNeeded()
    await first.click()
    await page.waitForTimeout(80)
    const mid = await card
      .evaluate((el) => ({
        present: true,
        leaving: el.getAttribute('data-leaving'),
        busy: el.getAttribute('aria-busy'),
        pending: [...el.querySelectorAll('button')].map((b) => b.textContent.trim()),
      }))
      .catch(() => ({ present: false }))
    // The cart answers, the card exits, the wishlist write lands.
    await card.waitFor({ state: 'detached', timeout: 10000 }).catch(() => {})
    await page.waitForTimeout(200)
    move = {
      productId,
      countBefore,
      mid,
      countAfter: await page.locator('ul li button[aria-label^="הסרת"]').count(),
      cartBefore,
      cartAfter: await page.evaluate(cartCountFn),
      toasts: await page.evaluate(
        `[...document.querySelectorAll('[data-sonner-toast]')].map((t) => t.textContent.trim())`,
      ),
      live: await page.evaluate(`(() => {
        const main = document.querySelector('.account-content') ?? document.querySelector('main') ?? document.body
        return [...main.querySelectorAll('[aria-live]')].map((el) => el.textContent.trim()).filter(Boolean)
      })()`),
    }
    if (width === 380 || width === 1440) {
      await page.screenshot({ path: `logs/ux20/${TAG}-${width}-moved.png`, fullPage: true })
    }
  }

  out[width] = {
    status: res?.status() ?? null,
    landed: new URL(page.url()).pathname,
    publicWishlistStatus: publicStatus,
    seeded,
    initial,
    midRemove,
    afterRemove,
    move,
    errors,
  }
  await ctx.close()
}

await browser.close()
writeFileSync(`logs/ux20/${TAG}.json`, `${JSON.stringify(out, null, 2)}\n`)
console.log(JSON.stringify(out, null, 2))
