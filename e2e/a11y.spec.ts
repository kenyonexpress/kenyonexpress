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

/**
 * WCAG 2.2 since STEP 32 (2026-10-07). The two new tags add axe's
 * `target-size` rule (2.5.8, 24x24 CSS px or 24px spacing). Measured on the
 * built site before widening the set: one violation, the hero slider's idle
 * dots at 1440 (8px dots at live's 15px gap are 23px centre to centre), and
 * nothing else on any of the routes below at either viewport. The dot gap is
 * 16 now; see HeroSlider.tsx. 2.4.11 (focus not obscured), 2.4.3/2.1.2 (the
 * drawer) and 3.2.6/3.3.8 have no axe rule and are asserted directly further
 * down in this file.
 */
const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']

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
  test('every step of the checkout has no WCAG A/AA violations', async ({ page, viewport }) => {
    await openPurchasableProduct(page)
    await addOpenProductToCart(page)
    await page.goto('/checkout')
    await page.waitForLoadState('domcontentloaded')
    expect(page.url(), 'checkout bounced to the cart; the seed did not stick').toContain(
      '/checkout',
    )

    // Below 768 there is no wizard since D25: checkout-page.css stacks every
    // step section into live's single long page and hides the continue
    // buttons. One scan therefore covers ALL sections at once -- including
    // the error state, raised through the same submit the shopper uses.
    if ((viewport?.width ?? 1280) < 768) {
      await page.locator('.checkout-pay-btn').click()
      await expect(
        page.locator('.checkout-field__error').first(),
        'submitting the empty single-page checkout raised no error to scan',
      ).toBeVisible()
      const single = await scan(page)
      expect(
        single.violations.map((v) => v.id),
        `single-page checkout with validation errors\n  ${describe(single)}`,
      ).toEqual([])
      return
    }

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
  /*
   * SKIPPED FROM 2026-09-03 TO 2026-09-30, AND NOT BECAUSE IT BROKE.
   *
   * STEP D3 removed the masthead search field under the no-search-UI rule, and
   * `#masthead-search` did not exist on any page. STEP 08 brought the field
   * back as `components/search/SiteSearch.tsx` with the same ids, so this is
   * live again. It documents a real bug it once caught: a full axe scan of the
   * open popup reported ZERO violations while the listbox wiring was missing,
   * because axe has no rule for it.
   */
  // Below xl the masthead is not rendered; the handheld row carries the same
  // widget under `#handheld-search` and home.spec.ts walks that one.
  test.skip((viewport?.width ?? 0) < 1280, 'the masthead search is rendered from xl up')

  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')

  const input = page.locator('#masthead-search')
  await input.click()
  // The query has to return MORE THAN ONE suggestion, because the whole point
  // below is arrowing between them. It used to be 'מוצר', which matched a
  // catalogue full of seed rows literally named "מוצר לדוגמא"; migration 128
  // retired those, the query dropped to a single hit, and this test failed on a
  // correct catalogue change rather than on a regression.
  //
  // 'עיסוי' is chosen because it matches products the shop actually sells (six
  // at the time of writing: several massage and spa deals across two
  // suppliers), not because it happened to pass. A query tied to demo data is a
  // test that expires the day the demo data does.
  await input.fill('עיסוי')

  const list = page.locator('#masthead-search-suggestions')
  await expect(list, 'no suggestions came back; nothing was asserted').toBeVisible()
  await expect(list).toHaveAttribute('role', 'listbox')
  await expect(input).toHaveAttribute('aria-expanded', 'true')
  await expect(input).toHaveAttribute('aria-autocomplete', 'list')
  await expect(input).toHaveAttribute('aria-controls', 'masthead-search-suggestions')

  const options = list.locator('[role="option"]')
  expect(
    await options.count(),
    'fewer than two suggestions came back, so there is nothing to arrow between. If the catalogue changed, pick a query that still matches several real products.',
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

/* ==========================================================================
   STEP 32 (2026-10-07): WCAG 2.2 AA, the criteria axe has no rule for.
   ========================================================================== */

/**
 * A FULL TAB WALK, THREE ASSERTIONS PER STOP.
 *
 *   2.4.7  Focus Visible:       the stop paints a ring (outline or shadow).
 *   2.4.11 Focus Not Obscured:  the stop's centre hit-tests to itself, not to
 *                               a fixed strip painted over it.
 *   2.4.3  Focus Order:         the stop is inside the viewport at all -- an
 *                               off-screen stop is a hidden control that is
 *                               still in the order.
 *
 * All three were measured as real before this test existed:
 *   - three add-to-cart buttons on the home page at 1440 hit-tested to the
 *     consent banner's <summary> (the browser scrolls the focused control to
 *     the bottom edge, where the fixed banner is) -> `scroll-padding-bottom`;
 *   - the closed category drawer's close button was reached by Tab at 390,
 *     44x44 and entirely outside the viewport -> `inert` while closed.
 * The walk marks each stop in the DOM and ends when a stop repeats, so the
 * end condition is identity and not a name two products could share.
 */
async function walkFocus(page: Page) {
  const problems: string[] = []
  let stops = 0
  for (let i = 0; i < 400; i++) {
    await page.keyboard.press('Tab')
    const stop = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      if (!el || el === document.body) return { done: true as const }
      if (el.dataset.a11yWalked) return { done: true as const }
      el.dataset.a11yWalked = '1'
      const s = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      const label = `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}"`
      const ring =
        !el.matches(':focus-visible') ||
        (s.outlineStyle !== 'none' && Number.parseFloat(s.outlineWidth) > 0) ||
        s.boxShadow !== 'none'
      const offscreen =
        r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      const obscured = Boolean(top && !el.contains(top) && !top.contains(el))
      return {
        done: false as const,
        label,
        ring,
        offscreen,
        obscuredBy: obscured
          ? `${top?.tagName.toLowerCase()}.${String(top?.className).slice(0, 40)}`
          : null,
      }
    })
    if (stop.done) break
    stops++
    if (!stop.ring) problems.push(`no visible focus ring: ${stop.label}`)
    if (stop.offscreen) problems.push(`focus landed outside the viewport: ${stop.label}`)
    if (stop.obscuredBy) problems.push(`focus hidden under ${stop.obscuredBy}: ${stop.label}`)
  }
  return { stops, problems }
}

for (const path of ['/', '/products', '/cart', '/coupons', '/login']) {
  test(`every Tab stop on ${path} is visible, on screen and not under fixed chrome`, async ({
    page,
  }) => {
    await page.goto(path)
    await page.waitForLoadState('domcontentloaded')
    const { stops, problems } = await walkFocus(page)
    expect(stops, 'the walk found nothing to focus; the page did not render').toBeGreaterThan(3)
    expect(problems).toEqual([])
  })
}

/**
 * THE CATEGORY DRAWER IS A REAL MODAL TO THE KEYBOARD, NOT ONLY TO ARIA.
 *
 * `aria-modal="true"` is a promise to the screen reader that nothing outside
 * the dialog is reachable. Measured at 390 on the built site before the fix:
 * the 13th Tab from the open drawer (close, then twelve categories) landed on
 * the masthead logo under the scrim. Axe passed the page, because it only
 * reads the attribute.
 */
test('the category drawer keeps Tab inside, is inert when closed, and Escape returns to the trigger', async ({
  page,
  viewport,
}) => {
  test.skip((viewport?.width ?? 0) >= 1280, 'the drawer and its hamburger exist below xl only')

  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')

  const dialog = page.locator('[role="dialog"][aria-modal="true"]').first()
  await expect(dialog, 'closed drawer must be inert').toHaveAttribute('inert', '')

  const trigger = page.getByRole('button', { name: 'תפריט קטגוריות' })
  await trigger.click()
  await expect(dialog).not.toHaveAttribute('inert', '')
  await expect(dialog).toBeVisible()

  // Twice around the loop, in both directions: the close button plus the
  // categories is ~13 stops, so 30 Tabs guarantee at least two wraps.
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab')
    const inside = await page.evaluate(() =>
      Boolean(document.activeElement?.closest('[role="dialog"][aria-modal="true"]')),
    )
    expect(inside, `Tab #${i + 1} left the open drawer`).toBe(true)
  }
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press('Shift+Tab')
    const inside = await page.evaluate(() =>
      Boolean(document.activeElement?.closest('[role="dialog"][aria-modal="true"]')),
    )
    expect(inside, `Shift+Tab #${i + 1} left the open drawer`).toBe(true)
  }

  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await expect(dialog).toHaveAttribute('inert', '')
})

/**
 * 2.4.1 BYPASS BLOCKS ON EVERY LAYOUT THAT HAS BLOCKS TO BYPASS.
 *
 * The storefront and the legal layout had the link; the (main) group
 * (coupons, newsletter, wishlist alerts) rendered the same masthead with no
 * way past it, and the account, admin and supplier layouts had none either.
 * Measured before the fix: first Tab on /coupons was "התחברות" in the top bar.
 *
 * `/login` is deliberately absent: the auth layout is a logo and a form with
 * nothing to skip, and a skip link there would be the first of two stops.
 */
for (const path of ['/', '/products', '/coupons', '/legal/privacy']) {
  test(`the first Tab on ${path} is a skip link that lands focus in <main>`, async ({ page }) => {
    await page.goto(path)
    await page.waitForLoadState('domcontentloaded')

    await page.keyboard.press('Tab')
    const link = page.locator(':focus')
    await expect(link).toHaveAttribute('href', '#main-content')
    await expect(link).toHaveText('דילוג לתוכן הראשי')
    // Visible while focused, not only present: `sr-only` alone would keep
    // the 1x1 clip and the sighted keyboard user would see nothing move.
    const box = await link.boundingBox()
    expect(box?.width ?? 0, 'the skip link did not grow out of its clip on focus').toBeGreaterThan(
      40,
    )

    await page.keyboard.press('Enter')
    await expect(page.locator('main#main-content')).toBeFocused()
    // One main landmark, not two: six storefront pages and three (main) pages
    // nested a second <main> inside the layout's, and the landmark list read
    // "main, main".
    await expect(page.locator('main')).toHaveCount(1)
  })
}

/**
 * WHAT A SCREEN READER HEARS, IN THE LANGUAGE THE DOCUMENT DECLARES.
 *
 * The aria snapshot is the accessibility tree Playwright builds from the same
 * data VoiceOver reads: role and accessible name per node. Every control
 * must have a name, and the name must be Hebrew, because `lang="he"` makes
 * the Hebrew voice read it. The exemptions are what a Hebrew page legitimately
 * says in Latin or digits: the brand, a phone number, an e-mail, a page
 * number, a price.
 *
 * Measured before the fix: 0 unnamed controls on seven route/viewport pairs,
 * and one English landmark on every page -- sonner's "Notifications alt+T"
 * region, which now reads "התראות". Landmarks of the same role must be told
 * apart by name: /coupons had two bare `complementary` sidebars.
 */
const LATIN_OK = [/^KenyonExpress$/, /^[\d\s\-+.,:/%₪()]+$/, /^[\w.+-]+@[\w-]+\.[\w.]+$/]

test.describe('the accessibility tree is named in Hebrew', () => {
  for (const path of ['/', '/products', '/cart', '/login', '/coupons', '/contact']) {
    test(`every control and landmark on ${path}`, async ({ page }) => {
      await page.goto(path)
      await page.waitForLoadState('domcontentloaded')
      const snapshot = await page.locator('body').ariaSnapshot()
      const lines = snapshot.split('\n').map((l) => l.trim())

      const controls = lines.filter((l) =>
        /^- (button|link|textbox|combobox|checkbox|radio|searchbox|switch|tab|menuitem|spinbutton|slider)\b/.test(
          l,
        ),
      )
      expect(controls.length, 'no controls in the tree; the page did not render').toBeGreaterThan(3)

      const unnamed = controls.filter((l) => !/"/.test(l))
      expect(unnamed, 'a control with no accessible name').toEqual([])

      const foreign = controls
        .map((l) => l.match(/"([^"]*)"/)?.[1] ?? '')
        .filter((name) => !/\p{Script=Hebrew}/u.test(name) && !LATIN_OK.some((re) => re.test(name)))
      expect(foreign, 'a control named in a language the Hebrew voice cannot read').toEqual([])

      // Landmarks: one main, and every navigation / complementary / region
      // carries a Hebrew name so the landmark list distinguishes them.
      const mains = lines.filter((l) => /^- main\b/.test(l))
      expect(mains, 'exactly one main landmark').toHaveLength(1)
      const named = lines.filter((l) => /^- (navigation|complementary|region)\b/.test(l))
      const nameless = named.filter((l) => !/"/.test(l))
      expect(nameless, 'a landmark with no name').toEqual([])
      const foreignLandmark = named.filter(
        (l) => !/\p{Script=Hebrew}/u.test(l.match(/"([^"]*)"/)?.[1] ?? ''),
      )
      expect(foreignLandmark, 'a landmark named in English').toEqual([])
    })
  }
})

/**
 * 3.2.6 CONSISTENT HELP. The WhatsApp contact is the help mechanism, and 3.2.6
 * asks that it sit in the same relative place on every page that has it. It
 * is a fixed float, so "same place" is the same viewport box, measured.
 */
test('the WhatsApp help float is in the same place on every storefront page', async ({ page }) => {
  const boxes: Array<{ path: string; box: string }> = []
  for (const path of ['/', '/products', '/cart', '/contact', '/coupons', '/suppliers']) {
    await page.goto(path)
    await page.waitForLoadState('domcontentloaded')
    const float = page.locator('.whatsapp-float')
    await expect(float, `${path} has no help float`).toHaveCount(1)
    const b = await float.boundingBox()
    boxes.push({
      path,
      box: `${Math.round(b?.x ?? 0)},${Math.round(b?.y ?? 0)} ${Math.round(b?.width ?? 0)}x${Math.round(b?.height ?? 0)}`,
    })
  }
  const distinct = new Set(boxes.map((b) => b.box))
  expect(distinct.size, JSON.stringify(boxes)).toBe(1)
})

/**
 * 3.3.8 ACCESSIBLE AUTHENTICATION (MINIMUM). No cognitive function test on the
 * way in: no CAPTCHA, a password field the browser may fill and the shopper
 * may paste into, and a one-time code field the OS can hand over.
 */
test('login asks for nothing a password manager or a pasted code cannot supply', async ({
  page,
}) => {
  await page.goto('/login')
  await page.waitForLoadState('domcontentloaded')
  await expect(
    page.locator('iframe[src*="captcha"], iframe[src*="turnstile"], [data-sitekey]'),
  ).toHaveCount(0)
  const password = page.locator('input[type="password"]').first()
  await expect(password).toHaveAttribute('autocomplete', 'current-password')
  expect(await password.getAttribute('onpaste'), 'paste must not be blocked').toBeNull()
  const pasteAllowed = await password.evaluate((el) => {
    const ev = new ClipboardEvent('paste', { cancelable: true, bubbles: true })
    return el.dispatchEvent(ev)
  })
  expect(pasteAllowed).toBe(true)
})
