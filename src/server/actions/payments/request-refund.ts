'use server'

import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { readAmountAgorot, resolvePaymentMoneySchema } from '@/lib/payments/payment-money-columns'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import type { RefundLineInput, RefundVoucherInput } from '@/server/domain/orders/refund'
import {
  AUTO_APPROVAL_WINDOW_DAYS,
  type ManualReviewReason,
  RefundRequestRefusal,
  decideRefundRequest,
} from '@/server/domain/orders/refund-request'
import type { SettlementState } from '@/server/domain/orders/state-machine'
import type { RefundGround } from '@/server/payments/refund-record'
import { revalidatePath } from 'next/cache'

/**
 * The customer's cancellation control. The half of migration 131 that was never
 * built.
 *
 * 131 states the contract this file has to meet, in its own comment on the RLS
 * policy: the customer may READ their refunds and may not write the table,
 * "because the notice timestamp has to be the server's clock, not the
 * browser's". So the read of the order happens on the user's session (their RLS
 * decides whether the order is theirs), and the write happens on the admin
 * client because `authenticated` holds SELECT and nothing else.
 *
 * IT MOVES NO MONEY, INCLUDING WHEN IT AUTO-APPROVES. An approved row is an
 * adjudication; the card credit is still `refundOrder` behind
 * `requireAdminSession`. See the module comment on `refund-request.ts` for why
 * that line is drawn where it is.
 *
 * IDEMPOTENT BY THE DATABASE, NOT BY A READ. `refunds_one_open_per_order` is a
 * partial unique index over `state IN ('requested','approved','executing')`, so
 * a double-click races into 23505 rather than into two notices. The pre-check
 * below is there to give a Hebrew answer in the common case; the index is what
 * makes the guarantee.
 */

export type RefundRequestOutcome =
  | {
      ok: true
      refundId: string
      state: 'requested' | 'approved'
      autoApproved: boolean
      /** Empty when auto-approved. For the operator queue, not the customer. */
      manualReviewReasons: ManualReviewReason[]
      messageHe: string
    }
  | {
      ok: false
      error: string
      code:
        | 'UNAUTHENTICATED'
        | 'RATE_LIMITED'
        | 'NOT_FOUND'
        | 'NOT_PAID'
        | 'ALREADY_OPEN'
        | 'NOTHING_REFUNDABLE'
        | 'INTERNAL'
    }

/** The states in which a decided refund still counts against the auto-approval budget. */
const DECIDED_STATES = ['approved', 'executing', 'completed'] as const

async function runRequestOrderRefund(input: {
  orderId: string
  ground: RefundGround
  reasonHe?: string
  now?: Date
}): Promise<RefundRequestOutcome> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, error: 'צריך להתחבר כדי לבטל הזמנה.', code: 'UNAUTHENTICATED' }
  }

  // Five notices an hour is far above any honest use and far below what makes
  // the 23505 race worth exercising deliberately.
  const allowed = await checkRateLimit(`refund-request:${user.id}`, 5, 3600)
  if (!allowed) {
    return { ok: false, error: 'יותר מדי בקשות ביטול. נסה שוב בעוד שעה.', code: 'RATE_LIMITED' }
  }

  const now = input.now ?? new Date()
  const admin = createAdminClient()

  // On the USER client on purpose: `orders` RLS is the ownership check, so a
  // request for someone else's order returns no row rather than relying on this
  // file to remember to compare `user_id`.
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, status, paid_at')
    .eq('id', input.orderId)
    .maybeSingle()
  if (orderError) {
    // Fails in the safe direction on its own (no row reads as NOT_FOUND and
    // refuses), but "not found" and "we could not look" are different answers
    // and the customer deserves the second one.
    log.error('refund_request.order_read_failed', {
      order_id: input.orderId,
      reason: orderError.message,
    })
    return { ok: false, error: 'קריאת ההזמנה נכשלה. נסה שוב.', code: 'INTERNAL' }
  }
  if (!order) {
    return { ok: false, error: 'הזמנה לא נמצאה.', code: 'NOT_FOUND' }
  }
  if (order.status !== 'paid') {
    return {
      ok: false,
      error: 'אפשר לבטל רק הזמנה ששולמה. הזמנה שטרם שולמה פשוט אינה מחייבת אותך.',
      code: 'NOT_PAID',
    }
  }

  // A FAILED READ HERE CREATES A SECOND REFUND. `open` coming back null means
  // "no request is in flight", and a query that never got an answer produces
  // exactly that null. The same shape was fixed in refund-to-wallet.ts on
  // 07.09, where a failed replay probe would have credited a customer twice:
  // refusing costs the customer one retry, and not refusing costs the platform
  // the whole order a second time.
  const { data: open, error: openError } = await admin
    .from('refunds')
    .select('id')
    .eq('order_id', order.id)
    .in('state', ['requested', 'approved', 'executing'])
    .maybeSingle()
  if (openError) {
    log.error('refund_request.open_probe_failed', {
      order_id: order.id,
      reason: openError.message,
    })
    return { ok: false, error: 'בדיקת בקשות קודמות נכשלה. נסה שוב.', code: 'INTERNAL' }
  }
  if (open) {
    return {
      ok: false,
      error: 'כבר קיימת בקשת ביטול פתוחה להזמנה הזו. נחזור אליך עם תשובה.',
      code: 'ALREADY_OPEN',
    }
  }

  // Same probe as `refundOrder`: the hosted project is pre-059 and carries
  // `amount_ils`, so naming `amount_agorot` raises 42703 and takes down the
  // whole select, which then reads as "no charge to cancel".
  const money = await resolvePaymentMoneySchema((column) =>
    admin
      .from('payments')
      .select(column)
      .limit(0)
      .then(({ error }) => ({ error })),
  )

  const { data: payment, error: paymentError } = await admin
    .from('payments')
    .select(`id, ${money.amountColumn}, succeeded_at`)
    .eq('order_id', order.id)
    .eq('kind', 'charge')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<Record<string, unknown>>()
  if (paymentError) {
    log.error('refund_request.payment_read_failed', {
      order_id: order.id,
      reason: paymentError.message,
    })
    return { ok: false, error: 'קריאת החיוב נכשלה. נסה שוב.', code: 'INTERNAL' }
  }
  if (!payment) {
    return { ok: false, error: 'לא נמצא חיוב לביטול בהזמנה הזו.', code: 'NOT_FOUND' }
  }
  const cardChargedAgorot = readAmountAgorot(money, payment)
  if (cardChargedAgorot === null) {
    return { ok: false, error: 'לחיוב אין סכום קריא. פנה לשירות הלקוחות.', code: 'INTERNAL' }
  }

  const { data: items, error: itemsError } = await admin
    .from('order_items')
    .select('id, product_type, settlement_status, supplier_id, supplier_immediate_agorot')
    .eq('order_id', order.id)
  if (itemsError) {
    log.error('refund_request.items_read_failed', {
      order_id: order.id,
      reason: itemsError.message,
    })
    return { ok: false, error: 'קריאת פריטי ההזמנה נכשלה. נסה שוב.', code: 'INTERNAL' }
  }
  if (!items || items.length === 0) {
    return { ok: false, error: 'להזמנה אין פריטים.', code: 'NOTHING_REFUNDABLE' }
  }

  // A FAILED READ HERE HANDS BACK THE MONEY AND LEAVES THE COUPON SCANNABLE.
  // `voucherRows ?? []` below turns a failed query into "this order has no
  // vouchers", the refund plan then finds nothing to void, and the customer
  // keeps a coupon the business will still honour for the balance alone. That
  // is precisely the defect fixed in refund-to-wallet.ts on 07.09, and a
  // discarded error is enough to reintroduce it.
  const { data: voucherRows, error: voucherError } = await admin
    .from('vouchers')
    .select('id, status')
    .eq('order_id', order.id)
  if (voucherError) {
    log.error('refund_request.voucher_read_failed', {
      order_id: order.id,
      reason: voucherError.message,
    })
    return { ok: false, error: 'קריאת השוברים נכשלה. נסה שוב.', code: 'INTERNAL' }
  }

  // The auto-approval budget. `decided_by IS NULL` on a decided row is exactly
  // "no person stood behind this" -- 131 leaves `decided_by` nullable while
  // `refunds_decided_has_decider` requires only `decided_at`, so a machine
  // decision is recordable and, more to the point, countable.
  const cutoff = new Date(now.getTime() - AUTO_APPROVAL_WINDOW_DAYS * 86_400_000).toISOString()
  // A FAILED READ HERE GRANTS MONEY. `priorRows ?? []` counts zero prior
  // auto-approvals, so a customer already at the limit is auto-approved again
  // because a query did not answer. The budget only means anything if failing
  // to read it is treated as "I do not know", not as "none".
  const { data: priorRows, error: priorError } = await admin
    .from('refunds')
    .select('decided_at')
    .eq('requested_by', user.id)
    .is('decided_by', null)
    .in('state', DECIDED_STATES)
    .gte('decided_at', cutoff)
  if (priorError) {
    log.error('refund_request.prior_approvals_read_failed', {
      user_id: user.id,
      reason: priorError.message,
    })
    return { ok: false, error: 'בדיקת מכסת האישורים נכשלה. נסה שוב.', code: 'INTERNAL' }
  }

  const lines: RefundLineInput[] = items.map((i) => ({
    orderItemId: i.id,
    productType: i.product_type as RefundLineInput['productType'],
    settlementStatus: i.settlement_status as SettlementState,
    supplierId: i.supplier_id,
    supplierReleasedAgorot: Number(i.supplier_immediate_agorot ?? 0),
  }))
  const vouchers: RefundVoucherInput[] = (voucherRows ?? []).map((v) => ({
    voucherId: v.id,
    status: v.status,
  }))

  const paidAtSource =
    typeof payment.succeeded_at === 'string' ? payment.succeeded_at : order.paid_at
  const paidAt = typeof paidAtSource === 'string' ? new Date(paidAtSource) : undefined

  let decision: ReturnType<typeof decideRefundRequest>
  try {
    decision = decideRefundRequest({
      cardChargedAgorot,
      paidAt,
      lines,
      vouchers,
      ground: input.ground,
      priorAutoApprovals: (priorRows ?? [])
        .filter((r): r is { decided_at: string } => typeof r.decided_at === 'string')
        .map((r) => ({ decidedAt: new Date(r.decided_at) })),
      now,
    })
  } catch (error) {
    if (error instanceof RefundRequestRefusal) {
      return { ok: false, error: error.messageHe, code: 'NOTHING_REFUNDABLE' }
    }
    throw error
  }

  const { data: inserted, error: insertError } = await admin
    .from('refunds')
    .insert({
      order_id: order.id,
      payment_id: String(payment.id),
      state: decision.state,
      ground: decision.ground,
      destination: decision.destination,
      requested_by: user.id,
      // A decision with no `decided_by` is the machine's. Written only when
      // there IS a decision: `requested` leaves both NULL, which is what the
      // operator queue selects on.
      decided_at: decision.autoApproved ? now.toISOString() : null,
      // Fixed agorot names, unlike `payments`. 131 created this table after
      // 059, so it never carried the shekel columns the probe above exists for.
      requested_agorot: decision.requestedAgorot,
      cancellation_fee_agorot: decision.cancellationFeeAgorot,
      reason_he: input.reasonHe?.trim() || null,
      internal_note:
        decision.manualReviewReasons.length > 0
          ? `manual review: ${decision.manualReviewReasons.join(', ')}`
          : null,
    })
    .select('id')
    .single()

  if (insertError || !inserted) {
    // 23505 is the partial unique index catching a double-click that got past
    // the read above. It is not an error the customer caused and not one they
    // should see as a failure.
    if (insertError?.code === '23505') {
      return {
        ok: false,
        error: 'כבר קיימת בקשת ביטול פתוחה להזמנה הזו. נחזור אליך עם תשובה.',
        code: 'ALREADY_OPEN',
      }
    }
    log.error('refund_request_insert_failed', {
      orderId: order.id,
      code: insertError?.code,
      message: insertError?.message,
    })
    return {
      ok: false,
      error: 'לא הצלחנו לרשום את הבקשה. נסה שוב או פנה לשירות הלקוחות.',
      code: 'INTERNAL',
    }
  }

  log.info('refund_requested', {
    refundId: inserted.id,
    orderId: order.id,
    state: decision.state,
    autoApproved: decision.autoApproved,
    manualReviewReasons: decision.manualReviewReasons,
  })

  revalidatePath(`/account/orders/${order.id}`)
  revalidatePath('/account/orders')

  return {
    ok: true,
    refundId: inserted.id,
    state: decision.state,
    autoApproved: decision.autoApproved,
    manualReviewReasons: decision.manualReviewReasons,
    messageHe: decision.messageHe,
  }
}

/**
 * `now` is DELIBERATELY not part of this signature.
 *
 * Everything a `'use server'` export takes is chosen by the browser. The
 * statutory window, the auto-approval budget and `decided_at` all turn on the
 * clock, so a caller-supplied `now` would let anyone reopen a window that
 * closed months ago. The runner keeps the parameter because its unit tests
 * need a fixed clock; the boundary does not offer it.
 */
export async function requestOrderRefund(input: {
  orderId: string
  ground: RefundGround
  reasonHe?: string
}): Promise<RefundRequestOutcome> {
  return withActionContext('requestOrderRefund', () =>
    runRequestOrderRefund({
      orderId: input.orderId,
      ground: input.ground,
      reasonHe: input.reasonHe,
    }),
  )
}
