import { toCsv } from '@/lib/reports/csv'
import { describe, expect, it } from 'vitest'
import { LEDGER_COLUMNS, type LedgerLine, ledgerTotals } from './payout-ledger'

const line = (over: Partial<LedgerLine>): LedgerLine => ({
  statementNumber: 'PS-2026-09-0001',
  statementStatus: 'pending_approval',
  rolledOver: false,
  periodStart: '2026-08-01',
  periodEnd: '2026-08-31',
  lineType: 'physical_delivery',
  description: null,
  orderItemId: null,
  quantity: 1,
  grossIls: 100,
  platformFeeIls: 15,
  payoutIls: 85,
  createdAt: '2026-09-01T00:00:00Z',
  availableAt: null,
  ...over,
})

describe('ledgerTotals', () => {
  it('owes what is on live statements and counts paid separately', () => {
    const totals = ledgerTotals([
      line({}),
      line({ statementStatus: 'paid', payoutIls: 40.1 }),
      line({ statementStatus: 'cancelled', payoutIls: 999 }),
      line({ lineType: 'adjustment', grossIls: 0, platformFeeIls: 0, payoutIls: -10.05 }),
    ])
    expect(totals).toEqual({ lines: 4, owedIls: 115.05, paidIls: 40.1 })
  })
})

describe('LEDGER_COLUMNS', () => {
  it('labels the line type and the statement state in Hebrew', () => {
    const csv = toCsv(
      [line({ lineType: 'adjustment', description: 'פיצוי על משלוח' })],
      LEDGER_COLUMNS,
    )
    const [, row] = csv.split('\r\n')
    expect(row).toContain('התאמה')
    expect(row).toContain('ממתין לאישור')
    expect(row).toContain('פיצוי על משלוח')
    expect(row).toContain('85.00')
  })
})
