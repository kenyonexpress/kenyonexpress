'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { requireAdminSession } from '@/lib/admin/rbac'
import { agorot, agorotToIls, ilsToAgorot } from '@/lib/commerce/money'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { capturePaymentError } from '@/lib/observability/sentry'
import { readAmountAgorot, resolvePaymentMoneySchema } from '@/lib/payments/payment-money-columns'
import { createAdminClient } from '@/lib/supabase/admin'
import { type RefundRecordAdmin, recordRefund } from '@/server/payments/refund-record'
import { planWalletCredit, walletRefundGround } from '@/server/payments/refund-wallet'

/**
 * The wallet half of the refund pipeline, which existed as a tested module with
 * no caller.
 *
 * MEASURED on 2026-09-07: `planWalletCredit`, `walletRefundGround` and
 * `WALLET_REFUND_TRANSITIONS` were imported by exactly one file, their own test.
 * `fn_wallet_transfer` was called from `finalize.ts` for cashback and for
 * spending, and never for a refund. `refunds.destination` has existed since 148
 * with a `wallet` value nothing could ever write. So the brief's "wallet
 * immediate OR original payment method" had one instrument wired and the other
 * one drafted.
 *
 * WHAT THIS IS FOR, and it is narrower than `refundOrder`. A wallet credit is
 * the instrument for value that has already been consumed -- a voucher redeemed
 * at the counter, or one that expired -- and for a goodwill refund past the
 * statutory window. `refundOrder` refuses the consumed case with
 * MANUAL_RESOLUTION precisely because pulling the card money back would take
 * back value the customer received; this is the manual resolution it was
 * pointing at. `chooseRefundInstrument` is the rule, written once, in
 * `server/domain/orders/refund-instrument.ts`.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: it does not move the order, the line or the
 * voucher out of the state it is in. A redeemed voucher stays redeemed --
 * `redeemed` is terminal in the settlement machine and in the voucher machine,
 * and it is terminal because it is TRUE: the customer ate the meal. Rewriting
 * that history to make a goodwill credit look like a cancellation would put a
 * lie in the record the supplier is paid against. The money movement is the
 * wallet entry and the `refunds` row; the order's own history is untouched.
 */

export type WalletRefundOutcome =
  | {
      ok: true
      /** True when this exact credit had already been made; nothing moved twice. */
      replay: boolean
      orderId: string
      creditedIls: number
    }
  | {
      ok: false
      error: string
      code: 'NOT_FOUND' | 'STATE_INVALID' | 'FORBIDDEN' | 'GUEST_ORDER' | 'INTERNAL'
    }

export type WalletRefundInput = {
  orderId: string
  reason: string
  isDefectClaim?: boolean
  /** Absent means the whole charge. */
  partialAmountIls?: number
  now?: Date
}

/**
 * The house account a goodwill credit is funded from.
 *
 * `platform:adjustments` and not `platform:cashback_reserve`: the two are
 * separate house accounts in production for the reason they should stay
 * separate, which is that a cashback reserve is a marketing cost and a refund
 * adjustment is not, and a report that cannot tell them apart cannot price
 * either. It exists already (read off `wallet_accounts` on 2026-09-07,
 * `user_id` null, balance 0); a house account is allowed to go negative by
 * `wallet_accounts_user_balance_floor`, which is what lets it fund a credit
 * without being topped up first.
 */
const ADJUSTMENTS_ACCOUNT_CODE = 'platform:adjustments'

type WalletEntryProbe = { id: string } | null

async function runRefundOrderToWallet(input: WalletRefundInput): Promise<WalletRefundOutcome> {
  let session: Awaited<ReturnType<typeof requireAdminSession>>
  try {
    session = await requireAdminSession()
  } catch {
    return { ok: false, error: 'אין הרשאה', code: 'FORBIDDEN' }
  }

  const admin = createAdminClient()
  const now = input.now ?? new Date()

  // `error` is named on every read in this file, and the reason is the whole
  // shape of the money path: a PostgREST query never rejects, it resolves with
  // `{ data: null, error }`, so a destructure that takes only `data` turns a
  // failed read into "there is no such order" and a failed replay probe into
  // "this has not been credited yet". The second one credits twice.
  const { data: order, error: orderError } = await admin
    .from('orders')
    .select('id, status, user_id')
    .eq('id', input.orderId)
    .maybeSingle()
  if (orderError) {
    log.error('refund.wallet_order_read_failed', {
      order_id: input.orderId,
      reason: orderError.message,
    })
    return { ok: false, error: 'קריאת ההזמנה נכשלה', code: 'INTERNAL' }
  }
  if (!order) return { ok: false, error: 'הזמנה לא נמצאה', code: 'NOT_FOUND' }

  // A guest order has no wallet to credit and inventing one would put the money
  // somewhere nobody can reach. Refused here as well as inside
  // `planWalletCredit`, because the message an admin needs is different from a
  // planner refusal code.
  const userId = typeof order.user_id === 'string' ? order.user_id : null
  if (!userId) {
    return {
      ok: false,
      error: 'הזמנת אורח: אין ארנק לזכות. יש לזכות לאמצעי התשלום המקורי',
      code: 'GUEST_ORDER',
    }
  }

  // Same probe as every other money-path call site: the hosted project is
  // pre-059 and carries `amount_ils`, and naming `amount_agorot` raises 42703
  // for the whole select.
  const money = await resolvePaymentMoneySchema((column) =>
    admin
      .from('payments')
      .select(column)
      .limit(0)
      .then(({ error }) => ({ error })),
  )

  const { data: payment, error: paymentError } = await admin
    .from('payments')
    .select(`id, ${money.amountColumn}, status`)
    .eq('order_id', order.id)
    .eq('kind', 'charge')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<Record<string, unknown>>()
  if (paymentError) {
    log.error('refund.wallet_payment_read_failed', {
      order_id: order.id,
      reason: paymentError.message,
    })
    return { ok: false, error: 'קריאת התשלום נכשלה', code: 'INTERNAL' }
  }
  if (!payment) return { ok: false, error: 'לא נמצא תשלום לזיכוי', code: 'NOT_FOUND' }

  const chargedAgorot = readAmountAgorot(money, payment)
  if (chargedAgorot === null) {
    return { ok: false, error: 'לתשלום אין סכום קריא', code: 'STATE_INVALID' }
  }

  const requestedAgorot =
    input.partialAmountIls !== undefined
      ? ilsToAgorot(input.partialAmountIls.toFixed(2))
      : chargedAgorot
  if (requestedAgorot > chargedAgorot) {
    return { ok: false, error: 'סכום הזיכוי גדול מהחיוב', code: 'STATE_INVALID' }
  }

  const plan = planWalletCredit({
    orderId: order.id,
    userId,
    refundAmountAgorot: requestedAgorot,
    // A wallet credit never carries a cancellation fee. `planWalletCredit`
    // refuses a non-zero one rather than zeroing it, and 148's
    // `refunds_wallet_has_no_fee` says the same thing in the database.
    cancellationFeeAgorot: 0,
    // The admin pressing the button IS the decision, so the machine starts from
    // `approved`. A customer-filed request would sit in `requested` until
    // somebody moved it; nothing files those yet.
    fromState: 'approved',
  })
  if (!plan.ok) {
    const message =
      plan.reason === 'guest_order_has_no_wallet'
        ? 'הזמנת אורח: אין ארנק לזכות'
        : plan.reason === 'amount_not_positive'
          ? 'סכום הזיכוי הוא אפס'
          : plan.reason === 'fee_on_wallet_refund'
            ? 'זיכוי לארנק אינו נושא דמי ביטול'
            : 'המעבר אינו חוקי במכונת המצבים של הזיכוי'
    return { ok: false, error: message, code: 'STATE_INVALID' }
  }

  // REPLAY IS DETECTED BEFORE THE TRANSFER, not inferred after it.
  // `fn_wallet_transfer` is idempotent on `wallet_entries.idempotency_key` and
  // returns the EXISTING entry id when the key is already there, which is
  // indistinguishable from a fresh transfer at the call site. Without this read
  // a second click would write a second `refunds` row against one credit, and
  // the statutory record would say the customer was refunded twice.
  const { data: existingEntry, error: probeError } = await admin
    .from('wallet_entries')
    .select('id')
    .eq('idempotency_key', plan.idempotencyKey)
    .maybeSingle<WalletEntryProbe>()
  if (probeError) {
    // A failed probe is not "no previous credit". Refuse: an admin retrying
    // after a transient read failure is cheap, and a second credit is not
    // recoverable without taking money back out of a customer's wallet.
    log.error('refund.wallet_replay_probe_failed', {
      order_id: order.id,
      reason: probeError.message,
    })
    return { ok: false, error: 'בדיקת הכפילות נכשלה. נסה שוב', code: 'INTERNAL' }
  }
  if (existingEntry) {
    return { ok: true, replay: true, orderId: order.id, creditedIls: 0 }
  }

  const [userAccount, houseAccount] = await Promise.all([
    getOrCreateUserWalletAccount(admin, userId),
    admin
      .from('wallet_accounts')
      .select('id')
      .eq('code', ADJUSTMENTS_ACCOUNT_CODE)
      .maybeSingle<{ id: string } | null>()
      .then(({ data }) => data),
  ])
  if (!userAccount || !houseAccount) {
    // Refuse rather than improvise. Creating the house account here would put a
    // ledger account into existence as a side effect of a refund, and the wrong
    // half of a double entry is worse than no entry.
    log.error('refund.wallet_accounts_missing', {
      order_id: order.id,
      user_account: Boolean(userAccount),
      house_account: Boolean(houseAccount),
    })
    return { ok: false, error: 'חשבונות הארנק חסרים', code: 'INTERNAL' }
  }

  // A LIVE VOUCHER MUST NOT SURVIVE THE MONEY GOING BACK.
  //
  // This module's own header says a wallet credit is the instrument for value
  // ALREADY CONSUMED - a voucher redeemed at the counter, or one that expired -
  // and that it moves no voucher out of the state it is in. Both sentences are
  // right about the case they describe and neither was ever enforced, so the
  // case they do not describe was reachable from the admin screen: an order
  // whose vouchers are still `issued`. The button is deliberately NOT gated on
  // `refundBlockers`, which is what makes it reachable on any order at all.
  //
  // The customer is then credited the coupon price into their wallet AND still
  // holds a scannable coupon. `redeem_voucher` would burn it, the business
  // would hand over the goods and collect only the balance, and the platform
  // would have returned the money it kept against value a supplier delivered.
  // That is a double dip, and no constraint anywhere refuses it: the voucher
  // machine's own REFUND edge exists for exactly this and nothing drove it.
  //
  // The rule is the CARD path's rule, not a new one. `planRefund` voids every
  // still-issued voucher on the order for any refund, partial included
  // (server/domain/orders/refund.ts, `voucherRefunds`), and a wallet credit
  // that voided differently would be drift between two instruments that answer
  // the same question. `.eq('status', 'issued')` is what keeps the header's
  // promise: a redeemed voucher matches nothing and stays redeemed, because it
  // is true that the customer ate the meal. Same for expired and cancelled.
  //
  // BEFORE the transfer, and refusing on a write failure, because the two
  // orderings fail differently. Void-then-credit can leave a dead coupon with
  // no credit, which the admin sees immediately and which a retry heals - the
  // second run matches no `issued` row and credits. Credit-then-void can leave
  // a credited customer holding a live coupon, which nobody sees until it is
  // spent and which no retry repairs.
  const { error: voucherVoidError } = await admin
    .from('vouchers')
    .update({ status: 'refunded', refunded_at: now.toISOString(), status_reason: input.reason })
    .eq('order_id', order.id)
    .eq('status', 'issued')
  if (voucherVoidError) {
    log.error('refund.wallet_voucher_void_failed', {
      order_id: order.id,
      reason: voucherVoidError.message,
    })
    return {
      ok: false,
      error: 'ביטול השוברים של ההזמנה נכשל, ולכן לא בוצע זיכוי. נסה שוב',
      code: 'INTERNAL',
    }
  }

  const { error: transferError } = await admin.rpc('fn_wallet_transfer', {
    p_debit_account: houseAccount.id,
    p_credit_account: userAccount.id,
    p_amount_ils: plan.amountIls,
    p_reason: 'refund_to_wallet',
    p_idempotency: plan.idempotencyKey,
    p_order_id: order.id,
  })
  if (transferError) {
    capturePaymentError(new Error(transferError.message), {
      stage: 'refund_wallet_transfer',
      orderId: order.id,
    })
    return { ok: false, error: 'הזיכוי לארנק נכשל', code: 'INTERNAL' }
  }

  // Everything below this line runs AFTER the money has moved, and every one of
  // them is best effort for that reason: a failure here must not read as "the
  // refund failed", because a retry would attempt a second credit. The
  // idempotency key makes that retry harmless, and the log line is what says a
  // record is missing.
  const { error: recordError } = await recordRefund(admin as unknown as RefundRecordAdmin, {
    orderId: order.id,
    paymentId: String(payment.id),
    state: 'completed',
    ground: walletRefundGround({ isDefectClaim: input.isDefectClaim }),
    requestedAgorot,
    grantedAgorot: plan.amountAgorot,
    cancellationFeeAgorot: 0,
    cancelOnly: false,
    reasonHe: input.reason,
    at: now,
    destination: 'wallet',
  })
  if (recordError) {
    log.error('refund.wallet_record_not_written', { order_id: order.id, reason: recordError })
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'manual_override',
    entityType: 'orders',
    entityId: order.id,
    metadata: {
      kind: 'refund_to_wallet',
      credited_agorot: plan.amountAgorot,
      reason: input.reason,
      ground: walletRefundGround({ isDefectClaim: input.isDefectClaim }),
    },
  })

  return {
    ok: true,
    replay: false,
    orderId: order.id,
    creditedIls: agorotToIls(agorot(plan.amountAgorot)),
  }
}

type WalletAccountReader = {
  from: (table: 'wallet_accounts') => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        maybeSingle: <T>() => Promise<{ data: T; error: unknown }>
      }
    }
    insert: (row: { user_id: string }) => {
      select: (columns: string) => { maybeSingle: <T>() => Promise<{ data: T; error: unknown }> }
    }
  }
}

/**
 * The customer's wallet account, created on first use.
 *
 * Deliberately the same shape as `finalize.ts`'s private copy rather than an
 * import of it: that one is bound to finalize's `AdminClient` type and its
 * `orFail` logging, and exporting it would drag the whole finalize module into
 * the refund path. The behaviour that matters is identical, including the
 * re-read after a losing insert race.
 */
async function getOrCreateUserWalletAccount(
  admin: unknown,
  userId: string,
): Promise<{ id: string } | null> {
  const client = admin as WalletAccountReader
  const existing = await client
    .from('wallet_accounts')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle<{ id: string } | null>()
  if (existing.data) return existing.data

  const created = await client
    .from('wallet_accounts')
    .insert({ user_id: userId })
    .select('id')
    .maybeSingle<{ id: string } | null>()
  if (created.data) return created.data

  // 23505 on `wallet_accounts_user_id_key`: somebody else created it between
  // the read and the insert. The re-read is the handler.
  const reread = await client
    .from('wallet_accounts')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle<{ id: string } | null>()
  return reread.data ?? null
}

export async function refundOrderToWallet(input: WalletRefundInput): Promise<WalletRefundOutcome> {
  return withActionContext('order.refund_to_wallet', () => runRefundOrderToWallet(input))
}
