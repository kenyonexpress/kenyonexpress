import { agorot } from '@/lib/money'
import { describe, expect, it } from 'vitest'
import { type PayoutCandidate, availableAtFor, planSupplierPayout } from './run'

const NOW = new Date('2026-09-22T06:00:00Z')

function candidate(over: Partial<PayoutCandidate> = {}): PayoutCandidate {
  return {
    orderItemId: over.orderItemId ?? 'item-1',
    orderId: 'order-1',
    productName: 'מחבת',
    quantity: 1,
    platformPercent: 10,
    grossAgorot: 10000,
    platformFeeAgorot: 1000,
    supplierImmediateAgorot: 9000,
    settlementStatus: 'split_executed',
    paidAt: '2026-09-01T10:00:00Z',
    fulfilledAt: null,
    deliveredAt: '2026-09-02T10:00:00Z',
    ...over,
  }
}

const base = {
  supplierId: 'sup',
  statementedItemIds: new Set<string>(),
  holdBusinessDays: 3,
  // Below the 9,000-agorot share of one fixture line, so a single line is a statement.
  minPayoutAgorot: agorot(5000),
  lastPeriodEnd: null,
}

describe('planSupplierPayout', () => {
  it('draws a statement from lines past their hold, in integer agorot', () => {
    const plan = planSupplierPayout(
      { ...base, candidates: [candidate(), candidate({ orderItemId: 'item-2' })] },
      NOW,
    )
    expect(plan.kind).toBe('statement')
    if (plan.kind !== 'statement') return
    expect(plan.lines).toHaveLength(2)
    expect(plan.totalPayoutAgorot).toBe(18000)
    expect(plan.totalGrossAgorot).toBe(20000)
    expect(plan.totalPlatformFeeAgorot).toBe(2000)
    expect(plan.periodEnd).toBe('2026-09-22')
    expect(plan.periodStart).toBe('2026-09-01')
  })

  it('pays what the supplier already sees: a refunded line is worth zero', () => {
    const plan = planSupplierPayout(
      {
        ...base,
        candidates: [candidate(), candidate({ orderItemId: 'r', settlementStatus: 'refunded' })],
      },
      NOW,
    )
    expect(plan.kind).toBe('statement')
    if (plan.kind === 'statement') expect(plan.lines.map((l) => l.orderItemId)).toEqual(['item-1'])
  })

  it('never puts a line on two statements', () => {
    const plan = planSupplierPayout(
      { ...base, candidates: [candidate()], statementedItemIds: new Set(['item-1']) },
      NOW,
    )
    expect(plan).toEqual({ kind: 'nothing' })
  })

  it('holds a line until the business days after delivery have passed', () => {
    const fresh = candidate({ deliveredAt: '2026-09-21T10:00:00Z' })
    const plan = planSupplierPayout({ ...base, candidates: [fresh] }, NOW)
    expect(plan.kind).toBe('held')
    expect(availableAtFor(fresh, 3)).toBe('2026-09-24T00:00:00.000Z')
  })

  it('rolls over below the minimum instead of creating a tiny statement', () => {
    const plan = planSupplierPayout(
      { ...base, candidates: [candidate({ supplierImmediateAgorot: 500 })] },
      NOW,
    )
    expect(plan).toEqual({ kind: 'below_minimum', dueAgorot: 500, lineCount: 1, heldLines: 0 })
  })

  it('opens the period the day after the previous statement closed', () => {
    const plan = planSupplierPayout(
      { ...base, candidates: [candidate()], lastPeriodEnd: '2026-09-10' },
      NOW,
    )
    if (plan.kind === 'statement') expect(plan.periodStart).toBe('2026-09-11')
    else throw new Error(plan.kind)
  })

  it('anchors the hold on delivered, then fulfilled, and never on paid alone', () => {
    expect(
      availableAtFor(
        candidate({ deliveredAt: '2026-09-01T00:00:00Z', fulfilledAt: '2026-09-15T00:00:00Z' }),
        0,
      ),
    ).toBe('2026-09-01T00:00:00.000Z')
    expect(
      availableAtFor(candidate({ deliveredAt: null, fulfilledAt: '2026-09-15T00:00:00Z' }), 0),
    ).toBe('2026-09-15T00:00:00.000Z')
    expect(availableAtFor(candidate({ deliveredAt: null, fulfilledAt: null }), 3)).toBeNull()
  })

  it('reports a paid but undelivered line rather than paying it out', () => {
    const plan = planSupplierPayout(
      { ...base, candidates: [candidate({ deliveredAt: null, fulfilledAt: null })] },
      NOW,
    )
    expect(plan).toEqual({ kind: 'undelivered', undeliveredLines: 1 })
  })
})
