import 'server-only'

import { decideSettlement } from '@/lib/affiliate/rules'
import { agorotToIls } from '@/lib/commerce/money'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'

const HOUSE_ACCOUNT = 'platform:adjustments'

type Pending = {
  id: string
  order_id: string
  affiliate_id: string
  commission_bp: number
  created_at: string
  orders: {
    status: string
    paid_at: string | null
    created_at: string
    total_ils_agorot: number | null
    user_id: string | null
  }
  affiliates: { user_id: string }
}

export interface SettleSummary {
  scanned: number
  paid: number
  reversed: number
  waiting: number
  failed: number
}

async function walletAccountFor(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<string | null> {
  const { data, error: readError } = await admin
    .from('wallet_accounts')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()
  // Falling through to the insert on a failed read is how a second account gets made.
  if (readError) {
    log.error('affiliate.wallet_read_failed', { reason: readError.message })
    return null
  }
  if (data?.id) return data.id
  const { data: created, error } = await admin
    .from('wallet_accounts')
    .insert({ user_id: userId })
    .select('id')
    .single()
  if (error) {
    // A concurrent creator won; read it back.
    const { data: again, error: againError } = await admin
      .from('wallet_accounts')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle()
    if (againError) log.error('affiliate.wallet_reread_failed', { reason: againError.message })
    return again?.id ?? null
  }
  return (created as { id: string }).id
}

/**
 * Pays matured affiliate commissions into the affiliate's wallet, through the
 * same `fn_wallet_transfer` ledger RPC the refund path uses, keyed
 * `affiliate:<order_id>` so a re-run can never pay twice.
 */
export async function settleAffiliateCommissions(
  now = new Date(),
  limit = 200,
): Promise<SettleSummary> {
  const admin = createAdminClient()
  const summary: SettleSummary = { scanned: 0, paid: 0, reversed: 0, waiting: 0, failed: 0 }

  const { data, error } = await admin
    .from('affiliate_attributions' as never)
    .select(
      'id, order_id, affiliate_id, commission_bp, created_at, orders!inner(status, paid_at, created_at, total_ils_agorot, user_id), affiliates!inner(user_id)',
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit)
  if (error) {
    log.error('affiliate.settle_read_failed', { reason: error.message })
    summary.failed += 1
    return summary
  }

  const { data: house, error: houseError } = await admin
    .from('wallet_accounts')
    .select('id')
    .eq('code', HOUSE_ACCOUNT)
    .maybeSingle()
  if (houseError) {
    log.error('affiliate.house_account_read_failed', { reason: houseError.message })
    summary.failed += 1
    return summary
  }

  for (const row of (data ?? []) as unknown as Pending[]) {
    summary.scanned += 1
    const decision = decideSettlement({
      orderStatus: row.orders.status,
      paidAt: row.orders.paid_at,
      createdAt: row.orders.created_at,
      orderTotalAgorot: Number(row.orders.total_ils_agorot ?? 0),
      orderUserId: row.orders.user_id,
      affiliateUserId: row.affiliates.user_id,
      commissionBp: row.commission_bp,
      now,
    })

    if (decision.action === 'wait') {
      summary.waiting += 1
      continue
    }
    if (decision.action === 'reverse') {
      await admin
        .from('affiliate_attributions' as never)
        .update({
          status: 'reversed',
          reversal_reason: decision.reason,
          settled_at: now.toISOString(),
        } as never)
        .eq('id', row.id)
        .eq('status', 'pending')
      summary.reversed += 1
      continue
    }

    if (decision.commissionAgorot <= 0) {
      await admin
        .from('affiliate_attributions' as never)
        .update({
          status: 'paid',
          base_agorot: decision.baseAgorot,
          commission_agorot: 0,
          settled_at: now.toISOString(),
        } as never)
        .eq('id', row.id)
      summary.paid += 1
      continue
    }

    const account = await walletAccountFor(admin, row.affiliates.user_id)
    if (!account || !house?.id) {
      log.error('affiliate.settle_accounts_missing', { attribution_id: row.id })
      summary.failed += 1
      continue
    }

    const key = `affiliate:${row.order_id}`
    const { error: transferError } = await admin.rpc('fn_wallet_transfer', {
      p_debit_account: house.id,
      p_credit_account: account,
      p_amount_ils: agorotToIls(decision.commissionAgorot),
      p_reason: 'affiliate_commission',
      p_idempotency: key,
      p_order_id: row.order_id,
    })
    if (transferError) {
      log.error('affiliate.settle_transfer_failed', {
        attribution_id: row.id,
        reason: transferError.message,
      })
      summary.failed += 1
      continue
    }

    // After the money moved: records are best effort, and the idempotency key
    // makes the next run harmless if one of these fails.
    await admin.from('affiliate_payouts' as never).upsert(
      {
        affiliate_id: row.affiliate_id,
        attribution_id: row.id,
        amount_agorot: decision.commissionAgorot,
        idempotency_key: key,
      } as never,
      { onConflict: 'idempotency_key', ignoreDuplicates: true },
    )
    await admin
      .from('affiliate_attributions' as never)
      .update({
        status: 'paid',
        base_agorot: decision.baseAgorot,
        commission_agorot: decision.commissionAgorot,
        settled_at: now.toISOString(),
      } as never)
      .eq('id', row.id)
    summary.paid += 1
  }

  return summary
}
