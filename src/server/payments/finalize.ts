import { sendServerPurchase } from '@/lib/analytics/server-events'
import { orFail } from '@/lib/catalogue-read'
import { agorot, agorotToIls } from '@/lib/commerce/money'
import {
  type VoucherRateColumn,
  moneyColumnProbe,
  resolveVoucherRateColumn,
} from '@/lib/commerce/order-money-columns'
import { log } from '@/lib/observability/log'
import { capturePaymentError } from '@/lib/observability/sentry'
import { resolvePaymentMoneySchema } from '@/lib/payments/payment-money-columns'
import { createAdminClient } from '@/lib/supabase/admin'
import { type VoucherIssueClient, issueVoucher } from '@/server/domain/vouchers/issue'
import { readGiftIntent, sendOrderGifts } from '@/server/payments/gift-vouchers'
import { enqueueOrderInvoice, issueQueuedInvoice } from '@/server/payments/invoices'
import {
  type SettledLine,
  buildChargeSettledEvents,
  recordSettlementEvents,
} from '@/server/payments/settlement-events'
import { sendVoucherEmail } from '@/server/payments/voucher-email'
import { completeReferralForOrder } from '@/server/referrals/complete'
import type { Json } from '@/types/database'

export type FinalizeOutcome =
  | { ok: true; replay: boolean; orderId: string }
  | { ok: false; error: string; code: 'NOT_FOUND' | 'STATE_INVALID' | 'INTERNAL' }

type AdminClient = ReturnType<typeof createAdminClient>

type OrderItemRow = {
  id: string
  order_id: string
  product_id: string | null
  product_type: string
  supplier_id: string | null
  quantity: number
  unit_price_agorot: number | null
  platform_percent: number | null
  upfront_percent: number | null
  commission_percent_snapshot: number | null
  paid_on_site_agorot: number | null
  commission_agorot: number | null
  face_value_agorot: number | null
  balance_due_agorot: number | null
  supplier_immediate_agorot: number | null
  cashback_amount_agorot: number | null
  settlement_status: string
}

/**
 * Splits a line-level agorot amount into per-unit integers; the first unit
 * absorbs the remainder (mirrors settlement.splitEscrowPerUnit).
 */
function perUnit(total: number, quantity: number): number[] {
  const base = Math.floor(total / quantity)
  return Array.from({ length: quantity }, (_, i) =>
    i === 0 ? total - base * (quantity - 1) : base,
  )
}

/**
 * Issues one voucher per purchased unit. No custody row is written: the whole
 * on-site prepayment is platform revenue at paid-time, and the supplier is owed
 * nothing by us for the line. What they earn is the balance the customer pays
 * at their counter, which never passes through our clearing account.
 *
 * Issuing is capped at the purchased quantity and keyed on order_item_id, so a
 * webhook replay is a no-op rather than a second voucher for the same unit.
 */
async function issueVouchersForItem(
  admin: AdminClient,
  item: OrderItemRow,
  userId: string,
  product: { couponExpiryDays: number | null; offerValidUntil: Date | null },
  now: Date,
  rateColumn: VoucherRateColumn,
): Promise<void> {
  if (!item.product_id || !item.supplier_id) {
    throw new Error(`coupon order item ${item.id} is missing product or supplier`)
  }
  // CONTRADICTIONS C7: validity is a mandatory per-product field with no
  // default. This used to fall back to 90 days, which invents a consumer
  // promise nobody made and, on expiry, decides when we owe the customer their
  // money back (C6). Refusing here is loud and recoverable: the payment stands,
  // finalize retries, and an admin sets the field. Guessing is neither.
  const expiryDays = product.couponExpiryDays
  if (expiryDays === null || expiryDays === undefined || expiryDays < 1) {
    throw new Error(
      `coupon order item ${item.id}: product has no coupon_expiry_days; refusing to issue a voucher with an invented expiry`,
    )
  }
  if (item.platform_percent === null || item.platform_percent === undefined) {
    throw new Error(
      `coupon order item ${item.id} has no platform_percent snapshot; refusing to issue`,
    )
  }

  const faceUnits = perUnit(item.face_value_agorot ?? 0, item.quantity)
  const paidUnits = perUnit(item.paid_on_site_agorot ?? 0, item.quantity)

  // Idempotency: never issue beyond quantity for this order_item (replay-safe).
  // The vouchers UNIQUE(code) plus this count cap make webhook replays no-ops.
  //
  // `orFail`, because THIS COUNT IS THE ONLY REPLAY CAP THAT COUNTS. UNIQUE(code)
  // cannot help: every issue mints a fresh random code, so a second pass
  // collides with nothing. A discarded error here reads as "none issued yet",
  // and the loop below mints the full quantity a SECOND time - each one a
  // voucher the customer can redeem at a counter for real goods, against a
  // balance we already treated as revenue.
  //
  // The path where that is likeliest is the one built for failures:
  // `webhook-dlq.ts` replays a finalize precisely when the first attempt broke,
  // which is when the database is least healthy. Throwing is what keeps the
  // replay safe to run repeatedly, which is the property that file promises.
  const existing = orFail(
    await admin
      .from('vouchers')
      .select('id')
      .eq('order_item_id', item.id)
      .order('issued_at', { ascending: true }),
    'finalize.issued_vouchers_read_failed',
    { orderItemId: item.id, orderId: item.order_id },
  )
  const issuedIds = (existing ?? []).map((row) => row.id)

  // No offer deadline on the product means the rolling per-product window is
  // the only limit; feed the issuer that same date so it never widens the TTL.
  const fallbackDeadline = new Date(now.getTime() + expiryDays * 24 * 60 * 60 * 1000)
  const offerValidUntil = product.offerValidUntil ?? fallbackDeadline

  for (let unit = issuedIds.length; unit < item.quantity; unit += 1) {
    const issued = await issueVoucher(admin as unknown as VoucherIssueClient, {
      orderId: item.order_id,
      orderItemId: item.id,
      productId: item.product_id,
      supplierId: item.supplier_id,
      userId,
      priceIls: agorotToIls(agorot(faceUnits[unit] ?? 0)),
      couponPriceIls: agorotToIls(agorot(paidUnits[unit] ?? 0)),
      platformPercent: item.platform_percent,
      couponExpiryDays: expiryDays,
      offerValidUntil,
      rateColumn,
      now,
    })
    issuedIds.push(issued.id)
  }
}

async function executeSplitForItem(
  admin: AdminClient,
  item: OrderItemRow,
  paymentId: string | null,
): Promise<void> {
  const { error } = await admin.from('split_executions').insert({
    order_item_id: item.id,
    order_id: item.order_id,
    supplier_id: item.supplier_id as string,
    face_value_agorot: item.face_value_agorot ?? 0,
    commission_agorot: item.commission_agorot ?? 0,
    supplier_agorot: item.supplier_immediate_agorot ?? 0,
    payment_id: paymentId,
  })
  // duplicate order_item_id => replay, fine
  if (error && !error.message.includes('duplicate')) {
    throw new Error(`split execution failed: ${error.message}`)
  }

  // STOCK IS NOT TOUCHED HERE ANY MORE. This used to do a read-modify-write:
  // SELECT stock_quantity, then UPDATE to `max(0, stock - qty)`. Two concurrent
  // finalizes read the same number and write the same result, so the second
  // sale never decremented - and the `max(0, ...)` floor then HID it, leaving
  // an oversell with no trace. The whole order's stock is now consumed once, in
  // one statement, by `consume_order_stock` at the end of `finalizeOrder`.
}

/**
 * Gathers what the two ad platforms need and hands it to `sendServerPurchase`.
 *
 * NEVER THROWS AND NEVER BLOCKS THE ORDER. It runs after the card is charged;
 * an analytics failure that propagated would leave a paid order incomplete over
 * a marketing metric. Awaited rather than fired and forgotten only because a
 * serverless invocation can be frozen the instant its response is returned.
 */
async function reportPurchase(
  admin: AdminClient,
  orderId: string,
  userId: string,
  items: OrderItemRow[],
): Promise<void> {
  try {
    const productIds = [...new Set(items.map((i) => i.product_id).filter((v): v is string => !!v))]
    const names = new Map<string, string>()
    if (productIds.length > 0) {
      // No deleted_at filter, on purpose: a paid order is fulfilled even if the
      // product was soft-deleted since checkout. See src/lib/soft-delete.ts.
      const { data: products } = await admin
        .from('products')
        .select('id, name_he')
        .in('id', productIds)
      for (const product of (products ?? []) as { id: string; name_he: string | null }[]) {
        if (product.name_he) names.set(product.id, product.name_he)
      }
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('email, phone')
      .eq('id', userId)
      .maybeSingle()

    // The value is what was CHARGED on site, line by line - not the face value
    // and not the list price. Reporting anything else makes the ad platforms
    // optimise against revenue that never arrived.
    const valueAgorot = items.reduce((sum, item) => sum + (item.paid_on_site_agorot ?? 0), 0)
    if (valueAgorot <= 0) return

    await sendServerPurchase({
      orderId,
      valueAgorot,
      items: items.map((item) => ({
        id: item.product_id ?? item.id,
        name: item.product_id ? (names.get(item.product_id) ?? 'פריט') : 'פריט',
        priceAgorot: Math.round((item.paid_on_site_agorot ?? 0) / Math.max(1, item.quantity)),
        quantity: item.quantity,
      })),
      email: (profile as { email: string | null } | null)?.email ?? null,
      phone: (profile as { phone: string | null } | null)?.phone ?? null,
    })
  } catch (error) {
    log.warn('analytics.server_purchase_threw', {
      orderId,
      reason: error instanceof Error ? error.message : 'unknown',
    })
  }
}

async function getOrCreateUserWalletAccount(
  admin: AdminClient,
  userId: string,
): Promise<{ id: string } | null> {
  const existing = orFail(
    await admin.from('wallet_accounts').select('id').eq('user_id', userId).maybeSingle(),
    'finalize.wallet_account_read_failed',
    { userId },
  )
  if (existing) return existing
  // The INSERT keeps its error, and that is the distinction this function turns
  // on: 23505 here is the expected answer to a race, not a failure, and the
  // re-read below is the handler for it. The two SELECTs around it have no such
  // reading - a failed one there returns null, and the caller reports it as
  // "wallet accounts missing", which is a different incident entirely.
  const { data: created } = await admin
    .from('wallet_accounts')
    .insert({ user_id: userId })
    .select('id')
    .maybeSingle()
  if (created) return created
  // unique-violation race: someone else created it, re-read
  const reread = orFail(
    await admin.from('wallet_accounts').select('id').eq('user_id', userId).maybeSingle(),
    'finalize.wallet_account_reread_failed',
    { userId },
  )
  return reread ?? null
}

/**
 * Credits the order's cashback snapshot to the buyer's wallet from
 * platform:cashback_reserve. Idempotent via `order:<id>:cashback`.
 */
async function creditCashback(
  admin: AdminClient,
  orderId: string,
  userId: string,
  cashbackAgorot: number,
): Promise<void> {
  if (cashbackAgorot <= 0) return
  const [userAccount, reserveResult] = await Promise.all([
    getOrCreateUserWalletAccount(admin, userId),
    admin
      .from('wallet_accounts')
      .select('id')
      .eq('code', 'platform:cashback_reserve')
      .maybeSingle(),
  ])
  const reserve = orFail(reserveResult, 'finalize.cashback_reserve_read_failed', {
    orderId,
    userId,
  })
  if (!userAccount || !reserve) {
    throw new Error('wallet accounts missing for cashback credit')
  }
  const { error } = await admin.rpc('fn_wallet_transfer', {
    p_debit_account: reserve.id,
    p_credit_account: userAccount.id,
    p_amount_ils: agorotToIls(agorot(cashbackAgorot)),
    p_reason: 'order_cashback',
    p_idempotency: `order:${orderId}:cashback`,
    p_order_id: orderId,
  })
  if (error) throw new Error(`cashback credit failed: ${error.message}`)

  // Queued only after the ledger move committed. Enqueuing before it would
  // promise money `fn_wallet_transfer` might still refuse, and the promise is
  // the part the customer remembers.
  //
  // Best-effort on purpose: the credit is the money and it has already landed.
  // A queue insert that fails must not roll back a wallet the customer can
  // already spend from, so it is logged and dropped. The dedupe key is derived
  // from the order, so a replayed finalize cannot produce a second notice.
  const { data: profile } = await admin
    .from('profiles')
    .select('email')
    .eq('id', userId)
    .maybeSingle()

  const { error: notifyError } = await admin.rpc('fn_enqueue_notification', {
    p_kind: 'cashback_credited',
    p_email: profile?.email ?? '',
    p_dedupe: `cashback:${orderId}`,
    p_payload: {
      order_id: orderId,
      order_ref: orderId.slice(0, 8).toUpperCase(),
      amount_agorot: cashbackAgorot,
    },
    p_user_id: userId,
  })
  if (notifyError) {
    log.warn('finalize.cashback_notify_failed', { orderId, reason: notifyError.message })
  }
}

async function spendWallet(
  admin: AdminClient,
  orderId: string,
  userId: string,
  walletAppliedIls: number,
): Promise<void> {
  if (walletAppliedIls <= 0) return
  // Both reads throw on error rather than resolving to null. The line below
  // already fails loudly, but it fails with the WRONG SENTENCE: "wallet accounts
  // missing" sends an operator to look for a ledger account that is sitting
  // right there, while the actual incident was a read that did not answer.
  const [userAccountResult, platformAccountResult] = await Promise.all([
    admin.from('wallet_accounts').select('id').eq('user_id', userId).maybeSingle(),
    admin.from('wallet_accounts').select('id').eq('code', 'platform:revenue').maybeSingle(),
  ])
  const userAccount = orFail(userAccountResult, 'finalize.spend_user_account_read_failed', {
    orderId,
    userId,
  })
  const platformAccount = orFail(
    platformAccountResult,
    'finalize.spend_platform_account_read_failed',
    { orderId },
  )
  if (!userAccount || !platformAccount) {
    throw new Error('wallet accounts missing for wallet spend')
  }
  const { error } = await admin.rpc('fn_wallet_transfer', {
    p_debit_account: userAccount.id,
    p_credit_account: platformAccount.id,
    p_amount_ils: walletAppliedIls,
    p_reason: 'order_spend',
    p_idempotency: `order:${orderId}:spend`,
    p_order_id: orderId,
  })
  if (error) throw new Error(`wallet spend failed: ${error.message}`)
}

/**
 * The single writer of the valuable transition (TS port of the future
 * checkout_finalize SQL function). Idempotent:
 * - paid_at guard makes replays no-ops
 * - coupon_codes count per order_item caps issuance
 * - escrow_holds.coupon_code_id / split_executions.order_item_id UNIQUE
 * - wallet transfer keyed `order:<id>:spend`
 *
 * Called only from the verified webhook handler / wallet-covers-all path /
 * reconcile — never from client-reachable code with unverified input.
 */
export async function finalizeOrder(input: {
  orderId: string
  paymentId: string | null
  transactionId: string | null
  token?: {
    token: string
    last4: string
    brand: string
    expiryMonth: number
    expiryYear: number
  }
  now?: Date
}): Promise<FinalizeOutcome> {
  const admin = createAdminClient()
  const now = input.now ?? new Date()

  try {
    // Every read from here down to the `paid_at` stamp throws instead of
    // resolving to null, and the reason is the alarm rather than the customer:
    // the webhook treats any `ok: false` as "payment verified but finalize
    // failed", the single worst state in the system, and then prints the reason
    // this function returned. A discarded error made that reason a lie - "order
    // not found" for an order that exists and whose card has just been charged -
    // and sent whoever answered the page hunting a missing row instead of a
    // database that stopped answering. The dead-letter replay is identical
    // either way; only the diagnosis changes, and only it was wrong.
    const order = orFail(
      await admin
        .from('orders')
        .select('id, user_id, status, paid_at, cashback_applied_agorot')
        .eq('id', input.orderId)
        .maybeSingle(),
      'finalize.order_read_failed',
      { orderId: input.orderId },
    )
    if (!order) return { ok: false, error: 'order not found', code: 'NOT_FOUND' }
    if (order.paid_at) return { ok: true, replay: true, orderId: order.id }
    if (order.status !== 'pending') {
      return {
        ok: false,
        error: `order not finalizable from ${order.status}`,
        code: 'STATE_INVALID',
      }
    }

    const items = orFail(
      await admin
        .from('order_items')
        .select(
          'id, order_id, product_id, product_type, supplier_id, quantity, unit_price_agorot, platform_percent, upfront_percent, commission_percent_snapshot, paid_on_site_agorot, commission_agorot, face_value_agorot, balance_due_agorot, supplier_immediate_agorot, cashback_amount_agorot, settlement_status',
        )
        .eq('order_id', order.id),
      'finalize.order_items_read_failed',
      { orderId: order.id },
    )
    if (!items || items.length === 0) {
      return { ok: false, error: 'order has no items', code: 'STATE_INVALID' }
    }

    let walletApplied = 0
    let cardcomAccountId: string | null = null
    if (input.paymentId) {
      // The wallet column is amount-in-shekels before 059 and agorot after it,
      // and naming the wrong one fails this select outright, which would abort a
      // finalize for a card that has already been charged.
      const money = await resolvePaymentMoneySchema((column) =>
        admin
          .from('payments')
          .select(column)
          .limit(0)
          .then(({ error }) => ({ error })),
      )
      const paymentRow = orFail(
        await admin
          .from('payments')
          .select(`id, status, ${money.walletAppliedColumn}, cardcom_account_id`)
          .eq('id', input.paymentId)
          .maybeSingle(),
        'finalize.payment_read_failed',
        { orderId: order.id, paymentId: input.paymentId },
      )
      const payment = paymentRow as unknown as
        | (Record<string, unknown> & {
            id: string
            status: string
            cardcom_account_id: string | null
          })
        | null
      if (!payment) return { ok: false, error: 'payment not found', code: 'NOT_FOUND' }
      // walletApplied is spent downstream in shekels, which is what this
      // variable has always held.
      walletApplied = (money.toAgorot(payment[money.walletAppliedColumn]) ?? 0) / 100
      cardcomAccountId = payment.cardcom_account_id

      const { error: payError } = await admin
        .from('payments')
        .update({
          status: 'succeeded',
          cardcom_transaction_id: input.transactionId,
          succeeded_at: now.toISOString(),
        })
        .eq('id', payment.id)
        .in('status', ['initiated', 'redirected'])
      if (payError) {
        return { ok: false, error: `payment update failed: ${payError.message}`, code: 'INTERNAL' }
      }
    } else {
      // spendWallet speaks shekels (fn_wallet_transfer takes p_amount_ils), the
      // column has held agorot since 059. Reading it as shekels credited a
      // hundredth of what the customer actually spent from their wallet.
      walletApplied = Number(order.cashback_applied_agorot ?? 0) / 100
    }

    await spendWallet(admin, order.id, order.user_id, walletApplied)

    const productInfo = new Map<
      string,
      { couponExpiryDays: number | null; offerValidUntil: Date | null }
    >()
    const productIds = items
      .map((i) => i.product_id)
      .filter((id): id is string => typeof id === 'string')
    if (productIds.length > 0) {
      // This one changes the SENTENCE an admin is given. A failed read leaves
      // `productInfo` empty, the per-item lookup falls back to a null expiry,
      // and C7 below refuses with "product has no coupon_expiry_days" - telling
      // an admin to go set a field that is already set, on an order that is
      // stuck for an entirely different reason.
      // No deleted_at filter: expiry terms of an already-paid coupon must be
      // readable even after the product is soft-deleted.
      const products = orFail(
        await admin
          .from('products')
          .select('id, coupon_expiry_days, offer_valid_until')
          .in('id', productIds),
        'finalize.product_expiry_read_failed',
        { orderId: order.id },
      )
      for (const p of products ?? []) {
        productInfo.set(p.id, {
          couponExpiryDays: p.coupon_expiry_days,
          offerValidUntil: p.offer_valid_until ? new Date(p.offer_valid_until) : null,
        })
      }
    }

    // Asked once for the whole order rather than per voucher; the probe caches
    // per table per process, but a coupon order issues one voucher per unit and
    // the intent is clearer resolved next to the loop that consumes it.
    const rateColumn = await resolveVoucherRateColumn(moneyColumnProbe(admin as never, 'vouchers'))

    for (const item of items as OrderItemRow[]) {
      if (item.product_type === 'coupon') {
        const info = (item.product_id ? productInfo.get(item.product_id) : undefined) ?? {
          couponExpiryDays: null,
          offerValidUntil: null,
        }
        await issueVouchersForItem(admin, item, order.user_id, info, now, rateColumn)
        // The coupon line is settled the moment it is paid: everything charged
        // online is ours, nothing is deferred, and scanning the voucher moves
        // no money. It shares split_executed with physical lines because the
        // split did happen, at 100/0.
        await admin
          .from('order_items')
          .update({ settlement_status: 'split_executed', item_status: 'issued' })
          .eq('id', item.id)
          .in('settlement_status', ['pending', 'paid'])
      } else {
        await executeSplitForItem(admin, item, input.paymentId)
        await admin
          .from('order_items')
          .update({ settlement_status: 'split_executed' })
          .eq('id', item.id)
          .in('settlement_status', ['pending', 'paid'])
      }
    }

    const cashbackTotal = (items as OrderItemRow[]).reduce(
      (sum, item) => sum + (item.cashback_amount_agorot ?? 0),
      0,
    )
    await creditCashback(admin, order.id, order.user_id, cashbackTotal)

    // The referral bonus, if this buyer was referred and this order qualifies.
    //
    // After the cashback credit and before the stock consumption on purpose:
    // both of those are the same class of work - money and counters that follow
    // a payment - and this one carries the weakest claim on the order's
    // success, so it goes last of the two that touch a wallet. Every rule about
    // whether anything is owed lives in `fn_complete_referral`; this call site
    // decides nothing. Like the stock line below it, a failure is logged and
    // does not fail the finalize: the card is already charged.
    await completeReferralForOrder(admin, {
      orderId: order.id,
      userId: order.user_id,
      cardToken: input.token?.token ?? null,
    })

    // The stock the checkout held becomes a sale, once, in one statement.
    //
    // Idempotent through `consumed_at` on the reservation rather than through
    // the order's status, which is why a replayed webhook decrements nothing.
    // It is deliberately NOT allowed to fail the finalize: the card has already
    // been charged, and refusing to complete an order over a stock counter
    // would leave a customer paid-for and empty-handed. A failure here is
    // logged and the level is wrong by that order, which is recoverable; the
    // alternative is not.
    const { error: stockError } = await admin.rpc('consume_order_stock', {
      p_order_id: order.id,
    })
    if (stockError) {
      log.error('finalize.stock_consume_failed', {
        orderId: order.id,
        reason: stockError.message,
      })
    }

    // The authoritative purchase event, sent from the server at the moment the
    // order actually became paid.
    //
    // A browser-side purchase is fired on the thank-you page and is lost every
    // time a shopper closes the tab on the provider's redirect, every time an
    // ad blocker eats it - which most Israeli shoppers run - and every time the
    // payment settles by webhook minutes after the browser gave up. Each of
    // those is a real sale reported as nothing, to platforms that set ad spend
    // against the number they were given.
    //
    // Deduplicated on the ORDER ID, which both vendors key on, so a purchase
    // seen by a browser that DID survive is still counted once.
    await reportPurchase(admin, order.id, order.user_id, items as OrderItemRow[])

    if (input.token) {
      await admin.from('payment_tokens').insert({
        profile_id: order.user_id,
        cardcom_token: input.token.token,
        last_4: input.token.last4,
        card_brand: input.token.brand,
        expiry_month: input.token.expiryMonth,
        expiry_year: input.token.expiryYear,
        // A token is only chargeable on the terminal that minted it, so the
        // saved card is useless without knowing which account that was.
        cardcom_account_id: cardcomAccountId,
      })
    }

    const { error: orderError } = await admin
      .from('orders')
      .update({ status: 'paid', paid_at: now.toISOString() })
      .eq('id', order.id)
      .is('paid_at', null)
    if (orderError) {
      return { ok: false, error: `order update failed: ${orderError.message}`, code: 'INTERNAL' }
    }

    await admin.from('audit_log').insert({
      actor_id: null,
      actor_role: null,
      action: 'status_change',
      entity_type: 'order',
      entity_id: order.id,
      changes: { status: { from: 'pending', to: 'paid' } } as unknown as Json,
      metadata: { source: 'checkout_finalize', payment_id: input.paymentId } as unknown as Json,
    })

    // Best-effort: the purchased cart is done; leftovers confuse the header badge.
    await admin.from('carts').update({ items: [] }).eq('profile_id', order.user_id)

    // Closes the abandoned-cart loop (098). The function has been in the hosted
    // project since the growth migrations landed and nothing had ever called
    // it, so `v_abandoned_cart_recovery` reported a recovery rate of 0% no
    // matter how many nudged shoppers came back and paid. It is the order that
    // proves the recovery, so this is the only place that knows.
    //
    // Called before the cart is considered settled and wrapped so it cannot
    // throw: attribution is a reporting fact, and the card is already charged.
    // It attributes at most one open nudge inside a 72 hour window, and a
    // replayed finalize re-runs it as a no-op because the row it would claim
    // already has a recovered_order_id.
    try {
      await admin.rpc(
        'fn_attribute_cart_recovery' as never,
        {
          p_order_id: order.id,
          p_user_id: order.user_id,
        } as never,
      )
    } catch {
      // Deliberately silent, for the reason above.
    }

    // The money journal (migration 094). Deliberately the last thing done and
    // deliberately incapable of throwing: the card is already charged and the
    // order already closed, and no journal entry is worth failing a finalize
    // that succeeded. While 094 is unapplied this logs once and records
    // nothing, and the system behaves exactly as it did before the journal
    // existed.
    await recordSettlementEvents(
      admin,
      buildChargeSettledEvents(order.id, items as SettledLine[], now, {
        paymentId: input.paymentId,
        cardcomAccountId,
      }),
    )

    // The gift, if this order was bought for somebody else (108).
    //
    // Read in its OWN select rather than added to the order read at the top of
    // this function, and that is not caution for its own sake: a column the
    // database does not have raises 42703 and takes down the WHOLE statement,
    // so naming three new columns up there would mean a finalize that cannot
    // read the order at all on any database where 108 has not been applied -
    // with the card already charged. Exactly the failure 106 documents for
    // `payments.refund_of_payment_id`. Here the worst case is no gift.
    //
    // It also keeps swallowing a TRANSIENT error, and that is the boundary this
    // file runs on: `paid_at` was stamped above, so a throw from here on buys
    // an alarm and nothing else - the dead-letter replay re-enters finalize,
    // hits `if (order.paid_at) return replay`, and never reaches this line
    // again. Everything before the stamp throws because a replay can fix it;
    // everything after it stays best-effort because a replay cannot.
    const { data: giftRow } = await admin
      .from('orders')
      .select('gift_recipient_name, gift_recipient_email, gift_message')
      .eq('id', order.id)
      .maybeSingle()
    const intent = giftRow ? readGiftIntent(giftRow as Record<string, string | null>) : null
    if (intent) {
      const { data: buyer } = await admin
        .from('profiles')
        .select('full_name')
        .eq('id', order.user_id)
        .maybeSingle()
      await sendOrderGifts(admin, {
        orderId: order.id,
        buyerUserId: order.user_id,
        intent,
        buyerName: (buyer as { full_name: string | null } | null)?.full_name ?? null,
        now,
      })
    }

    // The tax document, queued and attempted at once. Before the email on
    // purpose: the email carries a link to the invoice, and an invoice issued
    // after it has gone out is an invoice the customer is told about and cannot
    // open. Neither call can throw - the queue row is the durability, the cron
    // is the retry - so this cannot fail a finalize whose card has been charged.
    const queued = await enqueueOrderInvoice(admin, {
      orderId: order.id,
      paymentId: input.paymentId,
    })
    if (queued.enqueued && !queued.replay) {
      await issueQueuedInvoice(admin, queued.invoiceId)
    }

    // The customer's coupons, by email. Last, and incapable of failing the
    // finalize for the same reason the journal above cannot: the card is
    // charged and the order is closed. Deduplicated by the provider on the
    // order id, so a replayed finalize does not send twice.
    await sendVoucherEmail(admin, {
      orderId: order.id,
      userId: order.user_id,
      siteUrl: (process.env.NEXT_PUBLIC_APP_URL ?? 'https://kenyonexpress.co.il').replace(
        /\/+$/,
        '',
      ),
    })

    return { ok: true, replay: false, orderId: order.id }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'finalize failed'
    // The customer's card has already been charged by the time this function is
    // called at all, so a throw anywhere in it is money taken against an order
    // that never closed.
    //
    // The try now opens at the first read rather than after the payment row,
    // and that is what keeps the contract "finalizeOrder never throws" true
    // once those reads stopped discarding their errors. The webhook alarms on
    // any `ok: false` and prints the reason; a throw escaping to the route
    // instead would answer 500 with no alarm raised at all.
    capturePaymentError(error, {
      stage: 'finalize_order',
      // `input.orderId`, not `order.id`: the order read is inside this try now,
      // so a failure there reaches here with no `order` bound at all.
      orderId: input.orderId,
      paymentId: input.paymentId,
      detail: { message },
    })
    return { ok: false, error: message, code: 'INTERNAL' }
  }
}
