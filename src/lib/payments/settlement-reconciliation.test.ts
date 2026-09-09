import { describe, expect, it } from 'vitest'
import {
  type CompletedRefund,
  type JournalEvent,
  type SettledOrderLine,
  expectedCommission,
  reconcileSettlement,
} from './settlement-reconciliation'

/**
 * The epoch used throughout: migration 094 was applied to production on
 * 2026-07-31, which is when `settlement_events` started recording.
 */
const EPOCH = '2026-07-31T00:00:00.000Z'

/** After the epoch, so the journal checks apply. */
const AFTER = '2026-08-15T10:00:00.000Z'
/** Before it, which is where all four real production orders sit. */
const BEFORE = '2026-07-21T14:33:59.238Z'

function line(overrides: Partial<SettledOrderLine> = {}): SettledOrderLine {
  return {
    orderItemId: 'item-1',
    orderId: 'order-1',
    supplierId: 'supplier-1',
    platformPercent: '10.00',
    paidOnSiteAgorot: 10_000,
    commissionAgorot: 1_000,
    supplierImmediateAgorot: 9_000,
    escrowReleaseAgorot: 0,
    paidAtIso: AFTER,
    ...overrides,
  }
}

function charge(overrides: Partial<JournalEvent> = {}): JournalEvent {
  return {
    kind: 'charge_settled',
    orderId: 'order-1',
    orderItemId: 'item-1',
    paidOnSiteAgorot: 10_000,
    commissionAgorot: 1_000,
    supplierDueAgorot: 9_000,
    idempotencyKey: 'charge_settled:item-1',
    ...overrides,
  }
}

function run(
  lines: SettledOrderLine[],
  events: JournalEvent[] = [],
  refunds: CompletedRefund[] = [],
  known: string[] = [],
) {
  return reconcileSettlement({ lines, events, refunds, journalEpochIso: EPOCH, known })
}

describe('reconcileSettlement', () => {
  it('finds nothing wrong with a line whose journal, split and percent agree', () => {
    const report = run([line()], [charge()])
    expect(report.findings).toEqual([])
    expect(report.critical).toBe(0)
    expect(report.linesChecked).toBe(1)
  })

  describe('the split the customer paid', () => {
    it('reports a split that does not add back to what was paid', () => {
      const report = run([line({ commissionAgorot: 1_000, supplierImmediateAgorot: 8_000 })])
      const found = report.findings.find((f) => f.kind === 'split_not_conserved')
      expect(found).toMatchObject({ expectedAgorot: 10_000, actualAgorot: 9_000 })
      expect(found?.severity).toBe('critical')
    })

    it('counts a legacy escrow release into the supplier share', () => {
      // The pre-070 coupon rows in production hold the supplier's share in
      // escrow rather than immediately. Ignoring escrow_release would report
      // conservation on every one of them and bury the defect they really have.
      const report = run([
        line({
          paidOnSiteAgorot: 1_800,
          commissionAgorot: 90,
          supplierImmediateAgorot: 0,
          escrowReleaseAgorot: 1_710,
        }),
      ])
      expect(report.findings.map((f) => f.kind)).not.toContain('split_not_conserved')
    })
  })

  describe('the percent the line was settled under', () => {
    it('reports a snapshot that does not produce the commission beside it', () => {
      const report = run([line({ platformPercent: '10.00', commissionAgorot: 500 })])
      const found = report.findings.find((f) => f.kind === 'percent_contradiction')
      expect(found).toMatchObject({
        expectedAgorot: 1_000,
        actualAgorot: 500,
        platformPercent: 10,
        severity: 'critical',
      })
    })

    it('reports a line with no percent at all rather than assuming one', () => {
      const report = run([line({ platformPercent: null })])
      expect(report.findings.map((f) => f.kind)).toContain('percent_missing')
      // And not as a contradiction: there is nothing to contradict.
      expect(report.findings.map((f) => f.kind)).not.toContain('percent_contradiction')
    })

    it('treats an unparseable percent as missing instead of throwing', () => {
      // percentToBasisPoints throws outside 0..100. A cron at five in the
      // morning must report that, not crash on it.
      for (const bad of ['101.00', '-1.00', 'abc', '10.005']) {
        const report = run([line({ platformPercent: bad })])
        expect(
          report.findings.map((f) => f.kind),
          bad,
        ).toContain('percent_missing')
      }
    })

    it("uses the engine's rounding rather than a second arithmetic", () => {
      // 1.5 agorot rounds half away from zero in percentageOf. A reconciler
      // that used Math.round on a float would agree here and disagree
      // elsewhere, which is worse than disagreeing everywhere.
      const rounding = line({ paidOnSiteAgorot: 333, platformPercent: '10.00' })
      expect(expectedCommission(rounding)).toBe(33)
      const report = run([{ ...rounding, commissionAgorot: 33, supplierImmediateAgorot: 300 }])
      expect(report.findings.map((f) => f.kind)).not.toContain('percent_contradiction')
    })
  })

  describe('the journal against the lines', () => {
    it('reports a line paid after the epoch with no charge_settled row', () => {
      const report = run([line()], [])
      expect(report.findings.map((f) => f.kind)).toContain('journal_missing')
      expect(report.beforeJournal).toBe(0)
    })

    it('does not report a line paid before the journal existed', () => {
      const report = run([line({ paidAtIso: BEFORE })], [])
      expect(report.findings.map((f) => f.kind)).not.toContain('journal_missing')
      expect(report.beforeJournal).toBe(1)
    })

    it('reports rather than excuses a line whose paid-at cannot be read', () => {
      const report = run([line({ paidAtIso: 'not a date' })], [])
      expect(report.findings.map((f) => f.kind)).toContain('journal_missing')
      expect(report.beforeJournal).toBe(0)
    })

    it('reports a journal row that disagrees with its line about money', () => {
      const report = run([line()], [charge({ commissionAgorot: 999 })])
      const found = report.findings.find((f) => f.kind === 'journal_drift')
      expect(found?.severity).toBe('critical')
    })

    it('compares the journal to the immediate share, not the escrow-inclusive one', () => {
      // A legacy line journalled correctly for its own model must not read as
      // drift just because escrow_release exists.
      const legacy = line({
        paidOnSiteAgorot: 1_800,
        commissionAgorot: 90,
        supplierImmediateAgorot: 0,
        escrowReleaseAgorot: 1_710,
      })
      const report = run(
        [legacy],
        [charge({ paidOnSiteAgorot: 1_800, commissionAgorot: 90, supplierDueAgorot: 0 })],
      )
      expect(report.findings.map((f) => f.kind)).not.toContain('journal_drift')
    })

    it('reports a charge_settled row whose line is gone, at a lower severity', () => {
      const report = run([], [charge({ orderItemId: 'vanished' })])
      const found = report.findings.find((f) => f.kind === 'journal_orphan')
      expect(found?.severity).toBe('warning')
      expect(report.critical).toBe(0)
    })
  })

  describe('refunds', () => {
    const refund: CompletedRefund = {
      refundId: 'refund-1',
      orderId: 'order-1',
      paymentId: 'pay-1',
      grantedAgorot: 5_000,
    }

    it('accepts a refund matched by the key buildRefundEvents writes', () => {
      const report = run(
        [],
        [
          {
            kind: 'refund_issued',
            orderId: 'order-1',
            orderItemId: null,
            paidOnSiteAgorot: 5_000,
            commissionAgorot: 0,
            supplierDueAgorot: 0,
            idempotencyKey: 'refund_issued:pay-1',
          },
        ],
        [refund],
      )
      expect(report.findings).toEqual([])
    })

    it('reports a completed refund with no journal row', () => {
      const report = run([], [], [refund])
      expect(report.findings).toHaveLength(1)
      expect(report.findings[0]).toMatchObject({
        kind: 'refund_unjournalled',
        expectedAgorot: 5_000,
        severity: 'critical',
      })
    })

    it('does not let one journal row excuse a second refund on the same order', () => {
      // The claw-back case this check exists for: matching by order would make
      // the first refund's row cover the second, which is a refund that moved
      // money and left no record.
      const second = { ...refund, refundId: 'refund-2', paymentId: 'pay-2' }
      const report = run(
        [],
        [
          {
            kind: 'refund_issued',
            orderId: 'order-1',
            orderItemId: null,
            paidOnSiteAgorot: 5_000,
            commissionAgorot: 0,
            supplierDueAgorot: 0,
            idempotencyKey: 'refund_issued:pay-1',
          },
        ],
        [refund, second],
      )
      expect(report.findings.map((f) => f.id)).toEqual(['refund_unjournalled:refund-2'])
    })

    it('gives two refunds on one order two ids', () => {
      const second = { ...refund, refundId: 'refund-2', paymentId: 'pay-2' }
      const report = run([], [], [refund, second])
      expect(report.findings.map((f) => f.id)).toEqual([
        'refund_unjournalled:refund-1',
        'refund_unjournalled:refund-2',
      ])
    })
  })

  describe('the known-issues floor', () => {
    it('keeps a known finding out of what pages, and in what is reported', () => {
      // Conserved on purpose: the ONLY thing wrong with this line is the
      // percent, so the assertion is about the ledger and not about a second
      // finding leaking through.
      const bad = line({ commissionAgorot: 500, supplierImmediateAgorot: 9_500 })
      const report = run(
        [bad],
        [charge({ commissionAgorot: 500, supplierDueAgorot: 9_500 })],
        [],
        ['percent_contradiction:item-1'],
      )
      expect(report.findings.map((f) => f.id)).toContain('percent_contradiction:item-1')
      expect(report.novel).toEqual([])
      expect(report.critical).toBe(0)
    })

    it('names a ledger entry that stopped firing', () => {
      // A finding that was fixed and a check that broke look identical from
      // here, and both are worth saying out loud.
      const report = run([line()], [charge()], [], ['percent_contradiction:item-1'])
      expect(report.silenced).toEqual(['percent_contradiction:item-1'])
    })
  })

  it('orders findings worst-first so a capped alert shows the worst', () => {
    const report = run([
      line({
        orderItemId: 'a',
        platformPercent: null,
        commissionAgorot: 0,
        supplierImmediateAgorot: 10_000,
      }),
      line({ orderItemId: 'b', commissionAgorot: 1_000, supplierImmediateAgorot: 8_000 }),
    ])
    expect(report.findings[0]?.kind).toBe('split_not_conserved')
  })

  /**
   * The three paid lines in production on 2026-09-09, verbatim. All three were
   * split at a flat 5% while carrying a snapshot that says 10%, 10% and 100%,
   * and all three predate the journal. This is the fixture that makes the
   * header's measurement a test rather than a paragraph.
   */
  describe('production, measured 2026-09-09', () => {
    const production: SettledOrderLine[] = [
      {
        orderItemId: '11129c4f-1705-403d-a7bd-25ca76e91a25',
        orderId: 'd3a5aa99-ed75-4bf4-8dfa-ad0035be848c',
        supplierId: 'supplier-a',
        platformPercent: '10.00',
        paidOnSiteAgorot: 1_800,
        commissionAgorot: 90,
        supplierImmediateAgorot: 0,
        escrowReleaseAgorot: 1_710,
        paidAtIso: BEFORE,
      },
      {
        orderItemId: 'ef81705d-8fa3-4dcc-9627-4215efc02162',
        orderId: '79f488aa-549a-40dd-af80-eb66d886668f',
        supplierId: 'supplier-a',
        platformPercent: '10.00',
        paidOnSiteAgorot: 1_800,
        commissionAgorot: 90,
        supplierImmediateAgorot: 0,
        escrowReleaseAgorot: 1_710,
        paidAtIso: BEFORE,
      },
      {
        orderItemId: '4ba29dc9-58e3-42b3-8612-ab95362259eb',
        orderId: '79f488aa-549a-40dd-af80-eb66d886668f',
        supplierId: 'supplier-b',
        platformPercent: '100.00',
        paidOnSiteAgorot: 79_900,
        commissionAgorot: 3_995,
        supplierImmediateAgorot: 75_905,
        escrowReleaseAgorot: 0,
        paidAtIso: BEFORE,
      },
    ]

    it('reports all three as a percent that does not explain the money', () => {
      const report = run(production, [])
      expect(report.findings.map((f) => f.kind)).toEqual([
        'percent_contradiction',
        'percent_contradiction',
        'percent_contradiction',
      ])
    })

    it('says every one of them was split at five percent', () => {
      for (const item of production) {
        const fivePercent = Math.round(item.paidOnSiteAgorot * 0.05)
        expect(item.commissionAgorot, item.orderItemId).toBe(fivePercent)
      }
    })

    it('does not report them as unjournalled, because they predate the journal', () => {
      const report = run(production, [])
      expect(report.beforeJournal).toBe(3)
      expect(report.findings.map((f) => f.kind)).not.toContain('journal_missing')
    })

    it('conserves the money on all three, which is why the percent is the finding', () => {
      const report = run(production, [])
      expect(report.findings.map((f) => f.kind)).not.toContain('split_not_conserved')
    })

    it('pages about none of them once they are the measured floor', () => {
      const report = run(
        production,
        [],
        [],
        production.map((item) => `percent_contradiction:${item.orderItemId}`),
      )
      expect(report.critical).toBe(0)
      expect(report.novel).toEqual([])
      expect(report.silenced).toEqual([])
    })
  })
})

describe('the journal has to reverse what the statement reverses', () => {
  // Two implementations of one rule, reading two tables: the supplier portal
  // zeroes a refunded line's payout off `order_items.settlement_status`, and
  // the journal zeroes it with a `supplier_debit` against the `charge_settled`
  // that credited it. This check is what stops them drifting apart in silence,
  // because a supplier statement and an admin settlement report that disagree
  // by one refund look correct from either side alone.
  const refundedLine = () => line({ settlementStatus: 'refunded' })
  const debit = (overrides: Partial<JournalEvent> = {}): JournalEvent => ({
    kind: 'supplier_debit',
    orderId: 'order-1',
    orderItemId: 'item-1',
    paidOnSiteAgorot: 0,
    commissionAgorot: 0,
    supplierDueAgorot: 9_000,
    idempotencyKey: 'supplier_debit:item-1',
    ...overrides,
  })

  it('reports a refunded line whose supplier share is still standing', () => {
    const report = run([refundedLine()], [charge()])
    const found = report.findings.find((f) => f.kind === 'supplier_debit_missing')
    expect(found).toMatchObject({
      orderItemId: 'item-1',
      expectedAgorot: 9_000,
      actualAgorot: 0,
    })
    // Critical: the number it leaves wrong is one the admin settlement report
    // pays out from.
    expect(found?.severity).toBe('critical')
  })

  it('says nothing once the debit is there', () => {
    const report = run([refundedLine()], [charge(), debit()])
    expect(report.findings.map((f) => f.kind)).not.toContain('supplier_debit_missing')
  })

  it('says nothing about a line that was never credited', () => {
    // A coupon splits 100/0. There is no supplier share to reverse, so the
    // absence of a debit is correct rather than a gap.
    const report = run(
      [
        line({
          settlementStatus: 'refunded',
          paidOnSiteAgorot: 1_800,
          commissionAgorot: 1_800,
          supplierImmediateAgorot: 0,
          platformPercent: '100.00',
        }),
      ],
      [charge({ paidOnSiteAgorot: 1_800, commissionAgorot: 1_800, supplierDueAgorot: 0 })],
    )
    expect(report.findings.map((f) => f.kind)).not.toContain('supplier_debit_missing')
  })

  it('says nothing about a line that is not reversed', () => {
    const report = run([line({ settlementStatus: 'split_executed' })], [charge()])
    expect(report.findings).toEqual([])
  })

  it('covers a cancelled line by the same rule', () => {
    const report = run([line({ settlementStatus: 'cancelled' })], [charge()])
    expect(report.findings.map((f) => f.kind)).toContain('supplier_debit_missing')
  })

  it('does not fire on a line paid before the journal existed', () => {
    // No `charge_settled` to reverse, so there is nothing standing. The line is
    // already counted as `beforeJournal` and accusing it twice would be noise.
    const report = run([line({ settlementStatus: 'refunded', paidAtIso: BEFORE })], [])
    expect(report.findings.map((f) => f.kind)).not.toContain('supplier_debit_missing')
    expect(report.beforeJournal).toBe(1)
  })
})
