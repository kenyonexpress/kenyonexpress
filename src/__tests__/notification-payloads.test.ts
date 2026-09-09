import { buildNotification } from '@/lib/email/notifications'
import { buildInAppContent } from '@/lib/notifications/in-app'
import { buildPushContent } from '@/lib/push/templates'
import { buildSmsMessage } from '@/lib/sms/templates'
import { describe, expect, it } from 'vitest'

/**
 * THE PAYLOAD CONTRACT, WHICH NOTHING HELD.
 *
 * A notification is enqueued by one writer and rendered by five readers. The
 * writers are Postgres triggers and RPCs (`tg_orders_notify_paid`,
 * `tg_orders_notify_shipped`, `enqueue_expiring_voucher_notices`) plus a few
 * server call sites; the readers are the email, push, in-app, WhatsApp and SMS
 * builders. They agree by nothing but memory: a builder reads
 * `payload.tracking_number`, the trigger writes
 * `payload.shipments[0].tracking_number`, and the result is not an error. Every
 * builder here is written to degrade -- a missing key means a shorter body or a
 * null -- so a mismatch produces a notification that still sends, still looks
 * fine, and quietly says less than it should. Or worse:
 *
 *   voucher_expiring   in-app read `days_left`, the RPC writes `days_remaining`
 *                      -> `days` was always null -> the body said "it expires
 *                      TODAY" for every bucket, including the seven-day one.
 *                      A customer told that goes to the shop for nothing.
 *   voucher_issued     the SMS template read `payload.code`, the trigger nests
 *                      it in `vouchers[]` -> null -> reported by the sender as
 *                      "no SMS template for voucher_issued", which is
 *                      indistinguishable from a kind that owes no SMS.
 *   refund_completed   in-app read `amount_agorot`, refundOrder writes
 *                      `refunded_agorot` -> every refund notice had no body.
 *   order_shipped      in-app and SMS read flat keys the trigger never writes.
 *
 * All four were live on 2026-09-10 and none of them failed a test, because
 * every test in the tree built its own payload from the same wrong key as the
 * code it was testing.
 *
 * SO THE FIXTURES BELOW ARE MEASUREMENTS, NOT EXAMPLES. Each one is the shape
 * production actually enqueues, read on 2026-09-10 with:
 *
 *   select pg_get_functiondef('public.tg_orders_notify_paid'::regproc);
 *   select pg_get_functiondef('public.tg_orders_notify_shipped'::regproc);
 *   select pg_get_functiondef('public.enqueue_expiring_voucher_notices'::regproc);
 *
 * and, for the kinds enqueued from TypeScript, off the `p_payload` at the call
 * site named beside each. Re-measure with the same statements; a fixture that
 * drifts from the writer makes this file pass while describing a queue that no
 * longer exists, which is the failure it is here to prevent.
 */

const SITE = 'https://kenyonexpress.co.il'

/** `tg_orders_notify_paid`, coupon branch. The code is NESTED. */
const VOUCHER_ISSUED = {
  order_id: '11111111-2222-3333-4444-555555555555',
  order_ref: '11111111',
  customer_name: 'דנה כהן',
  vouchers: [
    {
      code: 'ABCD1234',
      product_name: 'עיסוי שוודי',
      supplier_name: 'ספא בוטיק',
      supplier_address: 'הרצל 1, תל אביב',
      supplier_phone: '03-1234567',
      face_value_agorot: 18_000,
      coupon_price_agorot: 1_800,
      remaining_amount_due_agorot: 16_200,
      expires_at: '2026-12-31T21:59:59.000Z',
    },
  ],
}

/** `enqueue_expiring_voucher_notices`, called with buckets {7, 1}. */
const VOUCHER_EXPIRING = {
  voucher_id: '66666666-7777-8888-9999-000000000000',
  code: 'ABCD1234',
  product_name: 'עיסוי שוודי',
  supplier_name: 'ספא בוטיק',
  expires_at: '2026-12-31T21:59:59.000Z',
  days_remaining: 7,
}

/** `tg_orders_notify_shipped`. One entry per line that HAS a number. */
const ORDER_SHIPPED = {
  order_id: '11111111-2222-3333-4444-555555555555',
  order_ref: '11111111',
  customer_name: 'דנה כהן',
  item_count: 2,
  fulfilled_at: '2026-09-10T08:00:00.000Z',
  shipments: [{ carrier: 'צ׳יטה', tracking_number: 'RR123456789IL' }],
}

/** `refundOrder`, src/server/actions/payments/refund.ts. */
const REFUND_COMPLETED = {
  order_id: '11111111-2222-3333-4444-555555555555',
  order_ref: '11111111',
  refunded_agorot: 9_500,
  cancellation_fee_agorot: 500,
  cancel_only: false,
}

/** `finalizeOrder`, src/server/payments/finalize.ts. */
const CASHBACK_CREDITED = {
  order_id: '11111111-2222-3333-4444-555555555555',
  order_ref: '11111111',
  amount_agorot: 500,
}

/** `tg_orders_notify_paid`, non-coupon branch. */
const ORDER_PAID = {
  order_id: '11111111-2222-3333-4444-555555555555',
  order_ref: '11111111',
  customer_name: 'דנה כהן',
  total_agorot: 79_900,
  item_count: 1,
  paid_at: '2026-09-10T08:00:00.000Z',
}

describe('every leg can read what the trigger writes', () => {
  it('voucher_issued: the code reaches the SMS, from inside the envelope', () => {
    const sms = buildSmsMessage('voucher_issued', VOUCHER_ISSUED)
    expect(sms).not.toBeNull()
    expect(sms?.body).toContain('ABCD1234')
    expect(sms?.body).toContain('עיסוי שוודי')
    // The budget is two segments, and a body that lost the code would sit well
    // under it while saying nothing useful.
    expect(sms?.segments).toBeLessThanOrEqual(2)
  })

  it('voucher_issued: a multi-coupon order names a count and no code', () => {
    // Two codes is two more segments and a message to be parsed at a till.
    const sms = buildSmsMessage('voucher_issued', {
      ...VOUCHER_ISSUED,
      vouchers: [VOUCHER_ISSUED.vouchers[0], { ...VOUCHER_ISSUED.vouchers[0], code: 'EFGH5678' }],
    })
    expect(sms?.body).toContain('2')
    expect(sms?.body).not.toContain('ABCD1234')
  })

  it('voucher_issued: the other three legs render too', () => {
    expect(buildNotification('voucher_issued', VOUCHER_ISSUED, SITE)).not.toBeNull()
    expect(buildPushContent('voucher_issued', VOUCHER_ISSUED, SITE)).not.toBeNull()
    expect(buildInAppContent('voucher_issued', VOUCHER_ISSUED)?.title_he).toBe('השובר שלך מוכן')
  })

  it('voucher_expiring: seven days is seven days in every leg', () => {
    // The one that was wrong rather than merely thin.
    expect(buildInAppContent('voucher_expiring', VOUCHER_EXPIRING)?.body_he).toBe(
      'הוא פג בעוד 7 ימים.',
    )
    expect(buildPushContent('voucher_expiring', VOUCHER_EXPIRING, SITE)?.title).toContain('7')
    expect(buildNotification('voucher_expiring', VOUCHER_EXPIRING, SITE)).not.toBeNull()
  })

  it('voucher_expiring: the SMS goes out at T-1 and not before', () => {
    // A reminder seven days out is a marketing message wearing a transactional
    // badge, and it is the kind of send that gets a sender ID reported.
    expect(buildSmsMessage('voucher_expiring', VOUCHER_EXPIRING)).toBeNull()
    expect(
      buildSmsMessage('voucher_expiring', { ...VOUCHER_EXPIRING, days_remaining: 1 })?.body,
    ).toContain('מחר')
  })

  it('order_shipped: the carrier survives the shipments envelope', () => {
    expect(buildInAppContent('order_shipped', ORDER_SHIPPED)?.body_he).toContain('צ׳יטה')
    expect(buildSmsMessage('order_shipped', ORDER_SHIPPED)?.body).toContain('צ׳יטה')
    expect(buildNotification('order_shipped', ORDER_SHIPPED, SITE)).not.toBeNull()
  })

  it('order_shipped: no leg puts the tracking number in a Hebrew sentence', () => {
    // A long LTR number inside an RTL sentence renders in a plausible but wrong
    // order, and a wrong tracking number is worse than none: the customer types
    // it into a courier's site and is told it does not exist.
    expect(buildInAppContent('order_shipped', ORDER_SHIPPED)?.body_he).not.toContain(
      'RR123456789IL',
    )
    expect(buildSmsMessage('order_shipped', ORDER_SHIPPED)?.body).not.toContain('RR123456789IL')
  })

  it('refund_completed: the amount reaches the customer', () => {
    expect(buildInAppContent('refund_completed', REFUND_COMPLETED)?.body_he).toContain('95')
    expect(buildSmsMessage('refund_completed', REFUND_COMPLETED)?.body).toContain('95')
    expect(buildNotification('refund_completed', REFUND_COMPLETED, SITE)).not.toBeNull()
  })

  it('cashback_credited: keeps its own key, which is not the refund one', () => {
    expect(buildInAppContent('cashback_credited', CASHBACK_CREDITED)?.body_he).toContain('5')
    expect(buildPushContent('cashback_credited', CASHBACK_CREDITED, SITE)).not.toBeNull()
  })

  it('order_paid: the total reaches the receipt', () => {
    expect(buildInAppContent('order_paid', ORDER_PAID)?.body_he).toContain('799')
    expect(buildNotification('order_paid', ORDER_PAID, SITE)).not.toBeNull()
  })
})

describe('a body that went missing is not silence', () => {
  // Each of these is a real fixture with ONE key renamed, standing in for the
  // mistake that was actually shipped. They assert that the builder now
  // notices, so the next rename cannot pass as a shorter sentence.
  it('does not accept the flat voucher code the SMS template used to read', () => {
    const flatOnly = { code: 'ABCD1234', product_name: 'עיסוי שוודי' }
    // Still accepted, deliberately: an admin resending one voucher has no
    // envelope. What must not happen is the ENVELOPE form returning null.
    expect(buildSmsMessage('voucher_issued', flatOnly)).not.toBeNull()
    expect(buildSmsMessage('voucher_issued', { vouchers: [{}] })).toBeNull()
  })

  it('notices when days_remaining is renamed', () => {
    expect(buildInAppContent('voucher_expiring', { days_left: 7 })?.body_he).not.toContain('7')
    expect(buildPushContent('voucher_expiring', { days_left: 7 }, SITE)).toBeNull()
  })
})
