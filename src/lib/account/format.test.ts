import { describe, expect, it } from 'vitest'
import {
  couponStatusLabel,
  couponStatusTone,
  formatDate,
  formatDateTime,
  formatIls,
  orderStatusLabel,
  orderStatusTone,
} from './format'

describe('formatIls', () => {
  it('always shows two decimals', () => {
    expect(formatIls(0)).toBe('₪0.00')
    expect(formatIls(5)).toBe('₪5.00')
    expect(formatIls(12.5)).toBe('₪12.50')
    expect(formatIls(12.345)).toBe('₪12.35')
  })

  it('keeps the sign for a negative balance', () => {
    expect(formatIls(-3.2)).toBe('₪-3.20')
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

describe('coupon status', () => {
  // coupon_status enum from 008: issued / used / expired / refunded.
  it('covers every value of the coupon_status enum', () => {
    for (const status of ['issued', 'used', 'expired', 'refunded']) {
      expect(couponStatusLabel(status)).not.toBe(status)
    }
  })

  it('treats an issued coupon as live and an expired one as dead', () => {
    expect(couponStatusTone('issued')).toBe('ok')
    expect(couponStatusTone('used')).toBe('warn')
    expect(couponStatusTone('expired')).toBe('dead')
    expect(couponStatusTone('refunded')).toBe('dead')
  })
})
