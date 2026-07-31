import { describe, expect, it } from 'vitest'
import {
  type DiscountCampaign,
  evaluateDiscount,
  normalizeDiscountCode,
  percentOfAgorot,
} from './discount'

const NOW = new Date('2026-07-29T12:00:00Z')

function campaign(over: Partial<DiscountCampaign> = {}): DiscountCampaign {
  return {
    id: 'c1',
    code: 'SUMMER',
    name: 'Summer',
    kind: 'percent',
    percent_bp: 1000, // 10%
    amount_agorot: null,
    min_order_agorot: 0,
    max_discount_agorot: null,
    starts_at: null,
    expires_at: null,
    max_uses: null,
    max_uses_per_user: 1,
    used_count: 0,
    allow_stacking: false,
    is_active: true,
    ...over,
  }
}

/** A cart with plenty of commission, so ceilings do not interfere by accident. */
const ROOMY = { payableAgorot: 100_00, commissionAgorot: 50_00 }

describe('percentOfAgorot', () => {
  it('is integer arithmetic in basis points', () => {
    expect(percentOfAgorot(100_00, 1000)).toBe(10_00) // 10% of 100.00
    expect(percentOfAgorot(100_00, 1250)).toBe(12_50) // 12.5%, no float confusion
    expect(percentOfAgorot(100_00, 10000)).toBe(100_00)
  })

  it('rounds half up and returns a safe integer', () => {
    // 33.33 at 10% is 3.333, which must land on a whole agora and never 3.333.
    const out = percentOfAgorot(33_33, 1000)
    expect(Number.isSafeInteger(out)).toBe(true)
    expect(out).toBe(333)
  })
})

describe('normalizeDiscountCode', () => {
  it('matches what the database CHECK stores', () => {
    expect(normalizeDiscountCode('  summer 25 ')).toBe('SUMMER25')
    expect(normalizeDiscountCode('SuMmEr')).toBe('SUMMER')
    expect(normalizeDiscountCode(null)).toBe('')
    expect(normalizeDiscountCode(42)).toBe('')
  })
})

describe('evaluateDiscount: the window', () => {
  it('refuses an unknown code', () => {
    const r = evaluateDiscount(null, ROOMY, NOW)
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.reason).toBe('unknown')
  })

  it('refuses an inactive campaign', () => {
    const r = evaluateDiscount(campaign({ is_active: false }), ROOMY, NOW)
    expect(r.ok === false && r.reason).toBe('inactive')
  })

  it('refuses one that has not started', () => {
    const r = evaluateDiscount(campaign({ starts_at: '2026-08-01T00:00:00Z' }), ROOMY, NOW)
    expect(r.ok === false && r.reason).toBe('not-started')
  })

  it('treats the expiry instant as already expired', () => {
    // Exactly at expires_at the code is gone. A code valid "until midnight"
    // that still works at midnight is a code that works for one more request.
    const r = evaluateDiscount(campaign({ expires_at: NOW.toISOString() }), ROOMY, NOW)
    expect(r.ok === false && r.reason).toBe('expired')
  })

  it('refuses an exhausted campaign', () => {
    const r = evaluateDiscount(campaign({ max_uses: 5, used_count: 5 }), ROOMY, NOW)
    expect(r.ok === false && r.reason).toBe('exhausted')
  })

  it('refuses a cart below the minimum', () => {
    const r = evaluateDiscount(
      campaign({ min_order_agorot: 200_00 }),
      { payableAgorot: 100_00, commissionAgorot: 50_00 },
      NOW,
    )
    expect(r.ok === false && r.reason).toBe('below-minimum')
  })
})

describe('evaluateDiscount: stacking is off unless opted in', () => {
  it('refuses a second code by default', () => {
    const r = evaluateDiscount(campaign(), { ...ROOMY, hasOtherDiscount: true }, NOW)
    expect(r.ok === false && r.reason).toBe('stacking-not-allowed')
  })

  it('allows it only when the campaign opts in', () => {
    const r = evaluateDiscount(
      campaign({ allow_stacking: true }),
      { ...ROOMY, hasOtherDiscount: true },
      NOW,
    )
    expect(r.ok).toBe(true)
  })
})

describe('evaluateDiscount: whose money it is', () => {
  it('never exceeds the platform commission', () => {
    // 50% of 100.00 is 50.00, but the platform only earns 12.00 on this cart.
    // Paying out more would take the difference from the supplier, who never
    // offered the code. This is the rule the whole module exists to hold.
    const r = evaluateDiscount(
      campaign({ percent_bp: 5000 }),
      { payableAgorot: 100_00, commissionAgorot: 12_00 },
      NOW,
    )
    expect(r.ok).toBe(true)
    expect(r.ok === true && r.discountAgorot).toBe(12_00)
    expect(r.ok === true && r.cappedBy).toBe('commission')
  })

  it('refuses entirely when the cart earns no commission', () => {
    const r = evaluateDiscount(campaign(), { payableAgorot: 100_00, commissionAgorot: 0 }, NOW)
    expect(r.ok === false && r.reason).toBe('no-commission')
  })

  it('refuses when there is nothing payable on site', () => {
    // A coupon product whose entire balance is due at the till.
    const r = evaluateDiscount(campaign(), { payableAgorot: 0, commissionAgorot: 50_00 }, NOW)
    expect(r.ok === false && r.reason).toBe('nothing-to-discount')
  })

  it('never lets the card charge go negative', () => {
    const r = evaluateDiscount(
      campaign({ kind: 'fixed', percent_bp: null, amount_agorot: 500_00 }),
      { payableAgorot: 30_00, commissionAgorot: 100_00 },
      NOW,
    )
    expect(r.ok === true && r.discountAgorot).toBe(30_00)
    expect(r.ok === true && r.cappedBy).toBe('payable')
  })
})

describe('evaluateDiscount: the amount', () => {
  it('computes a percentage in agorot', () => {
    const r = evaluateDiscount(campaign({ percent_bp: 1500 }), ROOMY, NOW)
    expect(r.ok === true && r.discountAgorot).toBe(15_00)
    expect(r.ok === true && r.cappedBy).toBe(null)
  })

  it('computes a fixed amount already in agorot', () => {
    // The old coupons.discount_value held SHEKELS here and a PERCENTAGE for the
    // other kind, in one column. This is the ambiguity the split removed.
    const r = evaluateDiscount(
      campaign({ kind: 'fixed', percent_bp: null, amount_agorot: 25_00 }),
      ROOMY,
      NOW,
    )
    expect(r.ok === true && r.discountAgorot).toBe(25_00)
  })

  it('honours max_discount_agorot on a percentage campaign', () => {
    // "20% off, up to 15 shekels" on a 300 shekel cart.
    const r = evaluateDiscount(
      campaign({ percent_bp: 2000, max_discount_agorot: 15_00 }),
      { payableAgorot: 300_00, commissionAgorot: 100_00 },
      NOW,
    )
    expect(r.ok === true && r.discountAgorot).toBe(15_00)
    expect(r.ok === true && r.cappedBy).toBe('max-discount')
  })

  it('always returns a safe integer number of agorot', () => {
    for (const bp of [1, 333, 999, 1234, 5000, 9999]) {
      for (const payable of [1, 99, 3333, 100_00, 999_99]) {
        const r = evaluateDiscount(
          campaign({ percent_bp: bp }),
          { payableAgorot: payable, commissionAgorot: 1_000_00 },
          NOW,
        )
        if (r.ok) {
          expect(Number.isSafeInteger(r.discountAgorot)).toBe(true)
          expect(r.discountAgorot).toBeGreaterThan(0)
          expect(r.discountAgorot).toBeLessThanOrEqual(payable)
        }
      }
    }
  })
})
