/**
 * One shipping status for a whole order, from its lines.
 *
 * The order list shows a row per order and has no room for a line per
 * parcel, so the physical lines are folded into a single chip: nothing to
 * ship (coupons only), being prepared, on the way, partly delivered, or
 * delivered. `order_items.item_status` is per line and the fold is the only
 * place the rule "an order is delivered when every live physical line is"
 * is written down; the detail page keeps showing every line as it is.
 *
 * Cancelled and refunded lines do not count. An order with one delivered
 * parcel and one refunded line is delivered, not "partly delivered": the
 * customer is not waiting for anything.
 */

export type ShippingSummaryKind = 'none' | 'preparing' | 'shipped' | 'partial' | 'delivered'

export interface ShippingLineLike {
  productType: 'coupon' | 'physical'
  itemStatus: string
  trackingNumber: string | null
  carrier: string | null
}

export interface ShippingSummary {
  kind: ShippingSummaryKind
  /** Chip text, or null when there is nothing to say (coupons only). */
  label: string | null
  tone: 'ok' | 'warn' | 'default'
  /** Live physical lines that carry a tracking number. */
  tracked: { carrier: string | null; trackingNumber: string }[]
}

const LABELS: Record<Exclude<ShippingSummaryKind, 'none'>, string> = {
  preparing: 'בהכנה למשלוח',
  shipped: 'נשלח',
  partial: 'נמסר חלקית',
  delivered: 'נמסר',
}

const TONES: Record<Exclude<ShippingSummaryKind, 'none'>, ShippingSummary['tone']> = {
  preparing: 'default',
  shipped: 'warn',
  partial: 'warn',
  delivered: 'ok',
}

const CLOSED = new Set(['cancelled', 'refunded'])

export function summarizeShipping(lines: readonly ShippingLineLike[]): ShippingSummary {
  const live = lines.filter((l) => l.productType === 'physical' && !CLOSED.has(l.itemStatus))
  const tracked = live
    .filter((l) => typeof l.trackingNumber === 'string' && l.trackingNumber.trim() !== '')
    .map((l) => ({ carrier: l.carrier, trackingNumber: (l.trackingNumber as string).trim() }))

  if (live.length === 0) return { kind: 'none', label: null, tone: 'default', tracked }

  const delivered = live.filter((l) => l.itemStatus === 'delivered').length
  const shipped = live.filter((l) => l.itemStatus === 'shipped').length

  let kind: Exclude<ShippingSummaryKind, 'none'>
  if (delivered === live.length) kind = 'delivered'
  else if (delivered > 0) kind = 'partial'
  else if (shipped > 0) kind = 'shipped'
  else kind = 'preparing'

  return { kind, label: LABELS[kind], tone: TONES[kind], tracked }
}
