import AxeBuilder from '@axe-core/playwright'
import { type Page, expect, test } from '@playwright/test'
import {
  addOpenProductToCart,
  firstProductHref,
  openPurchasableProduct,
  raiseInstallBanner,
} from './helpers'

/**
 * Goal 18. WCAG 2.1 A + AA, measured with axe-core against the real rendered
 * page rather than asserted by reading JSX.
 *
 * WHY AXE AND NOT HAND-WRITTEN ASSERTIONS. Contrast is the majority of real AA
 * failures on a themed site, and it cannot be checked from source at all: it
 * depends on the computed colour of the text and of whatever ends up painted
 * behind it. The same goes for a heading order broken by a component that only
 * renders on one breakpoint. Both need a browser.
 *
 * SCOPE. Public pages only. The account, supplier and admin areas need a
 * session, and the auth fixture belongs to the specs that already own it;
 * putting a login inside an a11y sweep makes a failure ambiguous between "this
 * page is inaccessible" and "the login broke".
 *
 * The consent banner is deliberately IN scope. It is the phone LCP element, it
 * is the first thing on the page, and it is the one component most likely to
 * cover a control -- which is exactly the failure e0bddad had to fix once
 * already.
 */

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

async function scan(page: Page) {
  await settleToasts(page)
  return new AxeBuilder({ page }).withTags(WCAG_AA).analyze()
}

/**
 * WAIT FOR ANY TOAST TO FINISH ANIMATING, THEN SCAN. IT IS NOT A WAY OF NOT
 * LOOKING AT THE TOAST - the toast is still on the page and still scanned.
 *
 * MEASURED 2026-08-20. The cart-panel scan failed one full run with
 * `color-contrast (serious) x1` on `div[data-title=""]`, and passed alone
 * every time. That node is the sonner toast's title, and its SETTLED colours
 * were read off the running page: rgb(0,130,43) on rgb(236,253,243), which is
 * 4.71:1 - AA, but with 0.21 of margin. Sonner fades a toast in and out, axe
 * folds opacity into the colour it computes, and a scan that lands mid-fade
 * measures a lighter green on the same white and drops under 4.5.
 *
 * So the flake was real arithmetic on a real element, at a moment no shopper
 * is asked to read anything. Waiting for opacity 1 measures the toast a
 * shopper actually sees, and keeps the scan deterministic.
 *
 * THE MARGIN IS THE FINDING, and it is recorded in STATE rather than papered
 * over here: 4.71:1 is sonner's `richColors` palette, not a brand token, and
 * anything that ever renders it at less than full opacity fails AA.
 */
async function settleToasts(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () =>
        [...document.querySelectorAll('[data-sonner-toast]')].every(
          (el) => Number(getComputedStyle(el).opacity) === 1,
        ),
      undefined,
      { timeout: 5000 },
    )
    .catch(() => undefined)
}

/** A readable failure: axe's own output is a wall of JSON. */
function describe(results: Awaited<ReturnType<typeof scan>>) {
  return results.violations
    .map((v) => {
      const where = v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(' '))
        .join(' | ')
      return `${v.id} (${v.impact}) x${v.nodes.length}: ${v.help}\n    ${where}`
    })
    .join('\n  ')
}

/**
 * EVERY PUBLIC ROUTE, NOT A SAMPLE.
 *
 * This list held six routes and all six were green, which read as "the site
 * passes". A sweep across every public route on 2026-08-19 found serious
 * violations on TEN of the thirteen that were missing, and none at all on the
 * six that were here. That is not a coincidence: a page in the gate gets fixed,
 * a page outside it does not, and the gate's own scope was the bug.
 *
 * What the sweep found, all fixed in the same change: brand yellow used as text
 * (#fed700 on white, 1.41:1, on the sign-up and forgotten-password links and on
 * a coupon's own price), `text-gray-400` as muted body text (2.60:1) across the
 * coupon and auth surfaces, `text-heading/70` missing AA by 0.02 (4.48 against
 * 4.5) on every legal page, white on the promo CTA orange (2.86:1), and the
 * legal tables' horizontal scrollers being unreachable from a keyboard.
 *
 * Both project viewports run this file, and that is load-bearing rather than
 * incidental: `scrollable-region-focusable` appears ONLY on the phone, because
 * the table box only overflows once the screen is narrower than its 36rem
 * minimum.
 */
const PAGES: Array<{ name: string; path: string }> = [
  { name: 'home', path: '/' },
  { name: 'products', path: '/products' },
  { name: 'cart', path: '/cart' },
  { name: 'contact', path: '/contact' },
  { name: 'offline', path: '/offline' },
  { name: 'supplier login', path: '/supplier/login' },
  { name: 'coupons', path: '/coupons' },
  { name: 'suppliers', path: '/suppliers' },
  { name: 'login', path: '/login' },
  { name: 'signup', path: '/signup' },
  { name: 'reset password', path: '/reset-password' },
  // With a query and a slug: an empty archive renders none of the cards, the
  // prices or the badges that carry most of this site's colour pairings.
  { name: 'search results', path: '/search?q=%D7%9E%D7%95%D7%A6%D7%A8' },
  { name: 'category archive', path: '/category/hot-deals' },
  // Both legal sets. Which one is binding is Ofir's open decision; until it is
  // made, both are served and both have to be accessible.
  { name: 'legal terms', path: '/legal/terms' },
  { name: 'legal privacy', path: '/legal/privacy' },
  { name: 'legal returns', path: '/legal/returns' },
  { name: 'legal accessibility', path: '/legal/accessibility' },
  { name: 'terms and conditions', path: '/terms-and-conditions' },
  { name: 'privacy policy', path: '/privacy-policy' },
]

for (const { name, path } of PAGES) {
  test(`${name} has no WCAG A/AA violations`, async ({ page }) => {
    await page.goto(path)
    await page.waitForLoadState('domcontentloaded')

    const results = await scan(page)

    // Compared as short ids, not as the raw violation objects: axe's nodes
    // carry the full serialised DOM, and a failure printed that way buries the
    // one line that says what is wrong. The detail rides in the message.
    const summary = results.violations.map((v) => `${v.id} x${v.nodes.length}`)

    expect(summary, `\n  ${describe(results)}\n`).toEqual([])
  })
}

test('the document declares Hebrew and RTL, so a screen reader picks the right voice', async ({
  page,
}) => {
  await page.goto('/')

  const html = page.locator('html')
  await expect(html).toHaveAttribute('lang', 'he')
  await expect(html).toHaveAttribute('dir', 'rtl')
})

/**
 * A control that is visible, enabled and focusable but carries a negative
 * tabindex is invisible to a keyboard, and axe does not flag it.
 *
 * THE HOME PAGE ALONE IS NOT A SWEEP, and this file's own history says why:
 * the a11y scan held six routes and all six were green while ten of the
 * thirteen missing ones were not, the 320px gate held seven routes and the one
 * page outside it was the only one overflowing, and the CLS gate held one page
 * and the page that broke was a different one. This check held exactly one
 * route for the same reason all of those did -- it was written on the page
 * somebody happened to be looking at.
 *
 * The list below is the routes a shopper passes through on the way to paying,
 * plus the two archives, because a control that cannot be tabbed to on the
 * checkout is not the same size of problem as one on the home page.
 */
async function unreachableControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const selector = 'a[href], button, input, select, textarea, [role="button"]'
    return Array.from(document.querySelectorAll(selector))
      .filter((el) => {
        const style = getComputedStyle(el)
        if (style.display === 'none' || style.visibility === 'hidden') return false
        if ((el as HTMLElement).offsetParent === null) return false
        if ((el as HTMLButtonElement).disabled) return false
        // A SPAM HONEYPOT IS SUPPOSED TO BE UNREACHABLE, and widening this
        // check past the home page found two of them before it found anything
        // else: `ContactForm` and `SupplierLeadForm` both park a `company`
        // input off-screen at -9999px, inside `aria-hidden="true"`, precisely
        // so that no person ever fills it and every bot does. Off-screen is
        // not `display: none`, so `offsetParent` is not null and the filter
        // above calls it visible.
        //
        // `aria-hidden` is the right line to draw rather than a name or a
        // position: a control hidden from assistive technology is not one a
        // keyboard user is expected to reach, and it is the same declaration
        // axe reads for `aria-hidden-focus` -- which passes here only BECAUSE
        // the tabindex is negative. The two checks agree; without this clause
        // they would contradict each other.
        if (el.closest('[aria-hidden="true"]')) return false
        return Number(el.getAttribute('tabindex')) < 0
      })
      .map((el) => `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 80))
  })
}

for (const path of [
  '/',
  '/products',
  '/cart',
  '/category/hot-deals',
  '/search?q=%D7%9E%D7%95%D7%A6%D7%A8',
  '/coupons',
  '/login',
  '/contact',
  '/suppliers',
]) {
  test(`every interactive control on ${path} is reachable by keyboard`, async ({ page }) => {
    await page.goto(path)
    await page.waitForLoadState('domcontentloaded')
    expect(await unreachableControls(page)).toEqual([])
  })
}

test('every interactive control on a product page is reachable by keyboard', async ({ page }) => {
  // Through a catalogue link, not a hardcoded slug: a stale slug 404s, and a
  // 404 page has three controls and passes.
  const href = await firstProductHref(page)
  await page.goto(href)
  await page.waitForLoadState('domcontentloaded')
  expect(await unreachableControls(page)).toEqual([])
})

test('every control in the seeded checkout is reachable by keyboard', async ({ page }) => {
  await openPurchasableProduct(page)
  await addOpenProductToCart(page)
  await page.goto('/checkout')
  await page.waitForLoadState('domcontentloaded')
  expect(page.url(), 'checkout bounced to the cart; the seed did not stick').toContain('/checkout')
  expect(await unreachableControls(page)).toEqual([])
})

/**
 * The banner is fixed to the bottom, and the body carries padding sized to it.
 * If that padding is smaller than the banner, the last control on every page is
 * unclickable -- the exact regression e0bddad fixed on a phone.
 *
 * Checked at the widths that were actually short rather than at whatever the
 * project viewport happens to be. Run at the two project viewports alone this
 * passed for months while 320px was 33.5px short and 640px was 28px short; the
 * reservation is a CSS breakpoint ladder, so only a width per rung measures it.
 * 320 is the narrowest phone still sold, 640 is the rung where `sm:flex-row`
 * turns on and the text still wraps to two lines, and 1440 is the widest rung.
 */
for (const width of [320, 640, 1440]) {
  test(`the consent banner does not cover the page it sits on at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    const banner = page.locator('[data-consent-banner]')
    if ((await banner.count()) === 0) test.skip()

    const bannerBox = await banner.boundingBox()
    const padding = await page.evaluate(() =>
      Number.parseFloat(getComputedStyle(document.body).paddingBottom),
    )

    expect(bannerBox).not.toBeNull()
    expect(
      padding,
      `body reserves ${padding}px for a ${bannerBox?.height}px banner at ${width}px`,
    ).toBeGreaterThanOrEqual((bannerBox?.height ?? 0) - 1)
  })
}

/**
 * THE PRODUCT PAGE WAS OUTSIDE THIS SWEEP, AND IT IS THE PAGE THAT SELLS.
 *
 * Every route above is a fixed path. The product page is not: its slugs are
 * Hebrew and DB-driven, so it was simply absent, and a scan of twelve of them
 * on 2026-08-19 failed EVERY ONE. What it found was not incidental trim:
 *
 *   .pdp-buy__now      white on #ee6443   3.21:1   the buy button itself
 *   .pdp-summary__price del  #848484 on white  3.74:1
 *   .text-price-strike  #9ca3af on white  2.53:1   the coupon page's old price
 *   .text-muted         #767676 on #f5f5f5  4.16:1   terms and supplier blocks
 *   .text-whatsapp-ink  #128c7e on white  4.14:1
 *   .text-facebook      #1877f2 on white  4.23:1
 *
 * Two products, discovered rather than pinned, because the two halves of this
 * catalogue render different components: a coupon shows CouponPricing with its
 * struck "regular price", a physical product shows the stock and the buy
 * button. A single sample would have covered one of the six failures above.
 */
test.describe('product pages have no WCAG A/AA violations', () => {
  test('the first product in the catalogue', async ({ page }) => {
    const href = await firstProductHref(page)
    await page.goto(href)
    await page.waitForLoadState('domcontentloaded')

    const results = await scan(page)
    expect(
      results.violations.map((v) => v.id),
      `${href}\n  ${describe(results)}`,
    ).toEqual([])
  })

  test('a coupon product, which renders the struck regular price', async ({ page }) => {
    await page.goto('/products')
    // The coupon half of the catalogue is what carries CouponPricing, and its
    // struck price was the worst pairing on the site. Fall back to the first
    // product rather than skipping: a catalogue with no coupon is itself worth
    // a red test on a coupon site.
    const links = page.locator('a[href^="/product/"]')
    await expect(links.first()).toBeVisible({ timeout: 15_000 })
    const hrefs = await links.evaluateAll((els) =>
      els.map((el) => el.getAttribute('href')).filter((h): h is string => Boolean(h)),
    )
    const coupon = hrefs.find((h) => h.includes('coupon')) ?? hrefs[0]
    expect(coupon, 'no product links on /products to sample').toBeTruthy()
    await page.goto(coupon as string)
    await page.waitForLoadState('domcontentloaded')

    const results = await scan(page)
    expect(
      results.violations.map((v) => v.id),
      `${coupon}\n  ${describe(results)}`,
    ).toEqual([])
  })
})

/**
 * THE CHECKOUT, WITH SOMETHING IN THE CART.
 *
 * /checkout sends an empty cart to /cart, so a scan that does not seed first is
 * a scan of the cart page under another name. That is why this page sat outside
 * the sweep, and it is the page where money changes hands.
 *
 * Seeded, it failed twice, and one of them was CRITICAL rather than a colour.
 * Under 560px the step labels are hidden so the numerals can share the row, and
 * `display: none` took them out of the accessibility tree as well. The numeral
 * beside each one is aria-hidden, so all four step buttons were left with no
 * accessible name at all: a screen reader announced "button" and nothing more,
 * on the checkout. They are visually hidden now instead, which keeps the name.
 *
 * The other was the step row's own ink, #7a7a7a, at 4.01:1 on #f7f7f7 and
 * 3.38:1 on the numeral's #e4e4e4 - and 14px BOLD is not the 18.66px that would
 * let 3:1 apply. The cart's sidebar note was #999 at 2.84:1 on the phone.
 */
test.describe('the checkout with a seeded cart', () => {
  test('cart and checkout have no WCAG A/AA violations', async ({ page }) => {
    await openPurchasableProduct(page)
    await addOpenProductToCart(page)

    await page.goto('/cart')
    await page.waitForLoadState('domcontentloaded')
    const cart = await scan(page)
    expect(
      cart.violations.map((v) => v.id),
      `/cart\n  ${describe(cart)}`,
    ).toEqual([])

    await page.goto('/checkout')
    await page.waitForLoadState('domcontentloaded')
    // A checkout that bounced to /cart would scan clean and mean nothing, which
    // is the same trap scripts/compare.mjs guards for this page.
    expect(page.url(), 'checkout bounced to the cart; the seed did not stick').toContain(
      '/checkout',
    )

    const checkout = await scan(page)
    expect(
      checkout.violations.map((v) => v.id),
      `/checkout\n  ${describe(checkout)}`,
    ).toEqual([])
  })
})

/**
 * THE THREE STEPS OF THE CHECKOUT NOBODY HAS EVER SCANNED.
 *
 * The sweep above seeds a cart and scans /checkout, and it looks like the money
 * page is covered. It is not. The whole form stays mounted at every step and
 * only visibility changes -- `lib/checkout/steps.ts` says so, and gives the
 * reason: unmounting step 1 to render step 3 would drop the name, phone and
 * email from `FormData`. The steps that are not current carry the `hidden`
 * attribute, axe skips hidden content by design, and so a scan on arrival sees
 * ONLY `details`. The address, the review and the pay screen -- the one with
 * the terms tickbox and the button that moves money -- have never been in a
 * gate.
 *
 * This is the same shape as the empty-cart bounce on the CLS gate and the six
 * routes that were the whole a11y sweep before 2026-08-19: the scope was the
 * bug, and everything inside it was green.
 *
 * It walks with the shopper's own controls rather than setting `step` from the
 * outside, so the gate cannot pass on a state the shopper cannot reach: the
 * "המשך" button refuses a step whose fields do not validate.
 */
test.describe('the checkout wizard, step by step', () => {
  test('every step of the checkout has no WCAG A/AA violations', async ({ page }) => {
    await openPurchasableProduct(page)
    await addOpenProductToCart(page)
    await page.goto('/checkout')
    await page.waitForLoadState('domcontentloaded')
    expect(page.url(), 'checkout bounced to the cart; the seed did not stick').toContain(
      '/checkout',
    )

    const next = page.locator('.checkout-nav__next').first()
    const advance = async (to: string) => {
      await next.click()
      await expect(
        page.locator('.checkout-steps__item[aria-current="step"]'),
        `the wizard would not advance to ${to}`,
      ).toContainText(to)
    }

    // THE STATE EVERY SHOPPER WHO MISTYPES SEES, WHICH IS ALSO UNSCANNED.
    // Pressing "המשך" on an empty step paints four `role="alert"` messages and
    // marks four inputs `aria-invalid`. A page is not accessible because it is
    // accessible while empty: red-on-white at 12px is exactly the pairing that
    // misses AA, and #dc3545 clears it on white by 0.03.
    await next.click()
    await expect(
      page.locator('.checkout-field__error').first(),
      'pressing continue on an empty step raised no error to scan',
    ).toBeVisible()
    const invalid = await scan(page)
    expect(
      invalid.violations.map((v) => v.id),
      `details step with validation errors\n  ${describe(invalid)}`,
    ).toEqual([])

    // Values that satisfy `validateDetailsStep`: an Israeli mobile and an
    // address-shaped email are both checked, so placeholders will not do.
    await page.fill('#co-first-name', 'אופיר')
    await page.fill('#co-last-name', 'בדיקה')
    await page.fill('#co-phone', '0501234567')
    await page.fill('#co-email', 'qa@example.com')
    await advance('כתובת למשלוח')

    const address = await scan(page)
    expect(
      address.violations.map((v) => v.id),
      `address step\n  ${describe(address)}`,
    ).toEqual([])

    await page.fill('#co-city', 'תל אביב')
    await page.fill('#co-street', 'דיזנגוף')
    await page.fill('#co-number', '10')
    await advance('ביקורת הזמנה')

    const review = await scan(page)
    expect(
      review.violations.map((v) => v.id),
      `review step\n  ${describe(review)}`,
    ).toEqual([])

    await advance('אישור ותשלום')

    // Scanned but NOT submitted. The terms box is the last gate before the pay
    // button, and ticking it is what a shopper about to pay sees, so the state
    // under test is the one with the box checked and the button live.
    await page.check('input[name="accept_terms"]')
    const confirm = await scan(page)
    expect(
      confirm.violations.map((v) => v.id),
      `confirm step\n  ${describe(confirm)}`,
    ).toEqual([])
  })
})

/**
 * THE CART PANEL THAT OPENS ON TOP OF EVERYTHING, WHICH NO SWEEP HAS SEEN.
 *
 * Every entry in PAGES is a URL, and this panel does not have one. It opens on
 * add-to-cart, which makes it the FIRST cart most shoppers ever see -- STATE.md
 * says exactly that, and it is why the disabled-checkout bug there was the
 * worst surface to leave open. It is also a `role="dialog"`, the one widget
 * where the accessibility question is not decorative: a name, a reachable
 * close, and contrast against whatever it covers.
 *
 * Both project viewports run this file and they exercise DIFFERENT components:
 * above 767px the open panel is `MiniCartDropdown`, below it `CartDrawer`.
 * They share `drawerOpen` and the label "עגלת קניות", and CSS picks between
 * them, so one test covers both only because both viewports run it.
 */
test('the cart panel that opens on add-to-cart has no WCAG A/AA violations', async ({ page }) => {
  await openPurchasableProduct(page)
  await addOpenProductToCart(page)

  const panel = page.getByRole('dialog', { name: 'עגלת קניות' })
  // Adding opens it by itself. If that ever stops being true the scan below
  // would quietly measure the page with no panel on it, so it is asserted.
  await expect(panel, 'add-to-cart did not open the cart panel; nothing was scanned').toBeVisible()

  const results = await scan(page)
  expect(
    results.violations.map((v) => `${v.id} x${v.nodes.length}`),
    `\n  ${describe(results)}\n`,
  ).toEqual([])
})

/**
 * THE INSTALL BANNER, WHICH APPEARS FOR NOBODY THIS SWEEP HAS EVER VISITED AS.
 *
 * It renders off a captured `beforeinstallprompt`, which Chrome fires only when
 * its own install heuristics are satisfied, so it is never on the page during a
 * normal run and no route list can reach it. It is also the last surface in the
 * app that paints over the content of every public page -- the cart panel and
 * the toast were the other two, and the toast was carrying four AA failures.
 *
 * The event is synthesised rather than waited for. The component needs nothing
 * from it but `preventDefault`, and waiting for a real one means never running
 * this test.
 */
test('the install banner has no WCAG A/AA violations', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')

  const banner = await raiseInstallBanner(page)
  await expect(banner, 'the install banner did not render; nothing was scanned').toBeVisible()

  const results = await scan(page)
  expect(
    results.violations.map((v) => `${v.id} x${v.nodes.length}`),
    `\n  ${describe(results)}\n`,
  ).toEqual([])
})

/**
 * THE SEARCH SUGGESTIONS, WHERE AXE REPORTS NOTHING AND THE WIDGET SAID NOTHING.
 *
 * The masthead box is `role="combobox"`, and arrow keys moved a highlight
 * (`bg-brand-accent`) through the suggestions while Enter navigated to the one
 * highlighted. Focus never left the input and nothing carried that selection
 * into the accessibility tree: no `aria-activedescendant`, no `role="listbox"`
 * on the popup `aria-controls` pointed at, no `role="option"` on anything. A
 * screen reader heard "combobox, expanded", then silence through every
 * ArrowDown, then a navigation to a product it had never named.
 *
 * A FULL AXE SCAN OF THAT STATE REPORTED ZERO VIOLATIONS -- measured, not
 * assumed. The popup was a bare `ul` and axe has no rule that a combobox's
 * controlled element must be a listbox, so the whole sweep above could stay
 * green over a WCAG 4.1.2 failure. This test asserts the wiring directly, which
 * is the only thing that would have caught it.
 */
test('the search combobox says which suggestion is selected', async ({ page, viewport }) => {
  // `DeferredHeaderSearch` is `hidden ... md:flex`, so below 768px this widget
  // is not on the page at all and there is nothing to assert.
  test.skip((viewport?.width ?? 0) < 768, 'the masthead search is hidden below md')

  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')

  const input = page.locator('#masthead-search')
  await input.click()
  await input.fill('מוצר')

  const list = page.locator('#masthead-search-suggestions')
  await expect(list, 'no suggestions came back; nothing was asserted').toBeVisible()
  await expect(list).toHaveAttribute('role', 'listbox')
  await expect(input).toHaveAttribute('aria-expanded', 'true')
  await expect(input).toHaveAttribute('aria-autocomplete', 'list')
  await expect(input).toHaveAttribute('aria-controls', 'masthead-search-suggestions')

  const options = list.locator('[role="option"]')
  expect(
    await options.count(),
    'the list has no options for the combobox to point at',
  ).toBeGreaterThan(1)

  // Nothing is selected until the shopper chooses, so the attribute must be
  // ABSENT rather than pointing at a first option they never asked for.
  await expect(input).not.toHaveAttribute('aria-activedescendant', /./)

  const selected = async () => {
    const id = await input.getAttribute('aria-activedescendant')
    return id ? list.locator(`#${id}`) : null
  }

  await page.keyboard.press('ArrowDown')
  await expect(input).toHaveAttribute('aria-activedescendant', 'masthead-search-option-0')
  await expect(list.locator('[aria-selected="true"]')).toHaveCount(1)

  await page.keyboard.press('ArrowDown')
  await expect(input).toHaveAttribute('aria-activedescendant', 'masthead-search-option-1')
  await expect(list.locator('[aria-selected="true"]')).toHaveCount(1)

  // Backwards is a separate branch, and it wraps at zero.
  await page.keyboard.press('ArrowUp')
  await expect(input).toHaveAttribute('aria-activedescendant', 'masthead-search-option-0')

  // The payoff: what Enter opens has to be what was announced. A name read out
  // and a different product opened is worse than silence.
  const announced = (await (await selected())?.textContent()) ?? ''
  await page.keyboard.press('Enter')
  await page.waitForURL(/\/product\//)
  const heading = (await page.locator('h1').first().textContent()) ?? ''
  expect(announced, `announced "${announced}" and opened "${heading}"`).toContain(heading.trim())
})
