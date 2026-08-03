import AxeBuilder from '@axe-core/playwright'
import { type Page, expect, test } from '@playwright/test'

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

const PAGES: Array<{ name: string; path: string }> = [
  { name: 'home', path: '/' },
  { name: 'products', path: '/products' },
  { name: 'cart', path: '/cart' },
  { name: 'contact', path: '/contact' },
  { name: 'offline', path: '/offline' },
  { name: 'supplier login', path: '/supplier/login' },
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

test('the consent banner does not cover the page it sits on', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')

  const banner = page.locator('[data-consent-banner]')
  if ((await banner.count()) === 0) test.skip()

  // The banner is fixed to the bottom, and the body carries padding sized to
  // it. If that padding is smaller than the banner, the last control on every
  // page is unclickable -- the exact regression e0bddad fixed on a phone.
  const bannerBox = await banner.boundingBox()
  const padding = await page.evaluate(() =>
    Number.parseFloat(getComputedStyle(document.body).paddingBottom),
  )

  expect(bannerBox).not.toBeNull()
  expect(padding).toBeGreaterThanOrEqual((bannerBox?.height ?? 0) - 1)
})
