import { agorot } from '@/lib/money'
import { describe, expect, it } from 'vitest'
import {
  couponStatusLabel,
  couponStatusTone,
  formatDate,
  formatDateTime,
  formatIls,
  formatVoucherCode,
  ilsColumnToAgorot,
  orderStatusLabel,
  orderStatusTone,
  voucherTab,
} from './format'

describe('formatIls (agorot via money.ts)', () => {
  it('formats integer agorot as shekels', () => {
    expect(formatIls(agorot(0))).toMatch(/0\.00/)
    expect(formatIls(agorot(500))).toMatch(/5\.00/)
    expect(formatIls(agorot(1250))).toMatch(/12\.50/)
  })

  it('rejects non-integer float ILS masquerading as agorot', () => {
    expect(() => formatIls(12.5)).toThrow()
  })
})

describe('ilsColumnToAgorot', () => {
  it('converts a decimal ILS column into integer agorot', () => {
    expect(ilsColumnToAgorot(12.5)).toBe(1250)
    expect(ilsColumnToAgorot(0)).toBe(0)
    expect(ilsColumnToAgorot(null)).toBe(0)
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
    expect(orderStatusLabel('escrow_released')).toBe('הושלמה')
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

describe('coupon status', () => {
  it('covers voucher + legacy coupon_status values', () => {
    for (const status of ['issued', 'used', 'redeemed', 'expired', 'refunded']) {
      expect(couponStatusLabel(status)).not.toBe(status)
    }
  })

  it('treats an issued coupon as live and an expired one as dead', () => {
    expect(couponStatusTone('issued')).toBe('ok')
    expect(couponStatusTone('used')).toBe('warn')
    expect(couponStatusTone('redeemed')).toBe('warn')
    expect(couponStatusTone('expired')).toBe('dead')
    expect(couponStatusTone('refunded')).toBe('dead')
  })
})

describe('voucherTab', () => {
  const future = '2099-01-01T00:00:00Z'
  const past = '2020-01-01T00:00:00Z'

  it('puts issued+valid under active', () => {
    expect(voucherTab({ status: 'issued', expires_at: future })).toBe('active')
  })

  it('puts redeemed under redeemed', () => {
    expect(voucherTab({ status: 'redeemed', expires_at: future })).toBe('redeemed')
  })

  it('puts expired status or past expiry under expired', () => {
    expect(voucherTab({ status: 'expired', expires_at: future })).toBe('expired')
    expect(voucherTab({ status: 'issued', expires_at: past })).toBe('expired')
  })
})

describe('formatVoucherCode', () => {
  it('inserts a dash after five characters', () => {
    expect(formatVoucherCode('ABCDE12345')).toBe('ABCDE-12345')
  })
})
