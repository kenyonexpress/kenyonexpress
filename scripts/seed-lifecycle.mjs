#!/usr/bin/env node
/**
 * Emits the SQL that seeds an order, a payment and a voucher in EVERY state the
 * database allows. The dataset, and every measurement behind it, is in
 * `scripts/seed/lifecycle-data.mjs`.
 *
 * WHY IT EMITS SQL AND WRITES NOTHING, which is the same answer
 * `seed-catalogue.mjs` gives: the `SUPABASE_SECRET_KEY` in `.env.local` is not
 * this project's key and the hosted project answers "Invalid API key" to every
 * request made with it. The path that works from here is MCP, which speaks SQL.
 *
 * AND THE OTHER HALF OF THAT ANSWER: the only database reachable from this
 * checkout IS production. This seed writes orders, payments and vouchers - money
 * rows - so a script that could execute would be a script that could put eight
 * fake orders in the live ledger. It prints, and a human decides where that goes.
 * `scripts/seed-target-guard.mjs` exists for the seed that does connect; this one
 * needs no guard because it holds no connection.
 *
 * WHAT THE FIRST DRAFT GOT WRONG, AND ONLY A PROBE COULD HAVE TOLD IT. It listed
 * `subtotal_ils_agorot`, `total_ils_agorot`, `unit_price_ils_agorot`,
 * `total_price_ils_agorot`, `supplier_payout_ils_agorot` and `amount_ils_agorot`
 * among the columns it inserts, because they are in the table. Postgres answered
 * `428C9: cannot insert a non-DEFAULT value into column "subtotal_ils_agorot"`:
 * on `orders`, `order_items` and `payments` **all twelve `*_agorot` columns are
 * GENERATED** from the numeric ILS column beside them - `(round(x * 100))::bigint`
 * - so the numeric column is the input and the integer is derived. `vouchers` is
 * the exception and its agorot columns are real, which is what a newer table
 * written agorot-first looks like.
 *
 * Usage:
 *   node scripts/seed-lifecycle.mjs             # dry run: what it would write
 *   node scripts/seed-lifecycle.mjs --sql       # the idempotent insert block
 *   node scripts/seed-lifecycle.mjs --clean-sql # remove exactly what it created
 */

import {
  DEPENDS_ON,
  MONEY,
  ORDERS,
  PAYMENTS,
  VOUCHERS,
  itemIdFor,
  seededIds,
} from './seed/lifecycle-data.mjs'

const args = new Set(process.argv.slice(2))

/** Single quotes doubled. Every value here is ours, but a seed is still SQL. */
function q(value) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return `'${String(value).replace(/'/g, "''")}'`
}

/** Agorot to the numeric ILS the legacy columns still carry. */
const ils = (agorot) => (agorot / 100).toFixed(2)

const ago = (days) => `now() - interval '${days} days'`
const ahead = (days) =>
  days >= 0 ? `now() + interval '${days} days'` : `now() - interval '${-days} days'`

function orderRow(order) {
  const money =
    order.item.kind === 'coupon' ? MONEY.COUPON.onlineAgorot : MONEY.PHYSICAL.totalAgorot
  return `  (${[
    q(order.id),
    'v_customer',
    `${q(order.status)}::order_status`,
    ils(money),
    '0',
    '0',
    ils(money),
    q('ILS'),
    order.paidAt ? ago(order.createdDaysAgo) : 'NULL',
    ago(order.createdDaysAgo),
    q(`[seed-lifecycle] ${order.note}`),
  ].join(', ')})`
}

function itemRow(order) {
  const coupon = order.item.kind === 'coupon'
  const money = coupon ? MONEY.COUPON : MONEY.PHYSICAL
  const total = coupon ? money.onlineAgorot : money.totalAgorot
  // The coupon path pays the supplier nothing online: the platform keeps the
  // online price and the supplier takes the balance in cash at the counter.
  const payoutAgorot = coupon ? 0 : total - Math.round((total * money.commissionPercent) / 100)
  return `  (${[
    q(itemIdFor(order.id)),
    q(order.id),
    q(coupon ? DEPENDS_ON.couponProduct : DEPENDS_ON.physicalProduct),
    `${q(coupon ? 'coupon' : 'physical')}::product_type`,
    q(DEPENDS_ON.supplier),
    '1',
    ils(total),
    ils(total),
    q(10),
    ils(payoutAgorot),
    `${q(order.item.status)}::order_item_status`,
    `${q(order.item.settlement)}::settlement_status`,
    coupon ? q(MONEY.COUPON.platformPercent) : q(10),
    coupon ? q(100 - MONEY.COUPON.platformPercent) : q(90),
    coupon ? MONEY.COUPON.faceAgorot : 'NULL',
    coupon ? MONEY.COUPON.onlineAgorot : 'NULL',
    coupon ? MONEY.COUPON.balanceAgorot : 'NULL',
    order.item.status === 'shipped' || order.item.status === 'delivered'
      ? ago(order.createdDaysAgo - 1)
      : 'NULL',
    order.item.status === 'delivered' ? ago(order.createdDaysAgo - 2) : 'NULL',
  ].join(', ')})`
}

function paymentRow(payment) {
  return `  (${[
    q(payment.id),
    q(payment.orderId),
    `${q(payment.kind)}::payment_kind`,
    `${q(payment.status)}::payment_status`,
    ils(payment.amountAgorot),
    q('ILS'),
    q(`seed-lifecycle:${payment.id}`),
    payment.status === 'succeeded' || payment.status === 'platform_settled' ? 'now()' : 'NULL',
    payment.status === 'failed' ? 'now()' : 'NULL',
    payment.status === 'failed' ? q('999') : 'NULL',
    payment.status === 'failed' ? q('כרטיס נדחה על ידי המנפיק') : 'NULL',
    payment.refundOf ? q(payment.refundOf) : 'NULL',
  ].join(', ')})`
}

function voucherRow(voucher) {
  const order = ORDERS.find((candidate) => candidate.id === voucher.orderId)
  if (!order) throw new Error(`voucher ${voucher.id} names an order this seed does not create`)
  return `  (${[
    q(voucher.id),
    q(voucher.code),
    q(`seed-lifecycle:${voucher.code}`),
    q('v1'),
    q(voucher.orderId),
    q(itemIdFor(voucher.orderId)),
    q(DEPENDS_ON.couponProduct),
    q(DEPENDS_ON.supplier),
    'v_customer',
    `${q(voucher.status)}::voucher_status`,
    MONEY.COUPON.faceAgorot,
    MONEY.COUPON.onlineAgorot,
    MONEY.COUPON.balanceAgorot,
    q(MONEY.COUPON.platformPercent),
    // offer_valid_until must not precede expires_at (vouchers_expires_within_offer).
    ahead(Math.max(voucher.expiresInDays, 0) + 30),
    ahead(voucher.expiresInDays),
    ago(order.createdDaysAgo),
    voucher.redeemed ? ago(1) : 'NULL',
    voucher.redeemed ? q(DEPENDS_ON.supplier) : 'NULL',
    voucher.redeemed ? 'v_member' : 'NULL',
    voucher.redeemed ? MONEY.COUPON.balanceAgorot : 'NULL',
    voucher.status === 'cancelled' ? ago(order.createdDaysAgo) : 'NULL',
    voucher.status === 'refunded' ? ago(order.createdDaysAgo) : 'NULL',
    q(`[seed-lifecycle] ${voucher.status}`),
  ].join(', ')})`
}

export function buildSql() {
  return `-- Generated by scripts/seed-lifecycle.mjs. Do not edit by hand.
--
-- Orders, payments and vouchers in every state, on top of the fixtures
-- scripts/seed-test-data.mjs creates. ON CONFLICT DO NOTHING throughout: every
-- status guard on these tables is BEFORE UPDATE, so a DO UPDATE re-run would be
-- judged as a status transition and could be refused. Re-running this changes
-- nothing. To change a value, run --clean-sql first.
DO $seed$
DECLARE
  v_customer uuid;
  v_member   uuid;
BEGIN
  SELECT id INTO v_customer FROM auth.users WHERE email = ${q(DEPENDS_ON.customerEmail)};
  SELECT id INTO v_member   FROM auth.users WHERE email = ${q(DEPENDS_ON.supplierMemberEmail)};

  IF v_customer IS NULL OR v_member IS NULL THEN
    RAISE EXCEPTION 'run scripts/seed-test-data.mjs first: the fixture users do not exist here';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = ${q(DEPENDS_ON.couponProduct)}) THEN
    RAISE EXCEPTION 'the fixture coupon product is missing; scripts/seed-test-data.mjs creates it';
  END IF;

  INSERT INTO public.orders (
    id, user_id, status, subtotal_ils, discount_ils, cashback_applied_ils, total_ils,
    currency, paid_at, created_at, notes
  ) VALUES
${ORDERS.map(orderRow).join(',\n')}
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.order_items (
    id, order_id, product_id, product_type, supplier_id, quantity,
    unit_price_ils, total_price_ils, commission_percent, supplier_payout_ils,
    item_status, settlement_status, platform_percent, supplier_split_percent,
    face_value_agorot, paid_on_site_agorot, balance_due_agorot,
    shipped_at, delivered_at
  ) VALUES
${ORDERS.map(itemRow).join(',\n')}
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.payments (
    id, order_id, kind, status, amount_ils, currency, idempotency_key,
    succeeded_at, failed_at, failure_code, failure_message, refund_of_payment_id
  ) VALUES
${PAYMENTS.map(paymentRow).join(',\n')}
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.vouchers (
    id, code, qr_payload, qr_key_id, order_id, order_item_id, product_id, supplier_id,
    user_id, status, face_value_agorot, coupon_price_agorot, remaining_amount_due_agorot,
    platform_percent, offer_valid_until, expires_at, issued_at,
    redeemed_at, redeemed_by_supplier_id, redeemed_by_user_id, redeemed_amount_collected_agorot,
    cancelled_at, refunded_at, status_reason
  ) VALUES
${VOUCHERS.map(voucherRow).join(',\n')}
  ON CONFLICT (id) DO NOTHING;
END
$seed$;
`
}

export function buildCleanSql() {
  const ids = seededIds()
  const list = (values) => values.map((value) => q(value)).join(', ')
  return `-- Generated by scripts/seed-lifecycle.mjs --clean-sql.
-- Deletes exactly the rows the seed creates, children first.
BEGIN;
DELETE FROM public.vouchers    WHERE id IN (${list(ids.vouchers)});
DELETE FROM public.payments    WHERE id IN (${list(ids.payments)});
DELETE FROM public.order_items WHERE id IN (${list(ids.orderItems)});
DELETE FROM public.orders      WHERE id IN (${list(ids.orders)});
COMMIT;
`
}

function summary() {
  const byOrderStatus = new Map()
  for (const order of ORDERS)
    byOrderStatus.set(order.status, (byOrderStatus.get(order.status) ?? 0) + 1)
  const lines = [
    'seed-lifecycle: dry run. Nothing was written and this script holds no connection.',
    '',
    `  orders      ${ORDERS.length}   ${[...byOrderStatus].map(([k, v]) => `${k}${v > 1 ? `x${v}` : ''}`).join(', ')}`,
    `  order_items ${ORDERS.length}   one per order`,
    `  payments    ${PAYMENTS.length}   ${PAYMENTS.map((p) => p.status).join(', ')}`,
    `  vouchers    ${VOUCHERS.length}   ${VOUCHERS.map((v) => v.status).join(', ')}`,
    '',
    '  depends on scripts/seed-test-data.mjs having run: the fixture users and the',
    '  coupon product. The SQL raises rather than inserting if they are absent.',
    '',
    '  --sql        the idempotent block',
    '  --clean-sql  remove exactly these rows',
  ]
  return lines.join('\n')
}

// Only when run as a script, so the test can import the builders.
if (process.argv[1]?.endsWith('seed-lifecycle.mjs')) {
  if (args.has('--sql')) console.log(buildSql())
  else if (args.has('--clean-sql')) console.log(buildCleanSql())
  else console.log(summary())
}
