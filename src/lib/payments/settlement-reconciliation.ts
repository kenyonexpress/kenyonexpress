import { type Agorot, agorot, percentToBasisPoints, percentageOf } from '@/lib/commerce/money'

/**
 * The money journal, against the order lines it claims to describe.
 *
 * WHAT THIS CATCHES THAT NOTHING ELSE DOES. `/api/cron/reconcile` asks the
 * TERMINAL what it charged and diffs that against `payments`. It answers "did
 * the right total move". It says nothing whatever about the question this file
 * asks, which is "was that total split between the platform and the supplier
 * the way the line says it was". A charge can agree with Cardcom to the agora
 * and still be journalled at a percent nobody agreed to, or not journalled at
 * all, and every downstream number - the supplier statement, /admin/reports,
 * the payout that is actually wired - is computed from the split rather than
 * from the total.
 *
 * That failure is invisible from the terminal side by construction: the
 * terminal never knew about the split.
 *
 * MEASURED ON PRODUCTION, 2026-09-09, WHICH IS WHY THIS EXISTS
 *
 * Three paid order lines. All three carry a `platform_percent` snapshot that
 * DOES NOT EXPLAIN THE MONEY ON THE SAME ROW:
 *
 *   ₪180 coupon, platform_percent 10.00, commission ₪0.90 on ₪18 paid  → 5%
 *   ₪180 coupon, platform_percent 10.00, commission ₪0.90 on ₪18 paid  → 5%
 *   ₪799 physical, platform_percent 100.00, commission ₪39.95          → 5%
 *
 * Every one of them was split at a flat 5%, which is the fixed commission that
 * `settlement.ts` says was removed from the money path by 070 and that this
 * codebase says has no default. The snapshot and the money are two different
 * answers on one row, and the row is what a supplier statement is built from:
 * read the percent and the ₪799 supplier is owed ₪0, read the money and they
 * are owed ₪759.05.
 *
 * Nothing in the repository would have noticed. The journal is empty, no job
 * compares these columns to each other, and neither number is wrong in a way a
 * type or a CHECK constraint can see.
 *
 * THE EPOCH, AND WHY A MISSING JOURNAL ROW IS NOT ALWAYS A FAULT
 *
 * `settlement_events` arrived with migration 094 on 2026-07-31. All four
 * production orders were paid on 2026-07-21. A reconciler that reported every
 * unjournalled line would report those three every day forever, for the reason
 * that the journal did not exist when they were paid - a finding that is true,
 * unfixable, and therefore noise. `journalEpochIso` is the moment the journal
 * started recording; lines paid before it are counted and reported as
 * `beforeJournal` rather than being silently dropped, because an exclusion
 * nobody can see is how a gate stops covering what it claims to cover.
 *
 * The percent checks are NOT epoch-bound. Those rows are wrong today, and a
 * statement generated today would use them.
 *
 * PURE, AND SEPARATE FROM THE ROUTE. The route reads and alerts; this decides.
 * That is what lets the production numbers above be a test fixture rather than
 * a paragraph.
 */

export type SettlementFindingKind =
  /** A paid line with no `charge_settled` row, on or after the journal epoch. */
  | 'journal_missing'
  /** A `charge_settled` row whose line is not a paid line any more. */
  | 'journal_orphan'
  /** Journal and line both exist and disagree about an amount. */
  | 'journal_drift'
  /** commission + supplier share does not add back to what the customer paid. */
  | 'split_not_conserved'
  /** The line carries no `platform_percent`, so nothing justifies its split. */
  | 'percent_missing'
  /** The snapshotted percent does not produce the commission on the same row. */
  | 'percent_contradiction'
  /** A completed refund with no `refund_issued` row. */
  | 'refund_unjournalled'

export type FindingSeverity = 'critical' | 'warning'

/** The order-line shape this needs. Deliberately narrow, as the journal's is. */
export interface SettledOrderLine {
  orderItemId: string
  orderId: string
  supplierId: string | null
  /** `order_items.platform_percent`, the percent snapshotted at purchase. */
  platformPercent: string | number | null
  paidOnSiteAgorot: number
  commissionAgorot: number
  supplierImmediateAgorot: number
  /**
   * Legacy escrow. Zero on every line the current engine writes, non-zero on
   * the pre-070 coupon rows still in production, where the supplier's share sat
   * in escrow instead of being immediate. Counted into the supplier share so
   * conservation does not fire on rows whose real defect is the percent.
   */
  escrowReleaseAgorot: number
  /** When the order was paid, for the epoch comparison. ISO 8601. */
  paidAtIso: string
}

export interface JournalEvent {
  kind: string
  orderId: string
  orderItemId: string | null
  paidOnSiteAgorot: number
  commissionAgorot: number
  supplierDueAgorot: number
  idempotencyKey: string | null
}

export interface CompletedRefund {
  refundId: string
  orderId: string
  paymentId: string | null
  grantedAgorot: number
}

export interface SettlementFinding {
  kind: SettlementFindingKind
  severity: FindingSeverity
  orderId: string
  orderItemId: string | null
  /** What the number should have been, where the finding is about an amount. */
  expectedAgorot: number | null
  /** What it is. */
  actualAgorot: number | null
  /** The line's snapshotted percent, where the finding is about the split. */
  platformPercent: number | null
  /**
   * Stable across runs and unique per finding, so a known-issues ledger can
   * name one without naming a run. `<kind>:<orderItemId ?? orderId>`.
   */
  id: string
}

export interface SettlementReconciliationReport {
  linesChecked: number
  eventsChecked: number
  refundsChecked: number
  /** Lines excluded from `journal_missing` because they predate the journal. */
  beforeJournal: number
  findings: SettlementFinding[]
  /** Findings not present in the known-issues ledger. These are what page. */
  novel: SettlementFinding[]
  /** Ledger entries that did not fire this run: fixed, or the check broke. */
  silenced: string[]
  critical: number
}

export interface ReconcileSettlementInput {
  lines: readonly SettledOrderLine[]
  events: readonly JournalEvent[]
  refunds: readonly CompletedRefund[]
  /** The moment `settlement_events` started recording. See the header. */
  journalEpochIso: string
  /** Finding ids that are known, measured and not this job's to fix. */
  known?: readonly string[]
}

const CRITICAL: ReadonlySet<SettlementFindingKind> = new Set([
  'journal_missing',
  'journal_drift',
  'split_not_conserved',
  'percent_missing',
  'percent_contradiction',
  'refund_unjournalled',
])

/**
 * Ordered worst-first, so the twenty rows an alert is capped at are the twenty
 * that matter rather than the twenty that sorted first by id.
 */
const KIND_ORDER: readonly SettlementFindingKind[] = [
  'split_not_conserved',
  'percent_contradiction',
  'percent_missing',
  'journal_drift',
  'refund_unjournalled',
  'journal_missing',
  'journal_orphan',
]

/**
 * `percentToBasisPoints` throws on anything outside 0..100 or with more than
 * two fraction digits. A percent we cannot parse is a real problem, but it is
 * `percent_missing`'s problem and not a crash in a five-in-the-morning cron.
 */
function basisPointsOrNull(percent: string | number | null | undefined): number | null {
  if (percent === null || percent === undefined) return null
  try {
    return percentToBasisPoints(percent)
  } catch {
    return null
  }
}

/** The same value as a percent, for a finding a human reads. */
function percentOrNull(percent: string | number | null | undefined): number | null {
  const bps = basisPointsOrNull(percent)
  return bps === null ? null : bps / 100
}

function toFiniteInt(value: number): number {
  return Number.isFinite(value) ? Math.round(value) : 0
}

function finding(
  kind: SettlementFindingKind,
  parts: {
    orderId: string
    orderItemId: string | null
    expectedAgorot?: number | null
    actualAgorot?: number | null
    platformPercent?: number | null
    /**
     * What makes this finding one finding. Defaults to the line, which is the
     * right subject for every per-line check. A refund overrides it with the
     * refund id: two refunds on one order are two findings, and defaulting to
     * the order would collapse them into one id and hide the second.
     */
    subject?: string
  },
): SettlementFinding {
  return {
    kind,
    severity: CRITICAL.has(kind) ? 'critical' : 'warning',
    orderId: parts.orderId,
    orderItemId: parts.orderItemId,
    expectedAgorot: parts.expectedAgorot ?? null,
    actualAgorot: parts.actualAgorot ?? null,
    platformPercent: parts.platformPercent ?? null,
    id: `${kind}:${parts.subject ?? parts.orderItemId ?? parts.orderId}`,
  }
}

/** The commission the line's own snapshotted percent produces, or null. */
export function expectedCommission(line: SettledOrderLine): Agorot | null {
  const bps = basisPointsOrNull(line.platformPercent)
  if (bps === null) return null
  return percentageOf(agorot(toFiniteInt(line.paidOnSiteAgorot)), bps)
}

export function reconcileSettlement(
  input: ReconcileSettlementInput,
): SettlementReconciliationReport {
  const epoch = Date.parse(input.journalEpochIso)
  const known = new Set(input.known ?? [])
  const findings: SettlementFinding[] = []
  let beforeJournal = 0

  const chargeByItem = new Map<string, JournalEvent>()
  for (const event of input.events) {
    if (event.kind === 'charge_settled' && event.orderItemId) {
      chargeByItem.set(event.orderItemId, event)
    }
  }

  const lineIds = new Set(input.lines.map((line) => line.orderItemId))

  for (const line of input.lines) {
    const paid = toFiniteInt(line.paidOnSiteAgorot)
    const commission = toFiniteInt(line.commissionAgorot)
    // Immediate plus escrow-release: the current engine leaves escrow at zero,
    // so this reduces to the immediate share on every line it writes, and only
    // the legacy rows use the second term.
    const supplierShare =
      toFiniteInt(line.supplierImmediateAgorot) + toFiniteInt(line.escrowReleaseAgorot)

    if (commission + supplierShare !== paid) {
      findings.push(
        finding('split_not_conserved', {
          orderId: line.orderId,
          orderItemId: line.orderItemId,
          expectedAgorot: paid,
          actualAgorot: commission + supplierShare,
          platformPercent: percentOrNull(line.platformPercent),
        }),
      )
    }

    const bps = basisPointsOrNull(line.platformPercent)
    if (bps === null) {
      findings.push(
        finding('percent_missing', {
          orderId: line.orderId,
          orderItemId: line.orderItemId,
          actualAgorot: commission,
        }),
      )
    } else {
      const expected = percentageOf(agorot(paid), bps)
      if (expected !== commission) {
        findings.push(
          finding('percent_contradiction', {
            orderId: line.orderId,
            orderItemId: line.orderItemId,
            expectedAgorot: expected,
            actualAgorot: commission,
            platformPercent: bps / 100,
          }),
        )
      }
    }

    const event = chargeByItem.get(line.orderItemId)
    if (!event) {
      const paidAt = Date.parse(line.paidAtIso)
      // A line paid before the journal existed is not an unjournalled line. An
      // unparseable timestamp is treated as inside the epoch: reporting a
      // finding we cannot date is safer than excusing one.
      if (Number.isFinite(paidAt) && Number.isFinite(epoch) && paidAt < epoch) {
        beforeJournal += 1
      } else {
        findings.push(
          finding('journal_missing', {
            orderId: line.orderId,
            orderItemId: line.orderItemId,
            expectedAgorot: paid,
          }),
        )
      }
      continue
    }

    // The journal's `supplier_due_agorot` is the IMMEDIATE share, which is what
    // `buildChargeSettledEvents` writes. Comparing it to the escrow-inclusive
    // share would report drift on every legacy line that was journalled
    // correctly for its own model.
    const drift =
      toFiniteInt(event.paidOnSiteAgorot) !== paid ||
      toFiniteInt(event.commissionAgorot) !== commission ||
      toFiniteInt(event.supplierDueAgorot) !== toFiniteInt(line.supplierImmediateAgorot)

    if (drift) {
      findings.push(
        finding('journal_drift', {
          orderId: line.orderId,
          orderItemId: line.orderItemId,
          expectedAgorot: paid,
          actualAgorot: toFiniteInt(event.paidOnSiteAgorot),
          platformPercent: bps === null ? null : bps / 100,
        }),
      )
    }
  }

  for (const event of input.events) {
    if (event.kind !== 'charge_settled' || !event.orderItemId) continue
    if (lineIds.has(event.orderItemId)) continue
    findings.push(
      finding('journal_orphan', {
        orderId: event.orderId,
        orderItemId: event.orderItemId,
        actualAgorot: toFiniteInt(event.paidOnSiteAgorot),
      }),
    )
  }

  const refundKeys = new Set<string>()
  const keylessRefundOrders = new Set<string>()
  for (const event of input.events) {
    if (event.kind !== 'refund_issued') continue
    if (event.idempotencyKey) refundKeys.add(event.idempotencyKey)
    else keylessRefundOrders.add(event.orderId)
  }

  for (const refund of input.refunds) {
    // Keyed on the payment, exactly as `buildRefundEvents` keys it. The order
    // fallback covers only a refund that never reached the card (no payment id)
    // and a journal row written without a key, because matching a keyed refund
    // by order would let ONE journal row excuse a second refund on the same
    // order - which is the exact case a claw-back check exists for.
    const journalled = refund.paymentId
      ? refundKeys.has(`refund_issued:${refund.paymentId}`) ||
        keylessRefundOrders.has(refund.orderId)
      : keylessRefundOrders.has(refund.orderId) ||
        refundKeys.has(`refund_issued:order:${refund.orderId}`)

    if (!journalled) {
      findings.push(
        finding('refund_unjournalled', {
          orderId: refund.orderId,
          orderItemId: null,
          expectedAgorot: toFiniteInt(refund.grantedAgorot),
          subject: refund.refundId,
        }),
      )
    }
  }

  findings.sort((a, b) => {
    const byKind = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)
    if (byKind !== 0) return byKind
    return a.id.localeCompare(b.id)
  })

  const fired = new Set(findings.map((item) => item.id))
  const novel = findings.filter((item) => !known.has(item.id))
  const silenced = [...known].filter((id) => !fired.has(id)).sort()

  return {
    linesChecked: input.lines.length,
    eventsChecked: input.events.length,
    refundsChecked: input.refunds.length,
    beforeJournal,
    findings,
    novel,
    silenced,
    critical: novel.filter((item) => item.severity === 'critical').length,
  }
}
