/**
 * After a voucher burns, the order line's settlement is NOT flipped.
 *
 * Under the locked no-Escrow model (migration 085 / commission.ts): the whole
 * on-site coupon prepayment settles at payment time (`split_executed` /
 * `platform_settled`). The scan only burns the voucher; cash at the till never
 * enters the platform, and there is nothing to "release".
 *
 * This helper exists for a belt-and-suspenders path that may stamp
 * `settlement_status = redeemed` when that enum value is in use for display.
 * It must never accept or invent `escrow_held`.
 */

export const REDEEMABLE_SETTLEMENT_STATUSES = [
  'platform_settled',
  'paid',
  'split_executed',
] as const

export type RedeemableSettlementStatus = (typeof REDEEMABLE_SETTLEMENT_STATUSES)[number]

export type MarkOrderItemRedeemedPlan =
  | { ok: true; next: 'redeemed' }
  | { ok: false; reason: 'missing_id' | 'not_eligible' }

/**
 * Pure decision: should this order line move to settlement_status=redeemed?
 */
export function planMarkOrderItemRedeemed(input: {
  orderItemId: string | null | undefined
  currentSettlementStatus?: string | null
}): MarkOrderItemRedeemedPlan {
  if (!input.orderItemId) return { ok: false, reason: 'missing_id' }
  if (
    input.currentSettlementStatus != null &&
    !REDEEMABLE_SETTLEMENT_STATUSES.includes(
      input.currentSettlementStatus as RedeemableSettlementStatus,
    )
  ) {
    return { ok: false, reason: 'not_eligible' }
  }
  return { ok: true, next: 'redeemed' }
}

/**
 * Minimal shape of the service-role client. Typed loosely so Supabase's deep
 * generics cannot blow up the redeem route's typecheck.
 */
export type MarkRedeemedAdmin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: 'order_items') => any
}

/** Service-role write. Safe to call after a successful redeem RPC. */
export async function markOrderItemRedeemed(
  admin: MarkRedeemedAdmin,
  orderItemId: string,
): Promise<{ error: string | null }> {
  const plan = planMarkOrderItemRedeemed({ orderItemId })
  if (!plan.ok) return { error: 'missing order_item_id' }

  const { error } = await admin
    .from('order_items')
    .update({ settlement_status: 'redeemed' })
    .eq('id', orderItemId)
    .in('settlement_status', [...REDEEMABLE_SETTLEMENT_STATUSES])

  return { error: error?.message ?? null }
}
