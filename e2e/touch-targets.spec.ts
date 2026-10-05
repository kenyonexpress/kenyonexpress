import { type Page, expect, test } from '@playwright/test'
import {
  CONSENT_COOKIE,
  CONSENT_WORDING_VERSION,
  serializeConsent,
} from '../src/lib/analytics/consent'
import { firstProductHref } from './helpers'

/**
 * Target size on the screens a thumb actually uses.
 *
 * TWO FLOORS, BOTH MEASURED AS HIT AREA AND NOT AS PAINT.
 *
 *  - 24px on the short side for EVERY visible, enabled control (WCAG 2.5.8,
 *    the AA minimum). Inline links inside prose are exempt, as 2.5.8 itself
 *    exempts them; icon-only controls are exactly the ones that must pass.
 *  - 44px for the PRIMARY controls: the header icon row (wishlist, account,
 *    cart), the menu trigger, the bottom tab bar, the product page's buy
 *    buttons and the checkout's pay button. 44 is the AAA figure (2.5.5) and
 *    Apple's guidance; this site asks it of the controls a shopper hits on
 *    every visit, and the number is a floor the components meet today.
 *
 * WHY HIT AREA AND NOT getBoundingClientRect. The header icons paint at
 * Electro's 22.7px and grow their hit box to 44 through a `::before`
 * pseudo-element; the small product-page links do the same through
 * `.tap-area::after`. A bounding box reads the paint and calls a 44px target
 * 23px wide, which is what this file did until W13 (2026-10-05) and why it
 * was red on a row that actually passes under a thumb. `elementFromPoint`
 * returns the originating element for a hit on its pseudo-element, so probing
 * outward from the centre until the probe leaves the control measures what a
 * finger gets. It also catches the opposite failure, a control whose box is
 * large but is covered by something painted above it.
 *
 * The consent is decided before the first navigation: the banner is the one
 * element designed to cover controls, and `a11y.spec.ts` already measures
 * that it covers nothing it should not.
 */

const ROUTES = ['/', '/category/hot-deals', '/cart', '/checkout', '/accessibility', '/login']
const MIN_ANY = 24
const MIN_PRIMARY = 44

/**
 * Controls that must offer the 44px thumb target, as CSS selectors. The
 * product page's buy buttons are asserted in their own test because the page
 * is reached by slug.
 */
const PRIMARY = [
  '.header-icon__trigger',
  'button[aria-haspopup="dialog"]',
  '[data-bottom-tab-bar] a[href]',
  '.checkout-pay-btn',
]

/**
 * The one primary control that cannot reach 44 at 390px, with the number it
 * can reach. Electro's handheld header places the three icons 42px apart
 * centre to centre (measured: x=15, 58, 100 for 22.7px glyphs), so a 44px box
 * on each would overlap its neighbour by 2px and a tap in the overlap would
 * go to whichever icon painted last. The hit boxes are grown to the pitch
 * instead, touching but not overlapping, and 44 is asked of them only where
 * the row has the room (the desktop gap is 38px). The floor is 40 rather than
 * 42 because the probe walks in whole pixels from a fractional centre.
 */
const PRIMARY_FLOOR: Record<string, number> = { '.header-icon__trigger': 40 }

test.use({ viewport: { width: 390, height: 844 } })

type Measured = {
  label: string
  width: number
  height: number
  primary: boolean
  floor: number
  covered: boolean
}

/**
 * The consent decision is a server action that writes a cookie and redirects,
 * so clicking it inside a measurement races the reload; measured in W13, the
 * banner was still up when the probe ran and the bottom tab bar read as
 * covered. Writing the cookie the action would write, before the first
 * navigation, is the same decided state without the round trip.
 */
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

async function measure(page: Page, primary: string[]): Promise<Measured[]> {
  return page.evaluate(
    ({ primarySelectors, floors, minPrimary, probe }) => {
      const out: Measured[] = []
      const controls = document.querySelectorAll<HTMLElement>(
        'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="tab"], [role="menuitem"]',
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
        const rect = el.getBoundingClientRect()
        // 0x0 is display:none; 1x1 is the sr-only clip pattern (skip link),
        // which grows to full size on focus and is exempt while clipped.
        if (rect.width <= 2 || rect.height <= 2) continue
        const style = getComputedStyle(el)
        if (style.visibility === 'hidden' || style.display === 'none') continue
        // A transparent, pointer-events:none element (the drawer scrim while
        // closed) is not a target; neither is anything off-screen, which is
        // where a closed drawer keeps its links (translate-x-full).
        if (style.opacity === '0' || style.pointerEvents === 'none') continue
        if (el.matches(':disabled')) continue
        // 2.5.8 exempts inline links in prose.
        if (el.tagName === 'A' && style.display === 'inline' && el.closest('p, li, td')) continue
        const primaryMatch = primarySelectors.find((s) => el.matches(s))
        const isPrimary = primaryMatch !== undefined
        const floor = primaryMatch === undefined ? 0 : (floors[primaryMatch] ?? minPrimary)
        el.scrollIntoView({ block: 'center', inline: 'center' })
        const r = el.getBoundingClientRect()
        if (
          r.right <= 0 ||
          r.left >= window.innerWidth ||
          r.bottom <= 0 ||
          r.top >= window.innerHeight
        ) {
          continue
        }
        const cx = Math.min(Math.max(r.left + r.width / 2, 1), window.innerWidth - 1)
        const cy = Math.min(Math.max(r.top + r.height / 2, 1), window.innerHeight - 1)
        const label = `${el.tagName.toLowerCase()}[${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}]`
        if (!hits(el, cx, cy)) {
          out.push({ label, width: 0, height: 0, primary: isPrimary, floor, covered: true })
          continue
        }
        const width = 1 + extent(el, cx, cy, -1, 0) + extent(el, cx, cy, 1, 0)
        const height = 1 + extent(el, cx, cy, 0, -1) + extent(el, cx, cy, 0, 1)
        out.push({ label, width, height, primary: isPrimary, floor, covered: false })
      }
      return out
    },
    { primarySelectors: primary, floors: PRIMARY_FLOOR, minPrimary: MIN_PRIMARY, probe: 48 },
  )
}

function offenders(measured: Measured[]) {
  const any: string[] = []
  const primary: string[] = []
  for (const m of measured) {
    const short = Math.min(m.width, m.height)
    const line = `${m.label} ${m.width}x${m.height}${m.covered ? ' (covered at its centre)' : ''}`
    if (m.covered) {
      any.push(line)
      continue
    }
    if (short < MIN_ANY) any.push(line)
    if (m.primary && short < m.floor) primary.push(`${line} (floor ${m.floor})`)
  }
  return { any, primary }
}

for (const route of ROUTES) {
  test(`interactive targets on ${route} are thumb-sized`, async ({ page }) => {
    await decideConsentUpfront(page)
    await page.goto(route)
    await page.waitForLoadState('networkidle')

    const measured = await measure(page, PRIMARY)
    expect(measured.length, 'the page has controls to measure').toBeGreaterThan(0)
    const found = offenders(measured)
    expect(found.any, `sub-${MIN_ANY}px hit areas on ${route}`).toEqual([])
    expect(found.primary, `primary controls under ${MIN_PRIMARY}px on ${route}`).toEqual([])
  })
}

test('the product page: every control is 24px and both buy buttons are 44px', async ({ page }) => {
  await decideConsentUpfront(page)
  const href = await firstProductHref(page)
  await page.goto(href)
  await page.waitForLoadState('networkidle')

  const measured = await measure(page, [...PRIMARY, '.pdp-buy__atc', '.pdp-buy__now'])
  const found = offenders(measured)
  expect(found.any, `sub-${MIN_ANY}px hit areas on ${href}`).toEqual([])
  expect(found.primary, `primary controls under ${MIN_PRIMARY}px on ${href}`).toEqual([])
  // The buy buttons must exist on a sellable product, or the assertion above
  // passed on nothing.
  const buy = measured.filter((m) => m.primary && /הוסף לסל|קנה|נוסף לסל|אזל/.test(m.label))
  expect(buy.length, 'the product page renders a buy control').toBeGreaterThan(0)
})
