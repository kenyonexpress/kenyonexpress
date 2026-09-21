import { type Agorot, agorot, sumAgorot } from '@/lib/money'
import { addBusinessDays } from '@/lib/shipping/estimate'
import { supplierDueAgorot } from '@/lib/supplier/dashboard'

/**
 * The daily payout run, as arithmetic (section 55).
 *
 * The cron (src/app/api/cron/payout-run/route.ts) reads and writes; this
 * module decides. Given one supplier's paid physical lines, the ids already on
 * a live statement, the supplier's hold and minimum, and the clock, it says
 * whether a statement is due today and exactly which lines and totals it
 * carries. Pure, so the money rules are testable without a database.
 *
 * WHAT IS PAYABLE, and why this file does not invent a rule for it:
 * `supplierDueAgorot` is the one function every surface the supplier can see
 * already goes through (dashboard, /supplier/payouts, both CSVs, the PDF).
 * The run pays what those show as "מגיע לכם מהפלטפורמה" and nothing else, so
 * a statement can never disagree with the page the supplier reads it on.
 * Physical lines only: a coupon's balance is collected at the till and never
 * enters our ledger (dashboard.ts, `summarizeSettlement`), so there is nothing
 * to transfer for it.
 *
 * Money stays integer agorot until the very edge where the ILS-typed table
 * columns are written (the route converts once, per column, with
 * agorotToIls). No float touches a sum here.
 */

export type PayoutCandidate = {
  orderItemId: string
  orderId: string
  productName: string
  quantity: number
  platformPercent: number | null
  /** What the customer paid for the line, agorot. */
  grossAgorot: number
  /** The platform's cut, agorot. */
  platformFeeAgorot: number
  /** The supplier's share as snapshotted at purchase, agorot. */
  supplierImmediateAgorot: number
  settlementStatus: string | null
  paidAt: string | null
  fulfilledAt: string | null
  deliveredAt: string | null
}

export type PlannedLine = {
  orderItemId: string
  description: string
  quantity: number
  platformPercent: number | null
  grossAgorot: Agorot
  platformFeeAgorot: Agorot
  payoutAgorot: Agorot
  availableAt: string
}

export type SupplierPayoutInput = {
  supplierId: string
  candidates: PayoutCandidate[]
  /** order_item ids already on a statement that is not cancelled. */
  statementedItemIds: ReadonlySet<string>
  /** `suppliers.payout_hold_business_days`, with the schema default applied by the caller. */
  holdBusinessDays: number
  /** `suppliers.min_payout_ils` in agorot, with the schema default applied by the caller. */
  minPayoutAgorot: Agorot
  /** The last live statement's period_end (YYYY-MM-DD), or null for the first one. */
  lastPeriodEnd: string | null
}

export type PayoutPlan =
  | {
      kind: 'statement'
      lines: PlannedLine[]
      totalGrossAgorot: Agorot
      totalPlatformFeeAgorot: Agorot
      totalPayoutAgorot: Agorot
      /** The latest line's availability: when the whole statement became payable. */
      availableAt: string
      periodStart: string
      periodEnd: string
      heldLines: number
    }
  | { kind: 'below_minimum'; dueAgorot: Agorot; lineCount: number; heldLines: number }
  | { kind: 'held'; heldLines: number; earliestAvailableAt: string }
  | { kind: 'undelivered'; undeliveredLines: number }
  | { kind: 'nothing' }

/**
 * The date a line becomes payable: hold business days after it was delivered,
 * or, when delivery is not recorded, after it was fulfilled. NEVER after it
 * was merely paid: a physical item the customer has not received is an item
 * they can still refuse, and the old generator (`generate_payout_statement`)
 * required `item_status = 'delivered'` for the same reason. A line with
 * neither date is reported as `undelivered`, not paid.
 */
export function availableAtFor(
  candidate: PayoutCandidate,
  holdBusinessDays: number,
): string | null {
  const anchor = candidate.deliveredAt ?? candidate.fulfilledAt
  if (!anchor) return null
  const start = new Date(anchor)
  if (Number.isNaN(start.getTime())) return null
  return addBusinessDays(start, Math.max(0, holdBusinessDays)).toISOString()
}

/** YYYY-MM-DD in Israel for a given instant. */
export function jerusalemDate(at: Date): string {
  return at.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
}

function nextDay(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

export function planSupplierPayout(input: SupplierPayoutInput, now: Date): PayoutPlan {
  const lines: PlannedLine[] = []
  let heldLines = 0
  let undeliveredLines = 0
  let earliestHeld: string | null = null

  for (const candidate of input.candidates) {
    if (input.statementedItemIds.has(candidate.orderItemId)) continue
    const due = supplierDueAgorot(candidate)
    if (due <= 0) continue
    const availableAt = availableAtFor(candidate, input.holdBusinessDays)
    if (!availableAt) {
      undeliveredLines += 1
      continue
    }
    if (new Date(availableAt).getTime() > now.getTime()) {
      heldLines += 1
      if (!earliestHeld || availableAt < earliestHeld) earliestHeld = availableAt
      continue
    }
    lines.push({
      orderItemId: candidate.orderItemId,
      description: candidate.productName,
      quantity: Math.max(1, Math.trunc(candidate.quantity)),
      platformPercent: candidate.platformPercent,
      grossAgorot: agorot(Math.max(0, Math.trunc(candidate.grossAgorot))),
      platformFeeAgorot: agorot(Math.max(0, Math.trunc(candidate.platformFeeAgorot))),
      payoutAgorot: agorot(due),
      availableAt,
    })
  }

  if (lines.length === 0) {
    if (heldLines > 0 && earliestHeld)
      return { kind: 'held', heldLines, earliestAvailableAt: earliestHeld }
    if (undeliveredLines > 0) return { kind: 'undelivered', undeliveredLines }
    return { kind: 'nothing' }
  }

  const totalPayoutAgorot = sumAgorot(lines.map((l) => l.payoutAgorot))
  if (totalPayoutAgorot < input.minPayoutAgorot) {
    return {
      kind: 'below_minimum',
      dueAgorot: totalPayoutAgorot,
      lineCount: lines.length,
      heldLines,
    }
  }

  const today = jerusalemDate(now)
  const earliestPaid = input.candidates
    .filter((c) => lines.some((l) => l.orderItemId === c.orderItemId))
    .map((c) => (c.paidAt ? jerusalemDate(new Date(c.paidAt)) : today))
    .sort()[0]
  const periodStart = input.lastPeriodEnd ? nextDay(input.lastPeriodEnd) : (earliestPaid ?? today)

  return {
    kind: 'statement',
    lines,
    totalGrossAgorot: sumAgorot(lines.map((l) => l.grossAgorot)),
    totalPlatformFeeAgorot: sumAgorot(lines.map((l) => l.platformFeeAgorot)),
    totalPayoutAgorot,
    availableAt: lines
      .map((l) => l.availableAt)
      .sort()
      .at(-1) as string,
    periodStart: periodStart <= today ? periodStart : today,
    periodEnd: today,
    heldLines,
  }
}
