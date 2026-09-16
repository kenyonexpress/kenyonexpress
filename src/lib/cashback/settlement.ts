import { cashbackRateBp } from './engine'

/**
 * Cashback settlement: the pure half.
 *
 * WHAT A "SETTLEMENT" IS HERE. Cashback is credited at finalize, twice: the
 * per-item snapshot (`creditCashback`, keyed `order:<id>:cashback`) and the
 * order-count bonus (`fn_cashback_order_bonus`, keyed
 * `order:<id>:count_bonus`). Both calls sit AFTER the card was charged and
 * both are "logged, never thrown" by design: an order stuck charged-but-unpaid
 * is a worse incident than a bonus that did not post. The cost of that
 * judgement is a ledger gap nobody re-reads. This module decides, for every
 * paid order in the window, which of the two legs is still owed, and the
 * nightly route posts it under the same idempotency keys finalize would have.
 *
 * THE RANK TRAP, which is why this is not simply "call the RPC for every
 * paid order". `fn_cashback_order_bonus` ranks an order as
 * `count(other paid orders of this user) + 1`. That is the true rank only
 * while the order is the user's LATEST paid order. Replayed later, after more
 * orders were paid, it reports a HIGHER rank than the order really had: a
 * second order replayed after three more would rank fifth and be awarded a
 * 5% bonus it never earned. So the plan calls the RPC only for an order that
 * is still the user's latest, ranks every other order by `paid_at` itself,
 * and reports the ones that earned a bonus and cannot safely be replayed as
 * `deferred` for `fn_cashback_admin_adjust`. Under-award is left visible;
 * over-award is made impossible.
 *
 * Every amount is integer agorot. Nothing here touches a wallet.
 */

export interface PaidOrderLike {
  id: string
  userId: string
  /** ISO timestamp. Orders are ranked by this, oldest first. */
  paidAt: string
}

export interface SettlementInput {
  /** Every paid order of every user who has an order in the window. */
  history: readonly PaidOrderLike[]
  /** The orders under consideration this run, a subset of `history`. */
  window: readonly PaidOrderLike[]
  /** Integer agorot of per-item cashback the order snapshot promised. */
  itemCashbackByOrder: ReadonlyMap<string, number>
  /** Order ids whose `order:<id>:cashback` wallet entry already exists. */
  itemCredited: ReadonlySet<string>
  /** Order ids whose `order:<id>:count_bonus` ledger row already exists. */
  bonusRecorded: ReadonlySet<string>
}

export interface SettlementPlan {
  /** Orders owed the per-item credit, with the amount. */
  itemCredits: { orderId: string; userId: string; amountAgorot: number }[]
  /** Orders whose bonus decision can still be made by the RPC safely. */
  bonusCalls: { orderId: string; userId: string; rank: number }[]
  /** Orders that earned a bonus by rank but are no longer the user's latest. */
  deferred: { orderId: string; userId: string; rank: number; rateBp: number }[]
}

/**
 * 1-based rank of every order in `history` within its user, by `paidAt` then
 * id so two orders paid in the same millisecond still rank deterministically.
 */
export function rankPaidOrders(history: readonly PaidOrderLike[]): Map<string, number> {
  const byUser = new Map<string, PaidOrderLike[]>()
  for (const order of history) {
    const list = byUser.get(order.userId) ?? []
    list.push(order)
    byUser.set(order.userId, list)
  }
  const ranks = new Map<string, number>()
  for (const list of byUser.values()) {
    list.sort((a, b) => Date.parse(a.paidAt) - Date.parse(b.paidAt) || a.id.localeCompare(b.id))
    list.forEach((order, index) => ranks.set(order.id, index + 1))
  }
  return ranks
}

/** The id of each user's latest paid order, the only one the RPC ranks right. */
export function latestPaidOrderByUser(history: readonly PaidOrderLike[]): Map<string, string> {
  const latest = new Map<string, PaidOrderLike>()
  for (const order of history) {
    const current = latest.get(order.userId)
    if (
      !current ||
      Date.parse(order.paidAt) > Date.parse(current.paidAt) ||
      (Date.parse(order.paidAt) === Date.parse(current.paidAt) && order.id > current.id)
    ) {
      latest.set(order.userId, order)
    }
  }
  return new Map([...latest].map(([userId, order]) => [userId, order.id]))
}

export function planSettlement(input: SettlementInput): SettlementPlan {
  const ranks = rankPaidOrders(input.history)
  const latest = latestPaidOrderByUser(input.history)
  const plan: SettlementPlan = { itemCredits: [], bonusCalls: [], deferred: [] }

  for (const order of input.window) {
    const owedItems = input.itemCashbackByOrder.get(order.id) ?? 0
    if (owedItems > 0 && !input.itemCredited.has(order.id)) {
      plan.itemCredits.push({ orderId: order.id, userId: order.userId, amountAgorot: owedItems })
    }

    if (input.bonusRecorded.has(order.id)) continue
    const rank = ranks.get(order.id)
    if (rank === undefined) continue
    if (latest.get(order.userId) === order.id) {
      // The RPC's own rank equals this one here, so it decides.
      plan.bonusCalls.push({ orderId: order.id, userId: order.userId, rank })
      continue
    }
    const rateBp = cashbackRateBp(rank)
    if (rateBp > 0) {
      plan.deferred.push({ orderId: order.id, userId: order.userId, rank, rateBp })
    }
  }
  return plan
}
