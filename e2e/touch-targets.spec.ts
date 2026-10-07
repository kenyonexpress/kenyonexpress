import { type Page, expect, test } from '@playwright/test'
import {
  CONSENT_COOKIE,
  CONSENT_WORDING_VERSION,
  serializeConsent,
} from '../src/lib/analytics/consent'
import { firstProductHref } from './helpers'

/**
 * Target size on the screens a thumb actually uses (STEP 33).
 *
 * TWO FLOORS, BOTH MEASURED AS HIT AREA AND NOT AS PAINT.
 *
 *  - 24px on the short side for EVERY visible, enabled control (WCAG 2.5.8,
 *    the AA minimum). Inline links inside prose are exempt, as 2.5.8 itself
 *    exempts them; icon-only controls are exactly the ones that must pass.
 *  - 44px for the PRIMARY controls: the header logo and cart trigger, the
 *    menu trigger, the top bar's sign-in link, every add-to-cart and wishlist
 *    control on a card, the product page's buy button and quantity field, the
 *    checkout's pay button and the newsletter form. 44 is the AAA figure
 *    (2.5.5) and Apple's guidance; this site asks it of the controls a
 *    shopper hits on every visit.
 *
 * WHY HIT AREA AND NOT getBoundingClientRect. The header logo paints at the
 * live template's 100x26 and the card circles at 40x40; they reach 44 through
 * `.tap-area::after` (src/styles/responsive.css), a pseudo-element that grows
 * the hit box and not the paint, because the parity gate measures paint. A
 * bounding box reads the paint and calls a 44px target 26px tall, which is
 * what the previous version of this file did. `elementFromPoint` returns the
 * originating element for a hit on its pseudo-element, so probing outward
 * from the centre until the probe leaves the control measures what a finger
 * gets. It also catches the opposite failure, a control whose box is large
 * but is covered by something painted above it.
 *
 * The form controls (`.pdp-buy__qty`, the newsletter field) have no
 * pseudo-element; they grow under `@media (pointer: coarse)`, so this file
 * runs with touch emulation and a coarse pointer, as a phone reports.
 *
 * The consent is decided before the first navigation: the banner is the one
 * element designed to cover controls, and its buttons are a server action
 * that reloads the page, so clicking it inside a measurement races the reload.
 */

const ROUTES = ['/', '/products', '/category/hot-deals', '/cart', '/login', '/legal/terms']
const MIN_ANY = 24
const MIN_PRIMARY = 44

/** Controls that must offer the 44px thumb target, as CSS selectors. */
const PRIMARY = [
  'header a[aria-label="קניון אקספרס, לדף הבית"]',
  '[data-mini-cart-trigger]',
  'button[aria-haspopup="dialog"]',
  'a.h-topbar-row', // the top bar's sign-in link, 78x37 painted
  'button[aria-label^="הוסף "]', // add-to-cart on every card, wishlist overlay
  '.category-card__atc',
  '.pdp-buy button',
  '.pdp-buy__qty',
  '.checkout-pay-btn',
  '.ke-newsletter__input',
  '.ke-newsletter__button',
]

test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true })

type Measured = {
  label: string
  width: number
  height: number
  primary: boolean
  covered: boolean
}

async function decideConsentUpfront(page: Page) {
  const base = new URL(test.info().project.use.baseURL ?? 'http://localhost:3000')
  await page.context().addCookies([
    {
      name: CONSENT_COOKIE,
      value: serializeConsent({ decision: 'denied', wordingVersion: CONSENT_WORDING_VERSION }),
      domain: base.hostname,
      path: '/',
    },
  ])
}

async function measure(page: Page): Promise<Measured[]> {
  return page.evaluate(
    ({ primarySelectors, probe }) => {
      const out: Measured[] = []
      const controls = document.querySelectorAll<HTMLElement>(
        'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="tab"], [role="menuitem"]',
      )
      const hits = (el: HTMLElement, x: number, y: number) => {
        const target = document.elementFromPoint(x, y)
        return target !== null && (target === el || el.contains(target))
      }
      // Walk from the centre outward in 1px steps until the probe leaves the
      // control, in each of four directions, and sum the two halves per axis.
      const extent = (el: HTMLElement, cx: number, cy: number, dx: number, dy: number) => {
        let n = 0
        while (n < probe && hits(el, cx + dx * (n + 1), cy + dy * (n + 1))) n += 1
        return n
      }
      for (const el of controls) {
        // Off-stage: the closed menu drawer is inert and translated off the
        // viewport; a closed <details> keeps its children out of the paint.
        if (el.closest('[inert], details:not([open]) > :not(summary), [aria-hidden="true"]'))
          continue
        const rect = el.getBoundingClientRect()
        // 0x0 is display:none; 1x1 is the sr-only clip pattern (skip link),
        // which grows to full size on focus and is exempt while clipped.
        if (rect.width <= 2 || rect.height <= 2) continue
        const style = getComputedStyle(el)
        if (style.visibility === 'hidden' || style.display === 'none') continue
        if (el.matches(':disabled')) continue
        // 2.5.8 exempts inline links in prose.
        if (el.tagName === 'A' && style.display === 'inline' && el.closest('p, li, td')) continue
        el.scrollIntoView({ block: 'center', inline: 'nearest' })
        const r = el.getBoundingClientRect()
        const cx = r.left + r.width / 2
        const cy = r.top + r.height / 2
        const label = `${el.tagName.toLowerCase()}[${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}]`
        const primary = primarySelectors.some((s) => el.matches(s))
        if (!hits(el, cx, cy)) {
          out.push({ label, width: 0, height: 0, primary, covered: true })
          continue
        }
        const width = extent(el, cx, cy, -1, 0) + extent(el, cx, cy, 1, 0) + 1
        const height = extent(el, cx, cy, 0, -1) + extent(el, cx, cy, 0, 1) + 1
        out.push({ label, width, height, primary, covered: false })
      }
      return out
    },
    { primarySelectors: PRIMARY, probe: 48 },
  )
}

function offenders(measured: Measured[]) {
  const covered = measured.filter((m) => m.covered).map((m) => `${m.label} covered at its centre`)
  const small = measured
    .filter((m) => !m.covered)
    .filter((m) => Math.min(m.width, m.height) < (m.primary ? MIN_PRIMARY : MIN_ANY))
    .map((m) => `${m.label} hit ${m.width}x${m.height} (${m.primary ? 'primary, 44' : '24'})`)
  return [...covered, ...small]
}

test('the emulated phone reports a coarse pointer', async ({ page }) => {
  // The coarse-pointer floors in responsive.css are what raise the quantity
  // field and the newsletter form; if the emulation ever stops matching, the
  // primary assertions below would be measuring a desktop.
  await page.goto('/')
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true)
})

for (const route of ROUTES) {
  test(`every control on ${route} is thumb-sized`, async ({ page }) => {
    await decideConsentUpfront(page)
    await page.goto(route)
    await page.waitForLoadState('networkidle')
    expect(offenders(await measure(page)), `sub-floor targets on ${route}`).toEqual([])
  })
}

test('every control on a product page is thumb-sized, buy row included', async ({ page }) => {
  await decideConsentUpfront(page)
  const href = await firstProductHref(page)
  await page.goto(href)
  await page.waitForLoadState('networkidle')
  const measured = await measure(page)
  expect(offenders(measured), `sub-floor targets on ${href}`).toEqual([])
  // The buy row must actually have been measured, or the assertion above is
  // vacuous on an unsellable catalogue.
  expect(
    measured.some((m) => m.primary && /כמות/.test(m.label)),
    'quantity field measured',
  ).toBe(true)
})

test('the hero dots grow to 44px vertically and keep the pitch sideways', async ({ page }) => {
  // The dots are 8px glyphs 16px apart off the live slider; sideways a 44px
  // box would overlap its neighbour, so the button grows to half the gap
  // (24 wide, tangent) and to the full 44 in the direction with no neighbour.
  await decideConsentUpfront(page)
  await page.goto('/')
  const dots = page.locator('button[aria-label^="שקופית"]')
  const count = await dots.count()
  expect(count).toBeGreaterThan(1)
  for (let i = 0; i < count; i += 1) {
    const box = await dots.nth(i).boundingBox()
    expect(box, `dot ${i + 1} box`).not.toBeNull()
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(MIN_PRIMARY)
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(MIN_ANY)
  }
})
