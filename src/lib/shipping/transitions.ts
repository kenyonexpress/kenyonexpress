/**
 * The fulfillment state machine for PHYSICAL order lines. Pure.
 *
 * The enum is the deployed one -- order_item_status: pending / issued /
 * shipped / delivered / cancelled / refunded -- and this module claims only
 * the slice fulfilment owns:
 *
 *   pending -> shipped -> delivered
 *
 * Everything else belongs to other machines: `issued` is the coupon path,
 * `cancelled`/`refunded` are the payment flow's verdicts, and none of them is
 * reachable from here. Production has NO item_status trigger (measured
 * 2026-09-02), so this module plus the audited server action that calls it IS
 * the enforcement, per ARCHITECTURE-SUPPLIER-PORTAL.md 5.2.
 *
 * The order must be paid-or-later before a line ships: shipping an unpaid
 * order hands goods to someone who has not paid, and shipping a refunded one
 * hands them to someone who has been paid BACK.
 */

export type ItemStatus = 'pending' | 'issued' | 'shipped' | 'delivered' | 'cancelled' | 'refunded'

export const PAID_OR_LATER = [
  'paid',
  'partially_fulfilled',
  'fulfilled',
  'platform_settled',
] as const

export type ShippingVerb = 'ship' | 'deliver'

export interface TransitionInput {
  verb: ShippingVerb
  productType: string
  itemStatus: ItemStatus | string
  orderStatus: string
}

export type TransitionVerdict =
  | { ok: true; nextStatus: 'shipped' | 'delivered' }
  | { ok: false; reason: string }

export function planTransition(input: TransitionInput): TransitionVerdict {
  if (input.productType !== 'physical') {
    return { ok: false, reason: 'רק שורות מוצר פיזי נשלחות; קופון ממומש בסריקה.' }
  }
  if (!(PAID_OR_LATER as readonly string[]).includes(input.orderStatus)) {
    return { ok: false, reason: 'ההזמנה עוד לא שולמה (או שכבר בוטלה/הוחזרה) — אין מה לשלוח.' }
  }
  if (input.verb === 'ship') {
    return input.itemStatus === 'pending'
      ? { ok: true, nextStatus: 'shipped' }
      : { ok: false, reason: `אי אפשר לשלוח שורה במצב "${input.itemStatus}".` }
  }
  return input.itemStatus === 'shipped'
    ? { ok: true, nextStatus: 'delivered' }
    : { ok: false, reason: `אי אפשר לסמן כנמסר שורה במצב "${input.itemStatus}".` }
}
