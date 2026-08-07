import { agorot } from '@/lib/money'
import { describe, expect, it } from 'vitest'
import {
  formatDate,
  formatDateTime,
  formatIls,
  ilsColumnToAgorot,
  orderStatusLabel,
  orderStatusTone,
} from './format'

// he-IL currency formatting emits RTL marks around the symbol. Asserting on the
// digits rather than on the exact byte sequence keeps these tests about the
// money and not about Unicode bidi.
const digits = (s: string) => s.replace(/[^\d.,-]/g, '')

describe('formatIls', () => {
  it('always shows two decimals', () => {
    expect(digits(formatIls(agorot(0)))).toBe('0.00')
    expect(digits(formatIls(agorot(500)))).toBe('5.00')
    expect(digits(formatIls(agorot(1250)))).toBe('12.50')
  })

  it('keeps the sign for a negative balance', () => {
    expect(digits(formatIls(agorot(-320)))).toBe('-3.20')
  })

  it('refuses a float, which is the whole point of the branded parameter', () => {
    // The account area used to hand this function `balanceAgorot / 100` and
    // `Number(row.amount_ils)`. Both are floats, and both used to format fine.
    expect(() => formatIls(12.345 as never)).toThrow()
  })
})

describe('ilsColumnToAgorot', () => {
  it('reads a legacy decimal column as exact agorot', () => {
    expect(ilsColumnToAgorot('12.50')).toBe(1250)
    expect(ilsColumnToAgorot(12.5)).toBe(1250)
    expect(ilsColumnToAgorot(0)).toBe(0)
    expect(ilsColumnToAgorot(null)).toBe(0)
    expect(ilsColumnToAgorot('')).toBe(0)
  })

  it('parses instead of multiplying, so the float error never appears', () => {
    // 8.20 * 100 is 819.9999999999999 in IEEE 754.
    expect(ilsColumnToAgorot('8.20')).toBe(820)
    expect(ilsColumnToAgorot(8.2)).toBe(820)
  })

  it('keeps a debit negative', () => {
    expect(ilsColumnToAgorot('-3.20')).toBe(-320)
  })

  it('throws on a value it cannot represent exactly', () => {
    expect(() => ilsColumnToAgorot('10.005')).toThrow()
    expect(() => ilsColumnToAgorot('not money')).toThrow()
  })
})

describe('date formatting', () => {
  it('renders a fixed instant in Asia/Jerusalem', () => {
    // 2026-07-24T05:30:00Z is 08:30 Israel time (UTC+3 in July).
    expect(formatDate('2026-07-24T05:30:00Z')).toBe('24.07.2026')
    expect(formatDateTime('2026-07-24T05:30:00Z')).toContain('08:30')
  })

  it('does not crash on a missing date', () => {
    expect(formatDate(null)).toBe('לא זמין')
    expect(formatDateTime(null)).toBe('לא זמין')
  })
})

describe('order status', () => {
  it('maps the settlement states the order queries emit', () => {
    expect(orderStatusLabel('pending')).toBe('ממתינה לתשלום')
    expect(orderStatusLabel('paid')).toBe('שולמה')
    expect(orderStatusLabel('split_executed')).toBe('הושלמה')
    expect(orderStatusLabel('cancelled')).toBe('בוטלה')
  })

  it('falls through to the raw value rather than inventing a label', () => {
    expect(orderStatusLabel('some_new_state')).toBe('some_new_state')
  })

  it('tones cancelled and refunded as dead, pending as warn', () => {
    expect(orderStatusTone('cancelled')).toBe('dead')
    expect(orderStatusTone('refunded')).toBe('dead')
    expect(orderStatusTone('pending')).toBe('warn')
    expect(orderStatusTone('paid')).toBe('ok')
  })
})

// Coupon status is no longer presented from this module. The cases that were
// here tested `coupon_status` from 008 (issued / used / expired / refunded),
// which is not the enum the live database has: `voucher_status` is issued,
// redeemed, expired, cancelled, refunded. Both are now covered against the real
// enum in lib/vouchers/coupon-view.test.ts, by the module the counter uses.
