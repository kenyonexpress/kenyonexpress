/**
 * The order card on /account/orders (UX19): the pure half.
 *
 * What the card says about an order is decided here and rendered by
 * `components/account/OrderCard`, so the wording is testable without a DOM
 * and the same phrase cannot drift between the collapsed summary, the
 * expanded panel and the toggle. The order's own status chips stay where
 * they were (`orderStatusLabel` / `orderStatusTone` for the money,
 * `summarizeShipping` for the parcel); this module adds the per-line chip,
 * the preview line and the counts.
 */

import type { OrderListLine, OrderSummary } from '@/server/queries/orders'

export type ChipTone = 'ok' | 'warn' | 'dead' | 'default'

export interface LineStatusView {
  label: string
  tone: ChipTone
}

/**
 * The chip on one line inside the open card.
 *
 * A physical line answers from `item_status`, which is what the supplier
 * and the courier move. A coupon line answers only when the money question
 * is closed (redeemed, refunded, cancelled): an open coupon's real state is
 * decided by the clock on the detail page (`couponStatusView`), and a chip
 * here saying "active" about a lapsed one would be the defect that page was
 * written to remove. So it says nothing rather than something stale.
 */
const PHYSICAL_LINE_STATUS: Record<string, LineStatusView> = {
  pending: { label: 'בהכנה', tone: 'default' },
  fulfilled: { label: 'בהכנה למשלוח', tone: 'default' },
  shipped: { label: 'נשלח', tone: 'warn' },
  delivered: { label: 'נמסר', tone: 'ok' },
  cancelled: { label: 'בוטל', tone: 'dead' },
  refunded: { label: 'זוכה', tone: 'dead' },
}

const CLOSED_COUPON_LINE_STATUS: Record<string, LineStatusView> = {
  redeemed: { label: 'מומש', tone: 'ok' },
  refunded: { label: 'זוכה', tone: 'dead' },
  cancelled: { label: 'בוטל', tone: 'dead' },
}

export function lineStatusView(
  line: Pick<OrderListLine, 'productType' | 'itemStatus' | 'settlementStatus'>,
): LineStatusView | null {
  if (line.productType === 'physical') {
    return PHYSICAL_LINE_STATUS[line.itemStatus] ?? null
  }
  return (
    CLOSED_COUPON_LINE_STATUS[line.settlementStatus] ??
    CLOSED_COUPON_LINE_STATUS[line.itemStatus] ??
    null
  )
}

/** "פריט אחד" / "3 פריטים": the unit count, never "1 פריטים". */
export function itemCountPhrase(count: number): string {
  if (count === 1) return 'פריט אחד'
  return `${count} פריטים`
}

/**
 * The collapsed card's one line about what was bought: the first names, a
 * count on a line bought more than once, and "ועוד N" for the rest, so a
 * customer can tell two ₪40 orders apart without opening either.
 */
export function linePreview(lines: readonly OrderListLine[], max = 2): string {
  if (lines.length === 0) return ''
  const shown = lines.slice(0, max).map((line) => {
    const name = line.productName.trim() || 'מוצר'
    return line.quantity > 1 ? `${name} ×${line.quantity}` : name
  })
  const rest = lines.length - shown.length
  return rest > 0 ? `${shown.join(', ')} ועוד ${rest}` : shown.join(', ')
}

/** The toggle's label, by state. The count tells a reader what opens. */
export function toggleLabel(open: boolean, lineCount: number): string {
  if (open) return 'הסתרת הפריטים'
  return lineCount === 1 ? 'הצגת הפריט' : `הצגת הפריטים (${lineCount})`
}

/**
 * The status chips on the card's head: the money's state always, the
 * parcel's when there is one and the order is paid. Same two chips the row
 * had, in the same order, so the list reads "paid · shipped" as before.
 */
export function orderBadges(
  order: Pick<OrderSummary, 'paidAt' | 'shipping'>,
  settlement: { label: string; tone: ChipTone },
): { label: string; tone: ChipTone }[] {
  const chips = [settlement]
  if (order.paidAt && order.shipping.label) {
    chips.push({ label: order.shipping.label, tone: order.shipping.tone })
  }
  return chips
}

/**
 * Whether the card may offer "order again": a paid order with at least one
 * line, and an offer computed for the customer. An unpaid or cancelled
 * order has nothing to repeat; the action re-checks on click anyway.
 */
export function canReorder(order: Pick<OrderSummary, 'paidAt' | 'lines'>): boolean {
  return Boolean(order.paidAt) && order.lines.length > 0
}
