import { describe, expect, it } from 'vitest'
import {
  type ScanResultOutcome,
  buildScanResultView,
  formatCouponDateTime,
} from './scan-result-view'

// A coupon with a face value of 120, of which the customer paid 40 on the site.
// The business therefore collects 80 at the counter.
const MONEY = {
  faceValueAgorot: 12000,
  couponPriceAgorot: 4000,
  remainingAmountDueAgorot: 8000,
}

const REDEEMED_AT = '2026-08-11T14:32:00.000Z'
const EXPIRES_AT = '2026-07-01T20:59:00.000Z'

describe('buildScanResultView — success', () => {
  it('shows the amount to collect, which is face value minus what was paid on site', () => {
    const view = buildScanResultView({ outcome: 'success', redeemedAt: REDEEMED_AT, ...MONEY })
    expect(view.tone).toBe('success')
    expect(view.payAtBusinessAgorot).toBe(8000)
    expect(view.payLabel).toBe('לגבות מהלקוח')
    expect(view.headline).toBe('השובר מומש בהצלחה')
  })

  it('states all three money facts the counter needs', () => {
    const view = buildScanResultView({ outcome: 'success', redeemedAt: REDEEMED_AT, ...MONEY })
    const byLabel = Object.fromEntries(view.rows.map((r) => [r.label, r.value]))
    expect(byLabel['שולם באתר']).toBe('₪40.00')
    expect(byLabel['שווי מלא']).toBe('₪120.00')
    // The redemption just made, so the cashier can point at it if asked.
    expect(byLabel['מומש ב']).toContain('2026')
  })

  it('names a replay as a replay rather than claiming a second redemption', () => {
    // A double tap on a flaky till connection returns the first result again.
    // "Redeemed successfully" a second time would read as two redemptions.
    const view = buildScanResultView({
      outcome: 'success',
      redeemedAt: REDEEMED_AT,
      replayed: true,
      ...MONEY,
    })
    expect(view.headline).toBe('השובר כבר מומש בסריקה זו')
    expect(view.payAtBusinessAgorot).toBe(8000)
  })

  it('collects nothing when the coupon was prepaid in full', () => {
    const view = buildScanResultView({
      outcome: 'success',
      redeemedAt: REDEEMED_AT,
      faceValueAgorot: 12000,
      couponPriceAgorot: 12000,
      remainingAmountDueAgorot: 0,
    })
    // Zero, not null: the scan succeeded and the honest answer is "take nothing".
    expect(view.payAtBusinessAgorot).toBe(0)
  })
})

describe('buildScanResultView — failures', () => {
  it('gives the ORIGINAL redemption date and time for an already-redeemed voucher', () => {
    // The reason this matters at a counter: a voucher burned four minutes ago
    // at the till next door is a different conversation from one burned last
    // Tuesday, and a date with no time cannot tell those apart.
    const view = buildScanResultView({ outcome: 'already_redeemed', redeemedAt: REDEEMED_AT })
    expect(view.tone).toBe('failure')
    expect(view.headline).toBe('השובר כבר מומש')
    expect(view.reason).toContain('2026')
    expect(view.reason).toMatch(/\d{1,2}:\d{2}/)
    expect(view.rows[0]?.label).toBe('מומש במקור')
    expect(view.rows[0]?.value).toMatch(/\d{1,2}:\d{2}/)
  })

  it('gives the expiry date for an expired voucher', () => {
    const view = buildScanResultView({ outcome: 'expired', expiresAt: EXPIRES_AT })
    expect(view.headline).toBe('השובר פג תוקף')
    expect(view.reason).toContain('2026')
  })

  it('survives an expired voucher with no expiry timestamp', () => {
    const view = buildScanResultView({ outcome: 'expired' })
    expect(view.reason).toBe('תוקף השובר פג.')
    expect(view.rows).toHaveLength(0)
  })

  it('says the money went back for a refunded voucher', () => {
    const view = buildScanResultView({ outcome: 'refunded' })
    expect(view.headline).toBe('השובר זוכה')
    expect(view.reason).toContain('הוחזר')
  })

  it('names a cancelled voucher', () => {
    expect(buildScanResultView({ outcome: 'cancelled' }).headline).toBe('השובר בוטל')
  })

  it('tells a not-found scan to check the code against the customer screen', () => {
    const view = buildScanResultView({ outcome: 'not_found' })
    expect(view.headline).toBe('שובר לא נמצא')
    expect(view.reason).toContain('ודאו את הקוד')
  })

  it('leaks nothing extra on not_found, which is also the wrong-supplier answer', () => {
    // The API collapses wrong_supplier to not_found (toPublicOutcome) so that a
    // supplier cannot probe whether another business's code exists. If this
    // view ever added a detail row for not_found, the two answers would stop
    // being identical on screen and the collapse would be undone in the UI.
    const view = buildScanResultView({ outcome: 'not_found' })
    expect(view.rows).toHaveLength(0)
    expect(view.reason).not.toContain('עסק אחר')
  })

  it('falls back to a generic headline for an outcome it has never seen', () => {
    const view = buildScanResultView({ outcome: 'something_new_from_the_db' })
    expect(view.tone).toBe('failure')
    expect(view.headline).toBe('הסריקה נכשלה')
    expect(view.payAtBusinessAgorot).toBeNull()
  })
})

describe('the safety property: a refused scan never shows money to collect', () => {
  const FAILURES: ScanResultOutcome[] = [
    'already_redeemed',
    'expired',
    'cancelled',
    'refunded',
    'not_found',
    'wrong_supplier',
    'unauthorized',
    'rate_limited',
    'invalid_request',
    'invalid_signature',
  ]

  it.each(FAILURES)('%s returns no amount even when money fields are present', (outcome) => {
    // The money fields are deliberately supplied. A failure must discard them:
    // "already redeemed" and "collect 80" on one screen is a voucher paid twice.
    const view = buildScanResultView({
      outcome,
      redeemedAt: REDEEMED_AT,
      expiresAt: EXPIRES_AT,
      ...MONEY,
    })
    expect(view.tone).toBe('failure')
    expect(view.payAtBusinessAgorot).toBeNull()
    expect(view.payLabel).toBe('')
  })

  it('is the only outcome that yields an amount', () => {
    const success = buildScanResultView({ outcome: 'success', redeemedAt: REDEEMED_AT, ...MONEY })
    expect(success.payAtBusinessAgorot).not.toBeNull()
  })
})

describe('formatCouponDateTime', () => {
  it('carries a time, which formatCouponDate does not', () => {
    expect(formatCouponDateTime(REDEEMED_AT)).toMatch(/\d{1,2}:\d{2}/)
  })

  it('returns a dash for null and for an unparseable string', () => {
    expect(formatCouponDateTime(null)).toBe('—')
    expect(formatCouponDateTime('not-a-date')).toBe('—')
  })
})
