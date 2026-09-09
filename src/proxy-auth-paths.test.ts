import { describe, expect, it } from 'vitest'
import { pathRequiresAuth } from './proxy'

/**
 * THE SUPPLIER RECRUITMENT PAGE DEMANDED AN ACCOUNT.
 *
 * The auth gate was an inline boolean containing
 *
 *     pathname.startsWith('/supplier')
 *
 * and that matches `/suppliers`, which is not the supplier portal. It is the
 * public "הצטרפו כספקים" marketing page in `(store)`, linked from `SiteFooter`
 * and the masthead, listed in `sitemap.xml`, and explicitly allowed by
 * `robots.txt`.
 *
 * MEASURED ON THE LIVE SITE 2026-09-09:
 *
 *     GET https://www.kenyonexpress.co.il/suppliers
 *     -> 307 https://www.kenyonexpress.co.il/login?next=%2Fsuppliers
 *
 * Two costs, and the second is the one nobody would have found by using the
 * site. The page whose entire job is recruiting new suppliers asked for an
 * account from people who by definition do not have one. And `sitemap.xml`
 * advertises the URL, so Search Console reports it as "Page with redirect" and
 * never indexes it: the recruitment page cannot be found by search either.
 *
 * A one-character prefix, missing a slash. This file is here because that is
 * not a class of bug anyone spots by reading, and because the fix has to keep
 * the portal itself gated.
 */

describe('the supplier prefix bug', () => {
  it('RECRUITMENT_PAGE: /suppliers is public', () => {
    expect(pathRequiresAuth('/suppliers')).toBe(false)
  })

  it('and so is anything under it', () => {
    expect(pathRequiresAuth('/suppliers/thank-you')).toBe(false)
  })

  it('while the portal is still gated, exactly and by prefix', () => {
    expect(pathRequiresAuth('/supplier')).toBe(true)
    expect(pathRequiresAuth('/supplier/orders')).toBe(true)
    expect(pathRequiresAuth('/supplier/payouts')).toBe(true)
    expect(pathRequiresAuth('/supplier/redemptions')).toBe(true)
  })

  it('leaves the two public doors into the portal open', () => {
    // Without these a supplier cannot reach a login form to become
    // authenticated in the first place.
    expect(pathRequiresAuth('/supplier/login')).toBe(false)
    expect(pathRequiresAuth('/supplier/access-denied')).toBe(false)
  })
})

describe('what else the gate covers, so the fix did not widen or narrow it', () => {
  it('gates the account area', () => {
    expect(pathRequiresAuth('/account')).toBe(true)
    expect(pathRequiresAuth('/account/orders')).toBe(true)
  })

  it("gates a customer's own voucher page", () => {
    // /coupon/ singular is one customer's voucher, code and QR on screen.
    expect(pathRequiresAuth('/coupon/abc123')).toBe(true)
  })

  it('leaves the coupons LISTING public, which is the same word plural', () => {
    // The distinction robots.txt also draws: /coupon/ is disallowed and
    // /coupons is a catalogue page.
    expect(pathRequiresAuth('/coupons')).toBe(false)
  })

  it('gates checkout sub-paths but not the checkout entry', () => {
    // Requiring a session on /checkout breaks guest checkout outright.
    expect(pathRequiresAuth('/checkout')).toBe(false)
    expect(pathRequiresAuth('/checkout/return')).toBe(true)
  })

  it('leaves the payment frame paths ungated', () => {
    // A login form inside Cardcom's iframe, shown to a shopper who has just
    // paid, is the failure this exception exists to avoid.
    expect(pathRequiresAuth('/checkout/frame-return')).toBe(false)
  })

  it('leaves the storefront alone', () => {
    for (const path of ['/', '/products', '/product/some-slug', '/category/hot-deals', '/s/abc']) {
      expect(pathRequiresAuth(path)).toBe(false)
    }
  })
})
