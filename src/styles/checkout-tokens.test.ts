import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The checkout brief names exact values (brand yellow and its hover, the site
 * container, a 44px touch target, RTL, Heebo). Every one of them had been
 * written into the stylesheet and none was checked, so "it is in the CSS" was
 * the only evidence any of it was true.
 *
 * These assertions are text-only on purpose. The live checkout was measured at
 * refs/ke-checkout-measured.json (three breakpoints, 10/10 elements) and that
 * settles what the reference DOES; this file settles what we declare. A pixel
 * diff of our own checkout is not currently possible: /checkout redirects to
 * /cart when the basket is empty, and the basket cannot be filled locally
 * because SUPABASE_SECRET_KEY is the stock supabase-demo key and the whole cart
 * path runs through the admin client. Verified, not assumed: that key answers
 * 401 "Invalid API key" while the anon key answers 200.
 */

const CSS = readFileSync(join(process.cwd(), 'src/styles/checkout-page.css'), 'utf8')

/** Rule bodies only, so a value mentioned in a comment cannot satisfy a test. */
const RULES = CSS.replace(/\/\*[\s\S]*?\*\//g, '')

describe('checkout brand tokens', () => {
  it('pays on the brand yellow the live button actually uses', () => {
    // Measured on kenyonexpress.co.il/checkout/: #place_order is
    // rgb(254, 215, 0), which is #fed700 exactly.
    expect(RULES).toMatch(/\.checkout-pay-btn\s*\{[^}]*background:\s*#fed700/)
  })

  it('hovers to #fedd26', () => {
    expect(RULES).toMatch(/\.checkout-pay-btn:hover[^{]*\{[^}]*background:\s*#fedd26/)
  })

  it('uses the same yellow for the step and retry controls', () => {
    expect(RULES).toMatch(/\.checkout-nav__next\s*\{[^}]*background:\s*#fed700/)
    expect(RULES).toMatch(/\.checkout-nav__next:hover[^{]*\{[^}]*background:\s*#fedd26/)
    expect(RULES).toMatch(/\.checkout-error__retry\s*\{[^}]*background:\s*#fed700/)
  })
})

describe('checkout geometry', () => {
  it('takes the container from the shared token rather than a private width', () => {
    // The page carried a hardcoded 1170 while every other route was on the
    // shared value. One page owning its own container width is how a 150px
    // step appears between two screens of a single flow.
    expect(RULES).toMatch(/\.checkout-page\s*\{[^}]*max-width:\s*var\(--container-page/)
    expect(RULES).not.toMatch(/\.checkout-page\s*\{[^}]*max-width:\s*1170px/)
  })

  it('sits every step control on the shared 44px touch target', () => {
    // --cart-touch is declared once, in mini-cart.css, which the root layout
    // loads everywhere. Redeclaring 44px here is how three surfaces end up
    // with three different ideas of a thumb.
    for (const selector of [
      '.checkout-nav__next',
      '.checkout-nav__back',
      '.checkout-error__retry',
    ]) {
      const rule = new RegExp(`\\${selector}\\s*\\{[^}]*min-height:\\s*var\\(--cart-touch`)
      expect(RULES, `${selector} is not on --cart-touch`).toMatch(rule)
    }
  })

  it('gives the stepper buttons the same target', () => {
    expect(RULES).toMatch(/\.checkout-steps__btn\s*\{[^}]*min-height:\s*var\(--cart-touch/)
  })
})

describe('checkout typography and direction', () => {
  it('names no font family of its own, so Heebo keeps coming from the layout', () => {
    // Heebo is set once on the root layout. A page that names a family drifts
    // the moment the layout changes one. `inherit` is the exception and the
    // opposite of drift: form controls do NOT inherit the document font on
    // their own, so an input without it is the one element on the page still
    // rendering in the UA default.
    const families = [...RULES.matchAll(/font-family:\s*([^;]+);/g)].map((m) => m[1]?.trim())
    expect(families.filter((f) => f !== 'inherit')).toEqual([])
  })

  it('turns off RTL only for machine identifiers, never for layout', () => {
    // Live checkout measures direction: rtl on every element sampled at 380,
    // 768 and 1440, and ours inherits that from <html dir>.
    //
    // The two exceptions are correct and must stay: a coupon code and an order
    // id are Latin and digits, and an RTL context reorders them on screen into
    // something the shopper cannot read back to support. What this guards is
    // that the list does not grow to include a container, which is how a whole
    // panel silently flips.
    const ltrSelectors = [...RULES.matchAll(/([^{}]+)\{[^}]*direction:\s*ltr[^}]*\}/g)].map((m) =>
      (m[1] ?? '').trim().split('\n').pop()?.trim(),
    )
    expect(ltrSelectors.sort()).toEqual(['.checkout-frame__order', '.coupon-card__code'])
  })
})

describe('the live reference', () => {
  it('records what was measured, so the next session does not re-derive it', () => {
    const measured = JSON.parse(
      readFileSync(join(process.cwd(), 'refs/ke-checkout-measured.json'), 'utf8'),
    ) as {
      checkout: Record<
        string,
        {
          __found: number
          __of: number
          'place-order': { 'background-color': string; 'border-radius': string }
        }
      >
    }

    for (const bp of ['380', '768', '1440']) {
      const shot = measured.checkout[bp]
      expect(shot, `no measurement at ${bp}`).toBeTruthy()
      // Electro answered 0/18. This is what a reference that actually loaded
      // looks like, and the contrast is the point.
      expect(shot?.__found).toBe(shot?.__of)
      expect(shot?.['place-order']['background-color']).toBe('rgb(254, 215, 0)')
      expect(shot?.['place-order']['border-radius']).toBe('50px')
    }
  })
})
