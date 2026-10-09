import {
  MAX_PLAUSIBLE_DISCOUNT_PERCENT,
  isImplausibleDiscount,
  isImplausibleDiscountAgorot,
} from '@/lib/commerce/implausible-discount'
import { agorot, ilsToAgorot } from '@/lib/commerce/money'
import { describe, expect, it } from 'vitest'

/**
 * THE ROWS BELOW ARE REAL. Every price in the first two blocks was read out of
 * the production `products` table on 2026-09-06, not invented for the test. A
 * threshold justified by a measured distribution has to be tested against that
 * distribution, or the justification is decoration.
 */

/** The row `migrations/pending/172` exists to take out of the catalogue. */
const MASTER_PRODUCT = { name: 'מוצר ראשי מאסטר Master Product', sell: 1, compareAt: 400 }

/**
 * Live, legitimate, and the deepest real discounts in the catalogue.
 *
 * The first three are the deepest that carry a `full_price`, which is the only
 * compare-at column the guard reads. תספורת is kept deliberately even though
 * its compare-at lives in another column and the guard therefore never sees a
 * ratio for it: at 60% it is the deepest discount anyone has entered ANYWHERE
 * in this catalogue, so it is the strongest case that the ceiling must clear.
 */
const REAL_LISTINGS = [
  { name: 'תספורת לגבר, ילד, סידור זקן בפתח תקווה', sell: 20, compareAt: 50 }, // 60%
  { name: 'הסרת שיער בלייזר קר', sell: 250, compareAt: 500 }, // 50%, deepest on full_price
  { name: 'תיק עור JEEP יוקרתי', sell: 99, compareAt: 195 }, // 49.23%
  { name: 'קמפיין ענק בפייסבוק', sell: 999, compareAt: 1600 }, // 37.56%
]

describe('the implausible-discount guard against the real catalogue', () => {
  it('refuses the ₪1-of-₪400 row', () => {
    expect(isImplausibleDiscount(MASTER_PRODUCT.sell, MASTER_PRODUCT.compareAt)).toBe(true)
  })

  it('sells every real listing, including the deepest genuine discount', () => {
    // If this ever goes red, the threshold has been lowered onto a price a
    // human actually entered and the catalogue has stopped selling something
    // real. That is a worse failure than the one the guard prevents.
    for (const listing of REAL_LISTINGS) {
      expect(
        isImplausibleDiscount(listing.sell, listing.compareAt),
        `${listing.name} must stay sellable`,
      ).toBe(false)
    }
  })

  it('keeps real headroom on both sides rather than sitting on a boundary', () => {
    // The deepest real discount is 60% off anywhere in the catalogue (50% on
    // the column this guard reads) and the offender is 99.75% off. A
    // threshold wedged against either end would be one price edit away from
    // being wrong, so assert the gap itself, not just the verdicts.
    expect(MAX_PLAUSIBLE_DISCOUNT_PERCENT).toBeGreaterThanOrEqual(80)
    expect(MAX_PLAUSIBLE_DISCOUNT_PERCENT).toBeLessThan(99)
    // A 90%-off campaign is a thing a business does. It must still sell.
    expect(isImplausibleDiscount(10, 100)).toBe(false)
  })
})

describe('the threshold boundary', () => {
  it('sells at exactly the deepest allowed discount and refuses one agora past it', () => {
    // At MAX = 95 the rule is `sell * 100 <= compareAt * 5`. On a ₪100
    // compare-at that puts the last sellable price at ₪5.00 exactly.
    expect(isImplausibleDiscount(5.01, 100)).toBe(false)
    expect(isImplausibleDiscount(5.0, 100)).toBe(true)
    expect(isImplausibleDiscount(4.99, 100)).toBe(true)
  })

  it('decides in integer agorot, with no rounding to argue about', () => {
    // The float form of this comparison, `1 - 0.07 / 1.4 > 0.95`, is false by
    // 2.2e-16 on some inputs and true on others. The integer form cannot be.
    expect(isImplausibleDiscountAgorot(agorot(7), agorot(140))).toBe(true)
    expect(isImplausibleDiscountAgorot(agorot(8), agorot(140))).toBe(false)
  })
})

describe('what is deliberately not a finding', () => {
  it('says nothing about a product with no compare-at price', () => {
    // Most of the catalogue. A row with no compare-at is not discounted, and a
    // guard that read a missing column as a fault would refuse to sell it.
    expect(isImplausibleDiscount(1, null)).toBe(false)
    expect(isImplausibleDiscount(1, undefined)).toBe(false)
    expect(isImplausibleDiscount(null, 400)).toBe(false)
  })

  it('says nothing about a zero or negative compare-at', () => {
    expect(isImplausibleDiscount(1, 0)).toBe(false)
    expect(isImplausibleDiscount(1, -400)).toBe(false)
  })

  it('says nothing when the sell price is not below the compare-at', () => {
    expect(isImplausibleDiscount(400, 400)).toBe(false)
    expect(isImplausibleDiscount(500, 400)).toBe(false)
  })

  it('says nothing about a price it cannot parse, rather than throwing', () => {
    // `unpriced` in the cart pricer already refuses these, and claiming them
    // here would report the wrong reason for the refusal. Throwing would be
    // worse still: this runs inside the cart pricer, which prices every line.
    expect(() => isImplausibleDiscount('not a price', 400)).not.toThrow()
    expect(isImplausibleDiscount('not a price', 400)).toBe(false)
    expect(isImplausibleDiscount(1, 'nonsense')).toBe(false)
  })

  it('accepts the numeric column shapes PostgREST actually returns', () => {
    // `numeric(12,2)` arrives as a JS number, and a string on some paths.
    expect(isImplausibleDiscount('1.00', '400.00')).toBe(true)
    expect(isImplausibleDiscount(1.0, 400.0)).toBe(true)
    // Third decimal place: `ilsToAgorot` rejects it outright, so the ILS form
    // has to round it off before converting or the guard silently switches off.
    expect(isImplausibleDiscount(1.005, 400)).toBe(true)
  })
})

describe('a compare-at that is wrong, rather than a price that is wrong', () => {
  /**
   * Raised by the second agent reviewing this, and it is the case that decides
   * whether the guard is usable rather than merely correct.
   *
   * The denominator is the compare-at, so a fat-fingered compare-at trips the
   * same wire as a fat-fingered price -- except here the LISTING is genuine and
   * only one column is wrong. The refusal is still the right call: a product
   * advertising 99.4% off is not sellable on either reading, and guessing which
   * of the two numbers the merchant meant would be inventing a price.
   *
   * What that obliges is legibility, not leniency. `ProductsTable` renders both
   * numbers and the ceiling next to the product, because the person reading the
   * admin is the one who can fix it -- unlike the shopper, who gets the vague
   * sentence on purpose.
   */
  it('refuses a real ₪250 product whose compare-at gained a zero', () => {
    // ₪250 against ₪40,000: 99.375% off. A digit slipped, not a bargain.
    expect(isImplausibleDiscount(250, 40000)).toBe(true)
  })

  it('still sells at the fat-finger one order of magnitude smaller', () => {
    // ₪250 against ₪4,000 is 93.75% off -- deep, implausible-looking, and
    // BELOW the ceiling. Asserted so the boundary is understood rather than
    // assumed: the guard does not catch every typo and is not meant to.
    expect(isImplausibleDiscount(250, 4000)).toBe(false)
  })
})

describe('the two forms agree', () => {
  it('gives the same verdict through agorot as through shekels', () => {
    for (const listing of [...REAL_LISTINGS, MASTER_PRODUCT]) {
      expect(
        isImplausibleDiscountAgorot(
          ilsToAgorot(listing.sell.toFixed(2)),
          ilsToAgorot(listing.compareAt.toFixed(2)),
        ),
      ).toBe(isImplausibleDiscount(listing.sell, listing.compareAt))
    }
  })
})
