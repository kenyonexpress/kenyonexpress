import { type Agorot, ilsToAgorot } from '@/lib/commerce/money'

/**
 * Our record of what was charged, against the TERMINAL's record.
 *
 * WHAT THIS CATCHES THAT NOTHING ELSE DOES. `lib/admin/payment-reconciliation`
 * compares `payments` against `orders` - both of them our own tables - so it
 * finds an order that closed without a charge and a charge that never
 * finalized. It cannot find the failure that costs the most: money that moved
 * at Cardcom and left NO ROW HERE AT ALL. That happens when the request that
 * would have written the payment row died between the provider accepting the
 * charge and our transaction committing, and it is invisible from inside our
 * own database by construction - there is nothing to notice.
 *
 * The only way to see it is to ask the terminal what it thinks happened and
 * diff. That is what this does.
 *
 * THREE DISCREPANCIES, AND THEY ARE NOT EQUALLY URGENT:
 *
 *   `missing_locally`  - the terminal charged a customer and we have no record.
 *                        The customer paid and got nothing, and no support
 *                        ticket will ever mention an order number because none
 *                        exists. This is the one that must page a human.
 *
 *   `amount_mismatch`  - both sides have the transaction and disagree about the
 *                        money. Rare, and always a bug rather than an outage.
 *
 *   `missing_remotely` - we hold a succeeded payment the terminal does not
 *                        report. Usually a window-boundary artefact rather than
 *                        a fault, which is why the caller passes a window and
 *                        this is reported at a lower severity.
 *
 * AMOUNTS ARE COMPARED IN AGOROT AS INTEGERS. Cardcom reports shekels as a
 * decimal string; converting ours down to a float to compare would make ₪12.30
 * and ₪12.299999 look different on some rows and identical on others.
 */

export interface TerminalTransaction {
  /** Cardcom's internal deal number. The join key. */
  transactionId: string
  amountAgorot: number
  /** ISO date, as the terminal reports it. Kept for the report only. */
  occurredAt: string | null
  /** True for a refund/credit line, which must not be matched to a charge. */
  isRefund: boolean
}

export interface LocalPayment {
  paymentId: string
  orderId: string
  transactionId: string | null
  amountAgorot: number
  status: string
  kind: 'charge' | 'refund' | null
}

export type DiscrepancyKind = 'missing_locally' | 'amount_mismatch' | 'missing_remotely'

export interface Discrepancy {
  kind: DiscrepancyKind
  transactionId: string
  terminalAgorot: number | null
  localAgorot: number | null
  orderId: string | null
  paymentId: string | null
}

export interface ReconciliationReport {
  matched: number
  discrepancies: Discrepancy[]
  /** The count that decides whether a human is woken. */
  critical: number
}

/** Only these are money we believe moved. Anything else is not a charge yet. */
const SUCCEEDED = new Set(['succeeded', 'platform_settled'])

/**
 * Diffs the two lists.
 *
 * Refunds are excluded from BOTH sides rather than matched against each other.
 * A refund at the terminal has its own transaction id and our refund rows carry
 * theirs; pairing them is a separate question, and mixing the two here would
 * report every refunded order as a mismatch.
 */
export function reconcileAgainstTerminal(
  terminal: readonly TerminalTransaction[],
  local: readonly LocalPayment[],
): ReconciliationReport {
  const terminalCharges = terminal.filter((t) => !t.isRefund)
  const localCharges = local.filter(
    (p) => p.kind !== 'refund' && SUCCEEDED.has(p.status) && p.transactionId,
  )

  const byTransaction = new Map<string, LocalPayment>()
  for (const payment of localCharges) {
    if (payment.transactionId) byTransaction.set(payment.transactionId, payment)
  }

  const discrepancies: Discrepancy[] = []
  let matched = 0
  const seen = new Set<string>()

  for (const transaction of terminalCharges) {
    const payment = byTransaction.get(transaction.transactionId)
    if (!payment) {
      discrepancies.push({
        kind: 'missing_locally',
        transactionId: transaction.transactionId,
        terminalAgorot: transaction.amountAgorot,
        localAgorot: null,
        orderId: null,
        paymentId: null,
      })
      continue
    }
    seen.add(transaction.transactionId)

    if (payment.amountAgorot !== transaction.amountAgorot) {
      discrepancies.push({
        kind: 'amount_mismatch',
        transactionId: transaction.transactionId,
        terminalAgorot: transaction.amountAgorot,
        localAgorot: payment.amountAgorot,
        orderId: payment.orderId,
        paymentId: payment.paymentId,
      })
      continue
    }

    matched++
  }

  for (const payment of localCharges) {
    const id = payment.transactionId as string
    if (seen.has(id)) continue
    if (terminalCharges.some((t) => t.transactionId === id)) continue
    discrepancies.push({
      kind: 'missing_remotely',
      transactionId: id,
      terminalAgorot: null,
      localAgorot: payment.amountAgorot,
      orderId: payment.orderId,
      paymentId: payment.paymentId,
    })
  }

  return {
    matched,
    discrepancies,
    // Only the two that mean money is unaccounted for. `missing_remotely` is
    // usually the reporting window cutting a transaction in half, and treating
    // it as critical would page somebody nightly until they stopped reading.
    critical: discrepancies.filter(
      (d) => d.kind === 'missing_locally' || d.kind === 'amount_mismatch',
    ).length,
  }
}

/**
 * Shekels as the terminal reports them, as an exact decimal string this module
 * can hand to `ilsToAgorot`, or null when it is not one.
 *
 * The point is to reach `ilsToAgorot` with the terminal's DIGITS rather than
 * with a double built from them. `Number('12.30') * 100` is 1229.9999999999998
 * on some values and exact on others, and this file's own header explains why
 * that is intolerable here: it makes some rows differ and others not, and the
 * pattern of which is which reads like a real discrepancy.
 *
 * Sub-agora precision returns null rather than rounding. Trailing zeros are
 * dropped because "12.300" is 12.30, but "12.301" is a number no terminal
 * should be reporting, and quietly turning it into 1230 would be this money
 * path inventing an answer.
 */
function exactIlsText(raw: string | number): string | null {
  // Currency glyph, thousands separators, ordinary and non-breaking spaces.
  // Nothing else is stripped: the old cleaner used `[^\d.-]`, which deleted the
  // `e` out of `1e3` and turned it into the number 13.
  const cleaned = String(raw).replace(/[\s\u00a0,₪]/g, '')
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(cleaned)
  if (!match) return null

  const [, sign, whole, fraction] = match
  if (!fraction) return `${sign}${whole}`
  if (fraction.length <= 2) return `${sign}${whole}.${fraction}`
  if (/[^0]/.test(fraction.slice(2))) return null
  return `${sign}${whole}.${fraction.slice(0, 2)}`
}

/**
 * Shekels as the terminal reports them, to integer agorot, or null when the
 * value is not a readable amount.
 *
 * Callers on the money path want the null: `verifyLowProfile` feeds the webhook
 * branch that alarms on "payment row carries no readable amount" and refuses to
 * finalize, which is the safe direction. `terminalAmountToAgorot` below keeps
 * the zero for the reconciliation report, where a zero surfaces as a visible
 * amount mismatch rather than as a silent absence.
 */
export function parseTerminalAmountAgorot(raw: string | number | null | undefined): Agorot | null {
  if (raw === null || raw === undefined) return null
  const text = exactIlsText(raw)
  if (text === null) return null
  try {
    return ilsToAgorot(text)
  } catch {
    // Only reachable for a value too large to be a safe integer in agorot.
    return null
  }
}

/** Shekels as the terminal reports them, to integer agorot. Unreadable is zero. */
export function terminalAmountToAgorot(raw: string | number | null | undefined): number {
  return parseTerminalAmountAgorot(raw) ?? 0
}
