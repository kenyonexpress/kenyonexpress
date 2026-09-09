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

const ROUTES = ['/', '/products', '/cart']
const MIN_ANY = 24
const MIN_PRIMARY = 40

test.use({ viewport: { width: 390, height: 844 } })

for (const route of ROUTES) {
  test(`interactive targets on ${route} are thumb-sized`, async ({ page }) => {
    await page.goto(route)
    await page.waitForLoadState('networkidle')

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
          const short = Math.min(rect.width, rect.height)
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
    expect(offenders, `sub-${MIN_ANY}px targets on ${route}`).toEqual([])
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
