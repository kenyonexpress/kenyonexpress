import { describe, expect, it } from 'vitest'
import {
  type ReconciliationRow,
  needsAttention,
  reconcile,
  summarize,
} from './payment-reconciliation'

const BASE: ReconciliationRow = {
  paymentId: 'pay-1',
  orderId: 'ord-1',
  paymentStatus: 'succeeded',
  paymentKind: 'charge',
  orderPaidAt: '2026-07-28T10:00:00Z',
  orderStatus: 'paid',
  amountIls: 199.9,
  succeededAt: '2026-07-28T10:00:00Z',
  transactionId: 'tx-1',
}

describe('reconcile', () => {
  it('passes a charge that closed its order', () => {
    expect(reconcile(BASE).verdict).toBe('settled')
    expect(reconcile(BASE).retryable).toBe(false)
  })

  it('flags a successful charge whose order never closed, and marks it retryable', () => {
    // The 2026-07-27 outage: finalize wrote an enum value the database did not
    // have and raised 22P02 after Cardcom had already taken the money.
    const row = reconcile({ ...BASE, orderPaidAt: null, orderStatus: 'pending' })
    expect(row.verdict).toBe('unfinalized')
    expect(row.retryable).toBe(true)
    expect(row.message).toContain('חויב')
  })

  it('treats platform_settled as charged, not as a separate limbo', () => {
    const row = reconcile({ ...BASE, paymentStatus: 'platform_settled', orderPaidAt: null })
    expect(row.verdict).toBe('unfinalized')
  })

  it('reads paid_at rather than order status', () => {
    // orders.status is derived from line settlement states and moves for
    // reasons unrelated to whether the card cleared.
    const closedButOddStatus = reconcile({ ...BASE, orderStatus: 'partially_fulfilled' })
    expect(closedButOddStatus.verdict).toBe('settled')

    const openButPaidStatus = reconcile({ ...BASE, orderPaidAt: null, orderStatus: 'paid' })
    expect(openButPaidStatus.verdict).toBe('unfinalized')
  })

  it('does not accuse a wallet-only order of being unpaid', () => {
    const row = reconcile({
      ...BASE,
      paymentId: null,
      paymentStatus: null,
      paymentKind: null,
      amountIls: null,
    })
    expect(row.verdict).toBe('paid_without_charge')
    expect(row.retryable).toBe(false)
    expect(row.message).toContain('ארנק')
  })

  it('leaves a failed charge alone: no money moved', () => {
    const row = reconcile({ ...BASE, paymentStatus: 'failed', orderPaidAt: null })
    expect(row.verdict).toBe('failed')
    expect(row.retryable).toBe(false)
  })

  it('treats an in-flight checkout as normal, not as a fault', () => {
    for (const status of ['initiated', 'redirected'] as const) {
      const row = reconcile({ ...BASE, paymentStatus: status, orderPaidAt: null })
      expect(row.verdict, status).toBe('in_flight')
      expect(row.retryable, status).toBe(false)
    }
  })

  it('reports a refund as refunded whichever column says so', () => {
    expect(reconcile({ ...BASE, paymentStatus: 'refunded' }).verdict).toBe('refunded')
    expect(reconcile({ ...BASE, paymentKind: 'refund' }).verdict).toBe('refunded')
  })

  it('never marks anything but an unfinalized charge retryable', () => {
    // Re-running finalize on anything else either does nothing or is the wrong
    // repair, and offering the button would invite both.
    const rows = [
      BASE,
      { ...BASE, paymentStatus: 'failed' as const, orderPaidAt: null },
      { ...BASE, paymentStatus: 'refunded' as const },
      { ...BASE, paymentStatus: 'initiated' as const, orderPaidAt: null },
      { ...BASE, paymentId: null, paymentStatus: null },
    ]
    for (const r of rows) {
      expect(reconcile(r).retryable, r.paymentStatus ?? 'null').toBe(false)
    }
  })
})

describe('summarize', () => {
  it('totals the money stranded by unfinalized charges', () => {
    const rows = [
      reconcile(BASE),
      reconcile({ ...BASE, orderId: 'o2', orderPaidAt: null, amountIls: 50 }),
      reconcile({ ...BASE, orderId: 'o3', orderPaidAt: null, amountIls: 25.5 }),
      reconcile({ ...BASE, orderId: 'o4', paymentStatus: 'failed', orderPaidAt: null }),
    ]
    const s = summarize(rows)
    expect(s.total).toBe(4)
    expect(s.settled).toBe(1)
    expect(s.unfinalized).toBe(2)
    expect(s.failed).toBe(1)
    expect(s.strandedIls).toBe(75.5)
  })

  it('counts no stranded money when everything settled', () => {
    expect(summarize([reconcile(BASE)]).strandedIls).toBe(0)
  })

  it('handles an empty set', () => {
    expect(summarize([]).total).toBe(0)
  })
})

describe('needsAttention', () => {
  it('returns only the rows an admin can act on, worst first', () => {
    const rows = [
      reconcile(BASE),
      reconcile({ ...BASE, orderId: 'o2', paymentId: null, paymentStatus: null }),
      reconcile({ ...BASE, orderId: 'o3', orderPaidAt: null }),
      reconcile({ ...BASE, orderId: 'o4', paymentStatus: 'initiated', orderPaidAt: null }),
    ]
    const attention = needsAttention(rows)
    expect(attention.map((r) => r.verdict)).toEqual(['unfinalized', 'paid_without_charge'])
  })

  it('is empty when the books balance', () => {
    expect(needsAttention([reconcile(BASE)])).toEqual([])
  })
})
