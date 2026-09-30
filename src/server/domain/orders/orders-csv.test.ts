import { toCsv } from '@/lib/reports/csv'
import type { BoardOrder } from '@/server/queries/fulfillment-board'
import { describe, expect, it } from 'vitest'
import { agorotToDecimal, orderCsvColumns, ordersCsvFilename } from './orders-csv'

function order(overrides: Partial<BoardOrder> = {}): BoardOrder {
  return {
    id: '3b6e6f1e-9c2a-4b7e-8d3f-1a2b3c4d5e6f',
    ref: 'KE-1001',
    invoice_number: 'KE-1001',
    status: 'paid',
    lane: 'shipped',
    total_agorot: 123_456,
    created_at: '2026-10-01T08:15:00.000Z',
    customer: 'דנה כהן',
    email: 'dana@example.com',
    phone: '0521234567',
    city: 'חיפה',
    couponLines: 0,
    physicalLines: 2,
    lines: [
      {
        id: 'l1',
        product_type: 'physical',
        item_status: 'shipped',
        carrier: 'חבילה פלוס',
        tracking_number: 'IL1',
      },
      {
        id: 'l2',
        product_type: 'physical',
        item_status: 'shipped',
        carrier: 'חבילה פלוס',
        tracking_number: 'IL2',
      },
    ],
    ...overrides,
  }
}

describe('agorotToDecimal', () => {
  it('prints integer agorot as a two-decimal shekel string without a float', () => {
    expect(agorotToDecimal(123_456)).toBe('1234.56')
    expect(agorotToDecimal(5)).toBe('0.05')
    expect(agorotToDecimal(100)).toBe('1.00')
    expect(agorotToDecimal(0)).toBe('0.00')
    expect(agorotToDecimal(-1250)).toBe('-12.50')
  })
})

describe('orderCsvColumns', () => {
  it('renders one row with the Hebrew lane, the status label, and the tracking numbers joined', () => {
    const csv = toCsv([order()], orderCsvColumns)
    const [header, row] = csv.replace('﻿', '').split('\r\n')
    expect(header).toBe(
      'מספר הזמנה,מזהה,תאריך,לקוח,אימייל,טלפון,עיר,שלב,סטטוס,סוג,פריטים,סכום (₪),מוביל,מספרי מעקב',
    )
    expect(row).toBe(
      'KE-1001,3b6e6f1e-9c2a-4b7e-8d3f-1a2b3c4d5e6f,2026-10-01,דנה כהן,dana@example.com,0521234567,חיפה,נשלחו,שולמה,פיזי,2,1234.56,חבילה פלוס,IL1; IL2',
    )
  })

  it('a coupon-only order has no carrier and reads as קופון; a mixed one as מעורב', () => {
    const coupon = order({
      couponLines: 1,
      physicalLines: 0,
      lines: [
        {
          id: 'c',
          product_type: 'coupon',
          item_status: 'issued',
          carrier: null,
          tracking_number: null,
        },
      ],
    })
    const mixed = order({ couponLines: 1, physicalLines: 1 })
    const csv = toCsv([coupon, mixed], orderCsvColumns)
    const rows = csv.replace('﻿', '').split('\r\n')
    expect(rows[1]).toContain(',קופון,1,1234.56,,')
    expect(rows[2]).toContain(',מעורב,')
  })

  it('guards a tracking number that looks like a formula', () => {
    const csv = toCsv(
      [
        order({
          lines: [
            {
              id: 'l',
              product_type: 'physical',
              item_status: 'shipped',
              carrier: null,
              tracking_number: '=HYPERLINK("x")',
            },
          ],
        }),
      ],
      orderCsvColumns,
    )
    expect(csv).toContain('"\t=HYPERLINK(""x"")"')
  })

  it('names the file in Hebrew with the day and the lane', () => {
    expect(ordersCsvFilename('2026-10-01')).toBe('הזמנות-2026-10-01.csv')
    expect(ordersCsvFilename('2026-10-01', 'shipped')).toBe('הזמנות-shipped-2026-10-01.csv')
  })
})
