import { describe, expect, it } from 'vitest'
import { countBy, ledgerKindTotal, summarizeOrders } from './dashboards'

describe('summarizeOrders', () => {
  it('sums only collected orders in integer agorot', () => {
    const s = summarizeOrders([
      { status: 'paid', total_ils_agorot: 10_050 },
      { status: 'fulfilled', total_ils_agorot: 1 },
      { status: 'pending', total_ils_agorot: 99_900 },
      { status: 'refunded', total_ils_agorot: 5_000 },
      { status: 'paid', total_ils_agorot: null },
    ])
    expect(s.total).toBe(5)
    expect(s.paidCount).toBe(3)
    expect(s.paidSum).toBe(10_051)
    expect(s.byStatus.pending).toBe(1)
  })

  it('rejects a fractional amount', () => {
    expect(() => summarizeOrders([{ status: 'paid', total_ils_agorot: 10.5 }])).toThrow()
  })
})

describe('ledgerKindTotal', () => {
  it('sums bigint strings for one kind', () => {
    const rows = [
      { kind: 'platform_revenue', natural_balance_agorot: '12345' },
      { kind: 'platform_revenue', natural_balance_agorot: 5 },
      { kind: 'supplier_payable', natural_balance_agorot: 999 },
    ]
    expect(ledgerKindTotal(rows, 'platform_revenue')).toBe(12_350)
    expect(ledgerKindTotal(rows, 'vat_output')).toBe(0)
  })
})

describe('countBy', () => {
  it('counts by key', () => {
    expect(countBy([{ s: 'a' }, { s: 'a' }, { s: 'b' }], (r) => r.s)).toEqual({ a: 2, b: 1 })
  })
})
