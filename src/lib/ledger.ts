/**
 * Double-entry ledger posting for checkout v1 (module 7/9). Server-only.
 *
 * Every money mutation in the system flows through `postJournal`. A journal is
 * a set of signed lines (positive = debit, negative = credit) that MUST sum to
 * zero. `assertBalanced` enforces that in TypeScript before we ever touch the
 * database; the DB then re-checks it at COMMIT via the deferred sum-zero
 * trigger (migration 050), so there are two independent guards.
 *
 * Accounts are named by (kind, supplierId, userId) and resolved server-side by
 * fn_ensure_ledger_account. Posting is atomic and idempotent on `eventKey`
 * (migration 057 fn_post_journal): re-posting the same business event returns
 * the existing journal and writes nothing, which is what makes webhook
 * redelivery safe.
 *
 * Corrections are never edits: `postReversal` posts a new `reversal` journal
 * with every line negated, linked by `reverses_journal_id`.
 *
 * Binding source: LEDGER-DESIGN.md §3-§5, COMPLETE-SYSTEM-ARCHITECTURE.md §2.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type LedgerAccountKind =
  | 'cardcom_clearing'
  | 'platform_revenue'
  | 'vat_output'
  | 'supplier_payable'
  | 'customer_wallet'

export type LedgerEvent =
  | 'order_paid'
  | 'coupon_issued'
  | 'coupon_redeemed'
  | 'coupon_expired'
  | 'physical_settled'
  | 'refund'
  | 'chargeback'
  | 'wallet_cashback_earned'
  | 'wallet_spent'
  | 'wallet_expired'
  | 'manual_adjustment'
  | 'reversal'

/**
 * One posting line. `amountAgorot` is a signed integer: positive debits the
 * account, negative credits it. Global accounts (cardcom_clearing,
 * platform_revenue, vat_output) take neither owner; supplier_payable requires
 * `supplierId`; customer_wallet requires `userId`.
 */
export interface JournalLine {
  kind: LedgerAccountKind
  amountAgorot: number
  supplierId?: string
  userId?: string
  memo?: string
}

export interface JournalRefs {
  orderId?: string
  orderItemId?: string
  paymentId?: string
  couponCodeId?: string
}

export interface JournalInput {
  eventType: LedgerEvent
  /** Idempotency key of the business event, e.g. `order:<id>:paid`. */
  eventKey: string
  lines: JournalLine[]
  refs?: JournalRefs
  vatRateBp?: number
  memo?: string
}

export class UnbalancedJournalError extends Error {
  constructor(
    readonly eventKey: string,
    readonly sum: number,
  ) {
    super(`unbalanced journal ${eventKey}: lines sum to ${sum}, expected 0`)
    this.name = 'UnbalancedJournalError'
  }
}

// --- pure core (unit-testable, no DB) --------------------------------------

/** Throw unless the lines are non-empty, each non-zero, and sum to exactly 0. */
export function assertBalanced(eventKey: string, lines: readonly JournalLine[]): void {
  if (lines.length === 0) {
    throw new UnbalancedJournalError(eventKey, 0)
  }
  let sum = 0
  for (const line of lines) {
    if (!Number.isSafeInteger(line.amountAgorot)) {
      throw new TypeError(`line amount must be a safe integer (got ${line.amountAgorot})`)
    }
    if (line.amountAgorot === 0) {
      throw new TypeError(`zero-amount line for account ${line.kind} in ${eventKey}`)
    }
    sum += line.amountAgorot
  }
  if (sum !== 0) {
    throw new UnbalancedJournalError(eventKey, sum)
  }
}

/** Negate every line (debit<->credit). Used to build a reversal journal. */
export function negateLines(lines: readonly JournalLine[]): JournalLine[] {
  return lines.map((line) => ({ ...line, amountAgorot: -line.amountAgorot }))
}

function serializeLines(lines: readonly JournalLine[]): unknown[] {
  return lines.map((line) => ({
    kind: line.kind,
    amount_agorot: line.amountAgorot,
    supplier_id: line.supplierId ?? null,
    user_id: line.userId ?? null,
    memo: line.memo ?? null,
  }))
}

// --- DB posting (service-role) ---------------------------------------------

/**
 * Post a balanced journal atomically and idempotently. Returns the journal id
 * (existing id on replay). `client` MUST be the service-role admin client.
 */
export async function postJournal(client: SupabaseClient, input: JournalInput): Promise<string> {
  assertBalanced(input.eventKey, input.lines)

  const { data, error } = await client.rpc('fn_post_journal', {
    p_event_type: input.eventType,
    p_event_key: input.eventKey,
    p_lines: serializeLines(input.lines),
    p_order_id: input.refs?.orderId ?? null,
    p_order_item_id: input.refs?.orderItemId ?? null,
    p_payment_id: input.refs?.paymentId ?? null,
    p_coupon_code_id: input.refs?.couponCodeId ?? null,
    p_reverses_journal_id: null,
    p_vat_rate_bp: input.vatRateBp ?? 1700,
    p_memo: input.memo ?? null,
  })

  if (error) {
    throw new Error(`postJournal(${input.eventKey}) failed: ${error.message}`)
  }
  return data as string
}

/**
 * Post a reversal of `journalId`, negating `originalLines`. The DB enforces at
 * most one reversal per journal (reverses_journal_id UNIQUE). Idempotent on
 * `eventKey` (use `reversal:<journalId>`).
 */
export async function postReversal(
  client: SupabaseClient,
  params: {
    journalId: string
    eventKey: string
    originalLines: readonly JournalLine[]
    refs?: JournalRefs
    memo?: string
  },
): Promise<string> {
  const lines = negateLines(params.originalLines)
  assertBalanced(params.eventKey, lines)

  const { data, error } = await client.rpc('fn_post_journal', {
    p_event_type: 'reversal' satisfies LedgerEvent,
    p_event_key: params.eventKey,
    p_lines: serializeLines(lines),
    p_order_id: params.refs?.orderId ?? null,
    p_order_item_id: params.refs?.orderItemId ?? null,
    p_payment_id: params.refs?.paymentId ?? null,
    p_coupon_code_id: params.refs?.couponCodeId ?? null,
    p_reverses_journal_id: params.journalId,
    p_vat_rate_bp: 1700,
    p_memo: params.memo ?? null,
  })

  if (error) {
    throw new Error(`postReversal(${params.eventKey}) failed: ${error.message}`)
  }
  return data as string
}
