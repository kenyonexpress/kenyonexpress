import { type PaidOrderLike, type SettlementPlan, planSettlement } from '@/lib/cashback/settlement'
import { agorotToIls } from '@/lib/commerce/money'
import { agorot } from '@/lib/money'
import { log } from '@/lib/observability/log'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Cashback settlement: the half that reads and writes.
 *
 * Reads the window, the users' full paid history, the item snapshots and the
 * two idempotency ledgers; hands them to `planSettlement`; posts what the plan
 * says under the SAME keys finalize would have used, through the SAME two
 * database functions. Nothing here computes an amount or a rank of its own:
 * the item amount is the order's snapshot, and the bonus is whatever
 * `fn_cashback_order_bonus` decides.
 *
 * ORDER OF THE TWO LEGS, PER ORDER: item credit first, then the bonus RPC,
 * exactly as finalize. The RPC mirrors the item credit into `cashback_ledger`
 * by looking up the wallet entry, so the entry must exist by the time it looks.
 *
 * PER-ORDER FAILURES DO NOT FAIL THE RUN. Each is logged with its order id and
 * counted; the orders that settled are settled, and the failed one is retried
 * tomorrow because its key is still absent. A failed READ fails the run,
 * because a plan built on a partial read could defer an order it should have
 * settled.
 */

/** Paid orders this far back are reconsidered every night. */
export const SETTLEMENT_WINDOW_DAYS = 30

/** Orders per run; a larger backlog drains over consecutive nights. */
export const SETTLEMENT_BATCH = 500

const RESERVE_CODE = 'platform:cashback_reserve'

export interface SettlementSummary {
  /** Paid orders in the window that were considered. */
  scanned: number
  /** Per-item credits posted this run. */
  itemCredited: number
  /** Sum of those credits, integer agorot. */
  itemCreditedAgorot: number
  /** Bonus RPC calls that awarded money. */
  bonusAwarded: number
  /** Sum of the bonuses awarded, integer agorot. */
  bonusAwardedAgorot: number
  /** Bonus RPC calls that decided nothing was owed. */
  bonusNotOwed: number
  /** Orders that earned a bonus by rank and need `fn_cashback_admin_adjust`. */
  deferred: number
  /** Per-order failures, logged individually. */
  errors: number
}

type OrderRow = { id: string; user_id: string | null; paid_at: string | null }

function toPaidOrders(rows: readonly OrderRow[]): PaidOrderLike[] {
  return rows
    .filter((row): row is OrderRow & { user_id: string; paid_at: string } =>
      Boolean(row.user_id && row.paid_at),
    )
    .map((row) => ({ id: row.id, userId: row.user_id, paidAt: row.paid_at }))
}

/** Paid orders in the window, oldest first, capped at `batch`. */
async function readWindowOrders(
  admin: SupabaseClient,
  since: string,
  batch: number,
): Promise<PaidOrderLike[]> {
  const { data, error } = await admin
    .from('orders')
    .select('id, user_id, paid_at')
    .not('paid_at', 'is', null)
    .gte('paid_at', since)
    .order('paid_at', { ascending: true })
    .limit(batch)
  if (error) throw new Error(`orders window read failed: ${error.message}`)
  return toPaidOrders((data ?? []) as unknown as OrderRow[])
}

/** Every paid order these users ever had; a rank is a count of what came before. */
async function readHistoryOrders(
  admin: SupabaseClient,
  userIds: string[],
): Promise<PaidOrderLike[]> {
  const { data, error } = await admin
    .from('orders')
    .select('id, user_id, paid_at')
    .not('paid_at', 'is', null)
    .in('user_id', userIds)
  if (error) throw new Error(`orders history read failed: ${error.message}`)
  return toPaidOrders((data ?? []) as unknown as OrderRow[])
}

async function getOrCreateUserWalletAccount(
  admin: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data: existing, error } = await admin
    .from('wallet_accounts')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(`wallet account read failed: ${error.message}`)
  if (existing) return existing.id
  // 23505 here is a race with another writer, and the re-read is its handler.
  await admin.from('wallet_accounts').insert({ user_id: userId })
  const { data: reread, error: rereadError } = await admin
    .from('wallet_accounts')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()
  if (rereadError) throw new Error(`wallet account reread failed: ${rereadError.message}`)
  if (!reread) throw new Error('wallet account missing after insert')
  return reread.id
}

async function reserveAccountId(admin: SupabaseClient): Promise<string> {
  const { data, error } = await admin
    .from('wallet_accounts')
    .select('id')
    .eq('code', RESERVE_CODE)
    .maybeSingle()
  if (error) throw new Error(`reserve account read failed: ${error.message}`)
  if (data) return data.id
  // Created on demand, the way fn_cashback_order_bonus does it. The hosted
  // table has no owner_type column (measured 2026-09-17), so only `code`.
  await admin.from('wallet_accounts').insert({ code: RESERVE_CODE })
  const { data: reread, error: rereadError } = await admin
    .from('wallet_accounts')
    .select('id')
    .eq('code', RESERVE_CODE)
    .maybeSingle()
  if (rereadError) throw new Error(`reserve account reread failed: ${rereadError.message}`)
  if (!reread) throw new Error('reserve account missing after insert')
  return reread.id
}

/** Builds the plan from production rows. Exported for the route's test. */
export async function readSettlementPlan(
  admin: SupabaseClient,
  now: Date,
  options: { windowDays?: number; batch?: number } = {},
): Promise<{ plan: SettlementPlan; scanned: number }> {
  const windowDays = options.windowDays ?? SETTLEMENT_WINDOW_DAYS
  const batch = options.batch ?? SETTLEMENT_BATCH
  const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString()

  const window = await readWindowOrders(admin, since, batch)
  if (window.length === 0) {
    return { plan: { itemCredits: [], bonusCalls: [], deferred: [] }, scanned: 0 }
  }

  const userIds = [...new Set(window.map((o) => o.userId))]
  const orderIds = window.map((o) => o.id)
  const history = await readHistoryOrders(admin, userIds)

  const [items, entries, ledger] = await Promise.all([
    admin.from('order_items').select('order_id, cashback_amount_agorot').in('order_id', orderIds),
    admin
      .from('wallet_entries')
      .select('idempotency_key')
      .in(
        'idempotency_key',
        orderIds.map((id) => `order:${id}:cashback`),
      ),
    admin
      .from('cashback_ledger' as never)
      .select('idempotency_key')
      .in(
        'idempotency_key',
        orderIds.map((id) => `order:${id}:count_bonus`),
      ),
  ])
  if (items.error) throw new Error(`order_items read failed: ${items.error.message}`)
  if (entries.error) throw new Error(`wallet_entries read failed: ${entries.error.message}`)
  if (ledger.error) throw new Error(`cashback_ledger read failed: ${ledger.error.message}`)

  const itemCashbackByOrder = new Map<string, number>()
  for (const row of (items.data ?? []) as {
    order_id: string
    cashback_amount_agorot: number | null
  }[]) {
    const amount = row.cashback_amount_agorot ?? 0
    if (!Number.isSafeInteger(amount)) continue
    itemCashbackByOrder.set(row.order_id, (itemCashbackByOrder.get(row.order_id) ?? 0) + amount)
  }
  const keyToOrder = (key: string, suffix: string) =>
    key.startsWith('order:') && key.endsWith(suffix)
      ? key.slice('order:'.length, key.length - suffix.length)
      : null
  const itemCredited = new Set<string>()
  for (const row of (entries.data ?? []) as { idempotency_key: string }[]) {
    const id = keyToOrder(row.idempotency_key, ':cashback')
    if (id) itemCredited.add(id)
  }
  const bonusRecorded = new Set<string>()
  for (const row of (ledger.data ?? []) as unknown as { idempotency_key: string }[]) {
    const id = keyToOrder(row.idempotency_key, ':count_bonus')
    if (id) bonusRecorded.add(id)
  }

  return {
    plan: planSettlement({ history, window, itemCashbackByOrder, itemCredited, bonusRecorded }),
    scanned: window.length,
  }
}

export async function settleCashback(
  admin: SupabaseClient,
  now: Date,
  options: { windowDays?: number; batch?: number } = {},
): Promise<SettlementSummary> {
  const { plan, scanned } = await readSettlementPlan(admin, now, options)
  const summary: SettlementSummary = {
    scanned,
    itemCredited: 0,
    itemCreditedAgorot: 0,
    bonusAwarded: 0,
    bonusAwardedAgorot: 0,
    bonusNotOwed: 0,
    deferred: plan.deferred.length,
    errors: 0,
  }

  for (const d of plan.deferred) {
    // Visible every night until an operator settles it by hand; the amount is
    // not computed here because the basis is the order total and the admin
    // adjustment RPC takes the amount as its argument.
    log.warn('cashback.settlement_deferred', {
      orderId: d.orderId,
      userId: d.userId,
      rank: d.rank,
      rateBp: d.rateBp,
    })
  }

  let reserve: string | null = null
  for (const credit of plan.itemCredits) {
    try {
      reserve = reserve ?? (await reserveAccountId(admin))
      const userAccount = await getOrCreateUserWalletAccount(admin, credit.userId)
      const { error } = await admin.rpc('fn_wallet_transfer', {
        p_debit_account: reserve,
        p_credit_account: userAccount,
        p_amount_ils: agorotToIls(agorot(credit.amountAgorot)),
        p_reason: 'order_cashback',
        p_idempotency: `order:${credit.orderId}:cashback`,
        p_order_id: credit.orderId,
      })
      if (error) throw new Error(error.message)
      summary.itemCredited++
      summary.itemCreditedAgorot += credit.amountAgorot
      log.info('cashback.settlement_item_credited', {
        orderId: credit.orderId,
        amountAgorot: credit.amountAgorot,
      })
    } catch (err) {
      summary.errors++
      log.error('cashback.settlement_item_failed', {
        orderId: credit.orderId,
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  }

  for (const call of plan.bonusCalls) {
    try {
      const { data, error } = await admin.rpc(
        'fn_cashback_order_bonus' as never,
        {
          p_order_id: call.orderId,
        } as never,
      )
      if (error) throw new Error(error.message)
      const awarded = Number(data ?? 0)
      if (awarded > 0) {
        summary.bonusAwarded++
        summary.bonusAwardedAgorot += awarded
        log.info('cashback.settlement_bonus_awarded', {
          orderId: call.orderId,
          rank: call.rank,
          amountAgorot: awarded,
        })
      } else {
        summary.bonusNotOwed++
      }
    } catch (err) {
      summary.errors++
      log.error('cashback.settlement_bonus_failed', {
        orderId: call.orderId,
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return summary
}
