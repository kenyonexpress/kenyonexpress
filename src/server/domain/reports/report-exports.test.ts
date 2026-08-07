import { toCsv } from '@/lib/reports/csv'
import { describe, expect, it } from 'vitest'
import { agorotToCsvNumber, reportFilename, salesColumns, supplierColumns } from './report-exports'
import type { PeriodTotals, SupplierObligation } from './settlement-report'

describe('agorotToCsvNumber', () => {
  it('is a plain decimal with no currency symbol and no thousands separator', () => {
    // `formatIls` would give ₪1,250.50, and both of those make Excel store the
    // cell as text — which does not sum, which is the first thing anybody does
    // to an exported money column.
    expect(agorotToCsvNumber(125_050)).toBe('1250.50')
  })

  it('keeps the sign on a negative obligation', () => {
    expect(agorotToCsvNumber(-125_050)).toBe('-1250.50')
  })

  it('pads the agorot so the column lines up', () => {
    expect(agorotToCsvNumber(5)).toBe('0.05')
    expect(agorotToCsvNumber(100)).toBe('1.00')
    expect(agorotToCsvNumber(0)).toBe('0.00')
  })

  it('never goes through a float', () => {
    // 1234567890123 agorot is beyond where `value / 100` stays exact to the
    // agora, and this is the money path.
    expect(agorotToCsvNumber(1_234_567_890_123)).toBe('12345678901.23')
  })
})

function period(overrides: Partial<PeriodTotals> = {}): PeriodTotals {
  return {
    period: '2026-08-06',
    grossAgorot: 100_000,
    commissionAgorot: 30_000,
    supplierDueAgorot: 70_000,
    refundedAgorot: 0,
    discountAgorot: 0,
    orders: 4,
    ...overrides,
  }
}

describe('the sales export', () => {
  it('names the period column for the granularity it was built with', () => {
    expect(salesColumns('day')[0]?.header).toBe('תאריך')
    expect(salesColumns('month')[0]?.header).toBe('חודש')
  })

  it('keeps refunds in their own column rather than netting them off sales', () => {
    const csv = toCsv([period({ refundedAgorot: 9_500 })], salesColumns('day'))
    expect(csv).toContain('2026-08-06,1000.00,300.00,700.00,95.00,0.00,4')
  })
})

describe('the supplier export', () => {
  function supplier(overrides: Partial<SupplierObligation> = {}): SupplierObligation {
    return {
      supplierId: 'sup-1',
      supplierName: 'מסעדת הים',
      earnedAgorot: 70_000,
      debitedAgorot: 0,
      settledAgorot: 0,
      openAgorot: 70_000,
      ...overrides,
    }
  }

  it('exports a negative obligation as a NUMBER, not as guarded text', () => {
    // The end-to-end version of the csv.ts rule: a supplier refunded after being
    // paid out owes money back, and that figure has to sum and sort in Excel.
    const csv = toCsv([supplier({ openAgorot: -125_050 })], supplierColumns)
    expect(csv).toContain(',-1250.50')
    expect(csv).not.toContain('\t-1250.50')
  })

  it('carries the id next to the name, so a nameless row is still identifiable', () => {
    const csv = toCsv([supplier({ supplierName: null })], supplierColumns)
    expect(csv).toContain('ללא שם,sup-1')
  })

  it('never says escrow or נאמנות', () => {
    // There is no Escrow here and no J5 (decision C3).
    const headers = supplierColumns
      .map((c) => c.header)
      .join(' ')
      .toLowerCase()
    expect(headers).not.toContain('escrow')
    expect(headers).not.toContain('נאמנות')
    expect(headers).toContain('התחייבות פתוחה')
  })
})

describe('reportFilename', () => {
  it('carries the range, so two exports do not collide in a downloads folder', () => {
    expect(reportFilename('sales', '2026-07-01', '2026-07-31')).toBe(
      'דוח-מכירות-2026-07-01-עד-2026-07-31.csv',
    )
    expect(reportFilename('suppliers', '2026-07-01', '2026-07-31')).toContain('התחייבויות-לספקים')
  })
})
