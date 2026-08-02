import { describe, expect, it } from 'vitest'
import {
  VOUCHER_STATUS_LABELS,
  countVouchers,
  formatVoucherCode,
  isLapsedButUnswept,
  isScannable,
} from './voucher-view'

const NOW = new Date('2026-07-28T12:00:00Z')
const FUTURE = '2026-08-28T12:00:00Z'
const PAST = '2026-07-01T12:00:00Z'

describe('isScannable', () => {
  it('accepts an issued voucher inside its window', () => {
    expect(isScannable({ status: 'issued', expires_at: FUTURE }, NOW)).toBe(true)
  })

  it('rejects every non-issued status, including redeemed', () => {
    for (const status of ['redeemed', 'expired', 'cancelled', 'refunded']) {
      expect(isScannable({ status, expires_at: FUTURE }, NOW), status).toBe(false)
    }
  })

  it('rejects an issued voucher whose deadline has passed', () => {
    // The sweep is a cron, so the stored status lags the clock. Trusting it
    // would put a QR next to a voucher the counter will reject.
    expect(isScannable({ status: 'issued', expires_at: PAST }, NOW)).toBe(false)
  })

  it('rejects the exact expiry instant rather than allowing it', () => {
    expect(isScannable({ status: 'issued', expires_at: NOW.toISOString() }, NOW)).toBe(false)
  })

  it('rejects an unparseable expiry instead of assuming it is valid', () => {
    expect(isScannable({ status: 'issued', expires_at: 'not a date' }, NOW)).toBe(false)
  })
})

describe('isLapsedButUnswept', () => {
  it('flags an issued voucher past its deadline', () => {
    expect(isLapsedButUnswept({ status: 'issued', expires_at: PAST }, NOW)).toBe(true)
  })

  it('does not flag one already moved to expired', () => {
    expect(isLapsedButUnswept({ status: 'expired', expires_at: PAST }, NOW)).toBe(false)
  })

  it('does not flag a live voucher', () => {
    expect(isLapsedButUnswept({ status: 'issued', expires_at: FUTURE }, NOW)).toBe(false)
  })

  it('is the exact complement of isScannable within issued', () => {
    for (const expires of [FUTURE, PAST, NOW.toISOString()]) {
      const v = { status: 'issued', expires_at: expires }
      expect(isScannable(v, NOW)).toBe(!isLapsedButUnswept(v, NOW))
    }
  })
})

describe('countVouchers', () => {
  it('counts a lapsed-but-unswept voucher as lapsed, never as scannable', () => {
    const counts = countVouchers(
      [
        { status: 'issued', expires_at: FUTURE },
        { status: 'issued', expires_at: PAST },
        { status: 'redeemed', expires_at: PAST },
        { status: 'expired', expires_at: PAST },
        { status: 'cancelled', expires_at: PAST },
        { status: 'refunded', expires_at: PAST },
      ],
      NOW,
    )
    expect(counts).toEqual({
      total: 6,
      scannable: 1,
      redeemed: 1,
      expired: 1,
      lapsedUnswept: 1,
      cancelled: 1,
      refunded: 1,
    })
  })

  it('never double-counts: the buckets sum to the total', () => {
    const vouchers = [
      { status: 'issued', expires_at: FUTURE },
      { status: 'issued', expires_at: FUTURE },
      { status: 'issued', expires_at: PAST },
      { status: 'redeemed', expires_at: PAST },
      { status: 'expired', expires_at: PAST },
    ]
    const c = countVouchers(vouchers, NOW)
    expect(c.scannable + c.redeemed + c.expired + c.lapsedUnswept + c.cancelled + c.refunded).toBe(
      c.total,
    )
  })

  it('handles an empty table', () => {
    expect(countVouchers([], NOW).total).toBe(0)
  })
})

describe('formatVoucherCode', () => {
  it('groups in fours so a code can be read aloud', () => {
    expect(formatVoucherCode('KE1234567890')).toBe('KE12-3456-7890')
  })

  it('leaves a short code alone and never trails a separator', () => {
    expect(formatVoucherCode('ABCD')).toBe('ABCD')
    expect(formatVoucherCode('ABCDEFGH')).toBe('ABCD-EFGH')
  })

  it('strips whitespace before grouping', () => {
    expect(formatVoucherCode(' KE12 3456 ')).toBe('KE12-3456')
  })
})

describe('VOUCHER_STATUS_LABELS', () => {
  it('covers exactly the live voucher_status enum', () => {
    // Measured 2026-07-28: public.voucher_status is these five, in this order.
    // The retired coupon_status enum used 'used' where this one says 'redeemed';
    // labelling by the wrong enum is how the old screen mislabelled rows.
    expect(Object.keys(VOUCHER_STATUS_LABELS)).toEqual([
      'issued',
      'redeemed',
      'expired',
      'cancelled',
      'refunded',
    ])
  })
})
