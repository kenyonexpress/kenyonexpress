/**
 * After a voucher burns, the order line must show the redemption in
 * settlement_status. The RPC in 092 does this inside the same transaction;
 * this helper is the TypeScript contract + a belt-and-suspenders path the
 * redeem route can call when the payload includes order_item_id.
 *
 * item_status has no `redeemed` label (007 enum), so it stays `issued`.
 */

export const REDEEMABLE_SETTLEMENT_STATUSES = ['platform_settled', 'paid', 'escrow_held'] as const

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
