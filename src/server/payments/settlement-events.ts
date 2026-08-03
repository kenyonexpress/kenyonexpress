import { log } from '@/lib/observability/log'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Writes the money journal defined by migration 094.
 *
 * `order_items` records what was AGREED for a line: the platform_percent and
 * supplier_split_percent snapshotted at purchase, which is what 070 established
 * and what buildOrderItemSnapshot refuses to invent. This records what
 * HAPPENED, with a time on it, and carries its own copy of the percent it was
 * computed under so an admin editing a product tomorrow cannot rewrite what a
 * customer was charged today.
 *
 * The two answers diverge the moment anything is not a single clean sale: a
 * coupon is charged once and redeemed months later or never, a refund reverses
 * part of a line, and reconciliation against a terminal's own report needs
 * timestamps rather than totals.
 *
 * WHY THIS CANNOT THROW
 *
 * Migration 094 was applied to production on 2026-07-31, so the table exists
 * and `charge_settled` records from the next paid order. The swallowing stays,
 * and not as a leftover: this runs after the card has been charged and the
 * order closed, and a journal write is not worth unwinding a payment for. A
 * failure is logged and never reaches the caller, because there is nothing
 * useful the caller could do with it at that point in the flow.
 *
 * The 42703 branch below also stays. Deployments run against more than one
 * database (a preview branch, a fresh local stack), and on one where 094 has
 * not been applied the right behaviour is still an empty journal rather than a
 * broken checkout.
 */

export type SettlementEventKind =
  | 'charge_settled'
  | 'voucher_redeemed'
  | 'voucher_expired'
  | 'refund_issued'
  | 'discount_funded'
  | 'payout_settled'

export type SettlementEventRow = {
  order_id: string
  order_item_id: string | null
  supplier_id: string | null
  kind: SettlementEventKind
  paid_on_site_agorot: number
  commission_agorot: number
  supplier_due_agorot: number
  discount_agorot: number
  platform_percent_snapshot: number | null
  supplier_split_percent_snapshot: number | null
  metadata: Record<string, unknown>
  idempotency_key: string
  occurred_at: string
}

/** The order-line shape this builder needs. Deliberately narrow. */
export type SettledLine = {
  id: string
  supplier_id: string | null
  paid_on_site_agorot: number | string | null
  commission_agorot: number | string | null
  supplier_immediate_agorot: number | string | null
  platform_percent: number | string | null
}

function toAgorot(value: number | string | null | undefined): number {
  const parsed = typeof value === 'string' ? Number(value) : (value ?? 0)
  return Number.isFinite(parsed) ? Math.round(parsed) : 0
}

function toPercent(value: number | string | null | undefined): number | null {
  if (value == null) return null
  const parsed = typeof value === 'string' ? Number(value) : value
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return null
  return parsed
}

/**
 * One `charge_settled` event per line of a paid order.
 *
 * Pure, so what gets journalled is testable without a database — which matters
 * more here than usual, since the table it writes to does not exist yet.
 *
 * The idempotency key is per line and per kind, not per call. finalizeOrder is
 * replay-safe by design (the webhook can deliver twice, the return page
 * reconciles the same order), so this will be attempted more than once for the
 * same line, and the unique constraint on the column is what makes the second
 * attempt a no-op instead of a double entry.
 */
export function buildChargeSettledEvents(
  orderId: string,
  lines: readonly SettledLine[],
  occurredAt: Date,
  extra: { paymentId?: string | null; cardcomAccountId?: string | null } = {},
): SettlementEventRow[] {
  return lines.map((line) => {
    const platformPercent = toPercent(line.platform_percent)
    return {
      order_id: orderId,
      order_item_id: line.id,
      supplier_id: line.supplier_id,
      kind: 'charge_settled' as const,
      paid_on_site_agorot: toAgorot(line.paid_on_site_agorot),
      commission_agorot: toAgorot(line.commission_agorot),
      supplier_due_agorot: toAgorot(line.supplier_immediate_agorot),
      discount_agorot: 0,
      platform_percent_snapshot: platformPercent,
      // Derived rather than read: 094's CHECK requires the pair to sum to 100,
      // and the line stores only one half. Deriving keeps the constraint
      // satisfiable by construction, exactly as the product write does.
      supplier_split_percent_snapshot: platformPercent === null ? null : 100 - platformPercent,
      metadata: {
        payment_id: extra.paymentId ?? null,
        cardcom_account_id: extra.cardcomAccountId ?? null,
      },
      idempotency_key: `charge_settled:${line.id}`,
      occurred_at: occurredAt.toISOString(),
    }
  })
}

let missingTableReported = false

/**
 * Inserts the events, and never lets a failure reach the caller.
 *
 * `upsert` on the unique idempotency key with ignoreDuplicates, so a replayed
 * finalize adds nothing rather than erroring on a constraint it is expected to
 * hit.
 */
export async function recordSettlementEvents(
  admin: SupabaseClient,
  events: readonly SettlementEventRow[],
): Promise<void> {
  if (events.length === 0) return
  try {
    const { error } = await admin
      .from('settlement_events')
      .upsert(events as never, { onConflict: 'idempotency_key', ignoreDuplicates: true })
    if (error) {
      // 42P01 is "relation does not exist", which is the expected state until
      // 094 is applied. Said once per process; anything else is said every time,
      // because anything else is a surprise.
      const undefinedTable = error.code === '42P01'
      if (!undefinedTable || !missingTableReported) {
        log.error('settlement.not_recorded', {
          reason: error.message,
          undefined_table: undefinedTable,
        })
        if (undefinedTable) missingTableReported = true
      }
    }
  } catch (error) {
    log.error('settlement.not_recorded', { err: error })
  }
}
