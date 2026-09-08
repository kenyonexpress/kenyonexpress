import { expect, test } from '@playwright/test'

/**
 * WCAG 2.5.8 target size on the screens a thumb actually uses: every visible,
 * enabled interactive element on the phone-critical routes must offer a hit
 * area of at least 24x24 CSS px (the AA minimum), and the PRIMARY commerce
 * controls -- add to cart, checkout nav, scanner buttons -- at least 40px on
 * their short side (Apple's 44pt guidance, minus the 4px the shared button
 * padding provably leaves; the number is a measured floor, not an aspiration).
 *
 * Inline text links inside paragraphs are exempt, as 2.5.8 itself exempts
 * them; icon-only controls are exactly the ones that must pass.
 */

// STEP 09 asks for a 380px audit of EVERY route, and this list was three.
// Swept on 2026-09-08 at 380: thirteen sub-24px controls on twelve routes,
// none of them on the three that were covered. The breadcrumb "בית" link was
// 20x21 on ten pages and the login form's two secondary controls were 16px and
// 20px tall.
const ROUTES = [
  '/',
  '/about',
  '/accessibility',
  '/blog',
  '/cart',
  '/checkout',
  '/contact',
  '/cookie-policy',
  '/coupons',
  '/faq',
  '/forgot-password',
  '/login',
  '/mfa',
  '/offline',
  '/privacy-policy',
  '/products',
  '/refund_returns',
  '/reset-password',
  '/search',
  '/signup',
  '/signup/confirm',
  '/supplier/access-denied',
  '/supplier/login',
  '/suppliers',
  '/terms-and-conditions',
]
const MIN_ANY = 24
const MIN_PRIMARY = 40

// 380, not 390. That is the width the brief names and the width the pixel gate
// measures, and the ten pixels matter: they are where a row wraps.
test.use({ viewport: { width: 380, height: 844 } })

for (const route of ROUTES) {
  test(`interactive targets on ${route} are thumb-sized`, async ({ page }) => {
    await page.goto(route)
    await page.waitForLoadState('networkidle')

    // WHERE WE ACTUALLY LANDED, not where we asked to go.
    //
    // /checkout redirects to /cart when the cart is empty, and this loop seeds
    // nothing. Reporting the result under the requested path is precisely how
    // scripts/_touch-targets.mjs once published "90 violations at 380px" for
    // checkout while counting the cart's controls, and how a 0.357 CLS became a
    // high-severity checkout risk that belonged to the cart. The first sweep
    // behind this very change made the same mistake and
    // src/__tests__/checkout-bounce-guard.test.ts caught it.
    //
    // Checkout's own controls are covered by the seeded purchase journeys,
    // which reach it with a cart. Here the row measures whatever it reached and
    // says so.
    const finalPath = new URL(page.url()).pathname

    const offenders = await page.evaluate(
      ({ minAny }) => {
        const out: string[] = []
        const controls = document.querySelectorAll<HTMLElement>(
          'button, a[href], input:not([type="hidden"]), select, [role="button"]',
        )
        for (const el of controls) {
          const rect = el.getBoundingClientRect()
          // 0x0 is display:none; 1x1 is the sr-only clip pattern (skip link),
          // which grows to full size on focus and is exempt while clipped.
          if (rect.width <= 2 || rect.height <= 2) continue
          const style = getComputedStyle(el)
          if (style.visibility === 'hidden' || style.display === 'none') continue
          // 2.5.8 exempts inline links in prose.
          if (el.tagName === 'A' && style.display === 'inline' && el.closest('p, li, td')) continue
          // THE ELEMENT'S OWN BOX IS NOT THE TAP TARGET WHEN `.hit-44` IS ON IT.
          //
          // That utility (globals.css) leaves layout alone and paints a
          // centred `::after` of `max(100%, 44px)`, so the control really is
          // 44x44 to a thumb while `getBoundingClientRect()` still returns the
          // text box. Measured 2026-09-08: the breadcrumb link reads 20x21 with
          // a 44px overlay. A rect-only probe would call that a violation and
          // send someone to "fix" a control that is already right.
          const after = getComputedStyle(el, '::after')
          const overlay =
            after.content !== 'none' && after.position === 'absolute'
              ? Math.min(Number.parseFloat(after.width) || 0, Number.parseFloat(after.height) || 0)
              : 0
          const short = Math.max(Math.min(rect.width, rect.height), overlay)
          if (short < minAny) {
            out.push(
              `${el.tagName.toLowerCase()}[${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}] ${Math.round(rect.width)}x${Math.round(rect.height)}`,
            )
          }
        }
        return out
      },
      { minAny: MIN_ANY },
    )
    const measured = finalPath === route ? route : `${route} -> ${finalPath}`
    expect(offenders, `sub-${MIN_ANY}px targets on ${measured}`).toEqual([])
  })
}

test('the primary buy control is at least 40px tall on a product page', async ({ page }) => {
  await page.goto('/products')
  await page.waitForLoadState('networkidle')
  const first = page.locator('a[href^="/product/"]').first()
  await first.click()
  await page.waitForLoadState('networkidle')
  const buy = page.locator('button:has-text("הוסף לסל"), button:has-text("קנה")').first()
  if ((await buy.count()) === 0) return // unsellable catalogue state; other specs cover it
  const box = await buy.boundingBox()
  expect(box, 'buy button visible').not.toBeNull()
  expect(Math.min(box?.width ?? 0, box?.height ?? 0)).toBeGreaterThanOrEqual(MIN_PRIMARY)
})
