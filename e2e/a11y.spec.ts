import AxeBuilder from '@axe-core/playwright'
import { type Page, expect, test } from '@playwright/test'
import { firstProductHref } from './helpers'

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
  return new AxeBuilder({ page }).withTags(WCAG_AA).analyze()
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

test('every interactive control on the home page is reachable by keyboard', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')

  // A control that is visible, enabled and focusable but carries a negative
  // tabindex is invisible to a keyboard, and axe does not flag it.
  const unreachable = await page.evaluate(() => {
    const selector = 'a[href], button, input, select, textarea, [role="button"]'
    return Array.from(document.querySelectorAll(selector))
      .filter((el) => {
        const style = getComputedStyle(el)
        if (style.display === 'none' || style.visibility === 'hidden') return false
        if ((el as HTMLElement).offsetParent === null) return false
        if ((el as HTMLButtonElement).disabled) return false
        return Number(el.getAttribute('tabindex')) < 0
      })
      .map((el) => `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 80))
  })

  expect(unreachable).toEqual([])
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
