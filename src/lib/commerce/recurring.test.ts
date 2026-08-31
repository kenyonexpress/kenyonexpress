import { describe, expect, it } from 'vitest'
import {
  BILLING_INTERVALS,
  type BillableSubscription,
  MAX_CHARGE_ATTEMPTS,
  applyChargeOutcome,
  cadenceLabel,
  canCancel,
  cancellationNotice,
  cyclesPerYear,
  dueSubscriptions,
  isBillingInterval,
  isExhausted,
  isRecurringProduct,
  nextChargeAt,
  normalizeIntervalCount,
  previewRecurringMoney,
  readRecurringProductFields,
  recurringCycleMoney,
} from './recurring'

function sub(over: Partial<BillableSubscription> = {}): BillableSubscription {
  return {
    id: 'a',
    status: 'active',
    next_charge_at: '2026-01-01T00:00:00.000Z',
    failed_attempts: 0,
    cardcom_token: 'tok_live',
    amount_agorot: 4990,
    ...over,
  }
}

describe('interval coercion', () => {
  it('accepts only the two intervals', () => {
    expect(BILLING_INTERVALS).toEqual(['monthly', 'yearly'])
    expect(isBillingInterval('monthly')).toBe(true)
    expect(isBillingInterval('yearly')).toBe(true)
    expect(isBillingInterval('weekly')).toBe(false)
    expect(isBillingInterval('')).toBe(false)
    expect(isBillingInterval(null)).toBe(false)
  })

  it('rejects a count that is not a positive integer instead of rounding it', () => {
    expect(normalizeIntervalCount('3')).toBe(3)
    expect(normalizeIntervalCount(1)).toBe(1)
    expect(normalizeIntervalCount(0)).toBeNull()
    expect(normalizeIntervalCount(-2)).toBeNull()
    expect(normalizeIntervalCount(1.5)).toBeNull()
    expect(normalizeIntervalCount('')).toBeNull()
    expect(normalizeIntervalCount('abc')).toBeNull()
  })
})

describe('nextChargeAt', () => {
  it('advances one month', () => {
    expect(nextChargeAt('2026-03-10T08:00:00.000Z', 'monthly')).toBe('2026-04-10T08:00:00.000Z')
  })

  it('clamps into a short month and then returns to the anchor day', () => {
    // The failure this prevents: adding 30 days would walk a 31st-of-the-month
    // subscription backwards through the calendar over a year.
    const feb = nextChargeAt('2026-01-31T00:00:00.000Z', 'monthly')
    expect(feb).toBe('2026-02-28T00:00:00.000Z')
    expect(nextChargeAt('2026-01-31T00:00:00.000Z', 'monthly', 2)).toBe('2026-03-31T00:00:00.000Z')
  })

  it('handles February in a leap year', () => {
    expect(nextChargeAt('2028-01-31T00:00:00.000Z', 'monthly')).toBe('2028-02-29T00:00:00.000Z')
  })

  it('crosses a year boundary', () => {
    expect(nextChargeAt('2026-12-15T00:00:00.000Z', 'monthly')).toBe('2027-01-15T00:00:00.000Z')
  })

  it('advances a yearly interval by twelve months', () => {
    expect(nextChargeAt('2026-05-04T00:00:00.000Z', 'yearly')).toBe('2027-05-04T00:00:00.000Z')
    expect(nextChargeAt('2026-05-04T00:00:00.000Z', 'yearly', 2)).toBe('2028-05-04T00:00:00.000Z')
  })

  it('throws rather than returning the epoch on bad input', () => {
    expect(() => nextChargeAt('not-a-date', 'monthly')).toThrow(/unparsable/)
    expect(() => nextChargeAt('2026-01-01T00:00:00.000Z', 'monthly', 0)).toThrow(/positive integer/)
  })
})

describe('recurringCycleMoney', () => {
  it('splits the cycle charge once, supplier is the residual', () => {
    const money = recurringCycleMoney(49.9, 15)
    expect(money.chargeAgorot).toBe(4990)
    expect(money.platformFee + money.supplierDue).toBe(4990)
    expect(money.platformFee).toBe(749) // 4990 * 0.15 = 748.5, rounded once
    expect(money.supplierDue).toBe(4241)
    expect(money.platformKeepsIls).toBe(7.49)
    expect(money.supplierGetsIls).toBe(42.41)
  })

  it('never loses or invents an agora across many awkward percents', () => {
    for (const percent of [7, 13, 17.5, 33.33, 0, 100]) {
      for (const amount of [9.99, 49.9, 120.05, 1.01]) {
        const m = recurringCycleMoney(amount, percent)
        expect(m.platformFee + m.supplierDue).toBe(m.chargeAgorot)
        expect(Number.isInteger(m.platformFee)).toBe(true)
        expect(Number.isInteger(m.supplierDue)).toBe(true)
      }
    }
  })

  it('refuses a non-positive amount instead of billing zero', () => {
    expect(() => recurringCycleMoney(0, 10)).toThrow()
    expect(() => recurringCycleMoney(-5, 10)).toThrow()
  })
})

describe('cadence', () => {
  it('reads as Hebrew a human would say', () => {
    expect(cadenceLabel('monthly', 1)).toBe('כל חודש')
    expect(cadenceLabel('monthly', 2)).toBe('כל חודשיים')
    expect(cadenceLabel('monthly', 3)).toBe('כל 3 חודשים')
    expect(cadenceLabel('yearly', 1)).toBe('כל שנה')
    expect(cadenceLabel('yearly', 2)).toBe('כל שנתיים')
  })

  it('counts cycles per year without rounding', () => {
    expect(cyclesPerYear('monthly', 1)).toBe(12)
    expect(cyclesPerYear('monthly', 3)).toBe(4)
    expect(cyclesPerYear('yearly', 1)).toBe(1)
    expect(cyclesPerYear('yearly', 2)).toBe(0.5)
  })

  it('previews the annual scale of a monthly charge', () => {
    const preview = previewRecurringMoney({
      recurringAmountIls: 49.9,
      platformPercent: 15,
      interval: 'monthly',
      intervalCount: 1,
    })
    expect(preview.chargeIls).toBe(49.9)
    expect(preview.annualIls).toBe(598.8)
    expect(preview.cadenceLabel).toBe('כל חודש')
    expect(preview.platformKeepsIls + preview.supplierGetsIls).toBeCloseTo(49.9, 2)
  })
})

describe('dueSubscriptions', () => {
  const now = '2026-02-01T00:00:00.000Z'

  it('charges an active subscription whose date has passed', () => {
    expect(dueSubscriptions([sub()], now).map((s) => s.id)).toEqual(['a'])
  })

  it('retries a past_due one', () => {
    expect(dueSubscriptions([sub({ status: 'past_due', failed_attempts: 1 })], now)).toHaveLength(1)
  })

  it('skips canceled and paused', () => {
    expect(dueSubscriptions([sub({ status: 'canceled' })], now)).toHaveLength(0)
    expect(dueSubscriptions([sub({ status: 'paused' })], now)).toHaveLength(0)
  })

  it('skips a future date, a null date and an unparsable date', () => {
    expect(
      dueSubscriptions([sub({ next_charge_at: '2026-03-01T00:00:00.000Z' })], now),
    ).toHaveLength(0)
    expect(dueSubscriptions([sub({ next_charge_at: null })], now)).toHaveLength(0)
    expect(dueSubscriptions([sub({ next_charge_at: 'garbage' })], now)).toHaveLength(0)
  })

  it('skips a row with no token, because there is nothing to charge', () => {
    expect(dueSubscriptions([sub({ cardcom_token: null })], now)).toHaveLength(0)
    expect(dueSubscriptions([sub({ cardcom_token: '' })], now)).toHaveLength(0)
  })

  it('stops retrying at the attempt ceiling', () => {
    expect(
      dueSubscriptions([sub({ failed_attempts: MAX_CHARGE_ATTEMPTS, status: 'past_due' })], now),
    ).toHaveLength(0)
  })

  it('drains oldest first so a backlog does not starve the earliest cycle', () => {
    const rows = [
      sub({ id: 'new', next_charge_at: '2026-01-30T00:00:00.000Z' }),
      sub({ id: 'old', next_charge_at: '2025-12-01T00:00:00.000Z' }),
      sub({ id: 'mid', next_charge_at: '2026-01-10T00:00:00.000Z' }),
    ]
    expect(dueSubscriptions(rows, now).map((s) => s.id)).toEqual(['old', 'mid', 'new'])
    expect(dueSubscriptions(rows, now, 2).map((s) => s.id)).toEqual(['old', 'mid'])
  })

  it('is deterministic when two rows share a due date', () => {
    const rows = [sub({ id: 'b' }), sub({ id: 'a' })]
    expect(dueSubscriptions(rows, now).map((s) => s.id)).toEqual(['a', 'b'])
  })
})

describe('applyChargeOutcome', () => {
  it('advances from the date that was due, not from the moment the run fired', () => {
    // A run four hours late must not push every later cycle four hours later.
    const update = applyChargeOutcome(
      { next_charge_at: '2026-02-01T00:00:00.000Z', failed_attempts: 2 },
      { success: true },
      { nowIso: '2026-02-01T04:00:00.000Z', interval: 'monthly', intervalCount: 1 },
    )
    expect(update.next_charge_at).toBe('2026-03-01T00:00:00.000Z')
    expect(update.status).toBe('active')
    expect(update.failed_attempts).toBe(0)
    expect(update.last_charge_at).toBe('2026-02-01T04:00:00.000Z')
  })

  it('a failure marks past_due, counts the attempt and leaves the cycle in place', () => {
    const update = applyChargeOutcome(
      { next_charge_at: '2026-02-01T00:00:00.000Z', failed_attempts: 0 },
      { success: false },
      { nowIso: '2026-02-01T04:00:00.000Z', interval: 'monthly' },
    )
    expect(update.status).toBe('past_due')
    expect(update.failed_attempts).toBe(1)
    expect(update.next_charge_at).toBe('2026-02-01T00:00:00.000Z')
    expect(update.last_charge_at).toBeNull()
  })

  it('never auto-cancels, even at the ceiling', () => {
    const update = applyChargeOutcome(
      { next_charge_at: '2026-02-01T00:00:00.000Z', failed_attempts: MAX_CHARGE_ATTEMPTS - 1 },
      { success: false },
      { nowIso: '2026-02-01T00:00:00.000Z', interval: 'monthly' },
    )
    expect(update.status).toBe('past_due')
    expect(isExhausted({ failed_attempts: update.failed_attempts })).toBe(true)
  })

  it('a recovered card resumes on the cycle it died on', () => {
    const failed = applyChargeOutcome(
      { next_charge_at: '2026-02-01T00:00:00.000Z', failed_attempts: 0 },
      { success: false },
      { nowIso: '2026-02-01T00:00:00.000Z', interval: 'monthly' },
    )
    const recovered = applyChargeOutcome(
      { next_charge_at: failed.next_charge_at, failed_attempts: failed.failed_attempts },
      { success: true },
      { nowIso: '2026-02-03T00:00:00.000Z', interval: 'monthly' },
    )
    expect(recovered.next_charge_at).toBe('2026-03-01T00:00:00.000Z')
    expect(recovered.failed_attempts).toBe(0)
  })
})

describe('cancellation', () => {
  it('allows cancelling anything that is not already cancelled', () => {
    expect(canCancel('active')).toBe(true)
    expect(canCancel('past_due')).toBe(true)
    expect(canCancel('paused')).toBe(true)
    expect(canCancel('canceled')).toBe(false)
  })

  it('says plainly that the paid cycle runs out and is not refunded', () => {
    const notice = cancellationNotice('2026-03-01T00:00:00.000Z')
    expect(notice).toContain('לא יבוצע חיוב נוסף')
    expect(notice).toContain('אין החזר')
    expect(cancellationNotice(null)).toContain('מיידית')
    expect(cancellationNotice('garbage')).toContain('לא יבוצע חיוב נוסף')
  })
})

describe('reading a row whose columns may not exist yet', () => {
  it('returns all-null for a row from the un-migrated database', () => {
    // This is the real state of production on 2026-08-07: 135 is not
    // applied, so the columns are absent from the row, not null in it.
    const fields = readRecurringProductFields({ id: 'p1', type: 'physical', price_ils: 100 })
    expect(fields).toEqual({ amountAgorot: null, interval: null, intervalCount: null })
  })

  it('reads the three columns once they exist', () => {
    expect(
      readRecurringProductFields({
        recurring_amount_agorot: 4990,
        billing_interval: 'monthly',
        billing_interval_count: 3,
      }),
    ).toEqual({ amountAgorot: 4990, interval: 'monthly', intervalCount: 3 })
  })

  it('rejects a non-integer or non-positive amount rather than passing it on', () => {
    expect(readRecurringProductFields({ recurring_amount_agorot: 49.9 }).amountAgorot).toBeNull()
    expect(readRecurringProductFields({ recurring_amount_agorot: 0 }).amountAgorot).toBeNull()
    expect(readRecurringProductFields({ recurring_amount_agorot: '4990' }).amountAgorot).toBeNull()
  })

  it('rejects an unknown interval', () => {
    expect(readRecurringProductFields({ billing_interval: 'weekly' }).interval).toBeNull()
  })

  it('survives null, undefined and a non-object', () => {
    for (const input of [null, undefined, 'x', 7, []]) {
      expect(readRecurringProductFields(input)).toEqual({
        amountAgorot: null,
        interval: null,
        intervalCount: null,
      })
    }
  })

  it('identifies a recurring product without the enum label existing in the types', () => {
    expect(isRecurringProduct({ type: 'recurring' })).toBe(true)
    expect(isRecurringProduct({ type: 'physical' })).toBe(false)
    expect(isRecurringProduct(null)).toBe(false)
    expect(isRecurringProduct(undefined)).toBe(false)
  })
})
