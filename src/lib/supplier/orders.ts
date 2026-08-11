import { type Agorot, agorot } from '@/lib/money'
import { supplierDueAgorot } from '@/lib/supplier/dashboard'

/**
 * The physical order queue, as a supplier reads it.
 *
 * `dashboard.ts` answers "what has this business earned"; `products.ts` answers
 * "what would one unit earn"; this answers the third and separate question a
 * supplier actually opens the portal for: **which orders are sitting here
 * waiting for me to do something about them.** It groups `order_items` back
 * into the orders a customer placed, because a customer who bought three items
 * from one shop is one package to pack, not three.
 *
 * Read-only by construction. ARCHITECTURE-SUPPLIER-PORTAL.md section 5.2 puts
 * every fulfillment transition behind a Server Action with the service role or
 * a SECURITY DEFINER function, and section 3.2 gives `orders` and `order_items`
 * a SELECT policy and nothing else. There is deliberately no state-changing
 * export in this module: a supplier-view build that could flip `item_status`
 * from the client would be routing around the audit trail that section 5.2
 * exists to write.
 *
 * MONEY. Nothing here multiplies anything. Every figure is a snapshot column
 * that checkout already computed and froze onto the line (section 0.3), and
 * recomputing from live `products.platform_percent` is explicitly forbidden by
 * section 12.4 because the live percent may have moved since the sale. Supplier
 * due is not computed here at all -- it is delegated to `supplierDueAgorot`,
 * which is the one place allowed to state that arithmetic, and
 * `no-escrow-in-supplier-due.test.ts` is why.
 */

export type SupplierFulfillmentState = 'awaiting' | 'in_progress' | 'done' | 'closed'

export type SupplierOrderLine = {
  orderItemId: string
  orderId: string
  productName: string
  productType: 'coupon' | 'physical' | 'other'
  quantity: number
  itemStatus: string
  settlementStatus: string | null
  /** Null means the line predates the snapshot, not zero commission. */
  platformPercent: number | null
  faceValueAgorot: Agorot
  platformFeeAgorot: Agorot
  /** What the platform owes the supplier for this line. Coupons: always 0. */
  supplierDueAgorot: Agorot
  /** Coupon lines only: what the customer still owes at the till. */
  tillBalanceAgorot: Agorot
}

export type SupplierOrder = {
  orderId: string
  /** Last 6 of the uuid, upper-cased. What a person can read down a phone. */
  orderRef: string
  orderStatus: string
  paidAt: string | null
  lines: SupplierOrderLine[]
  itemCount: number
  fulfillment: SupplierFulfillmentState
  faceValueAgorot: Agorot
  platformFeeAgorot: Agorot
  supplierDueAgorot: Agorot
  tillBalanceAgorot: Agorot
}

export type SupplierOrdersSummary = {
  orders: number
  /** Orders with at least one line nobody has shipped or handed over yet. */
  awaiting: number
  /** Sum owed by the platform. Physical residual only; see section 0.2. */
  supplierDueAgorot: Agorot
  /** Sum still to be taken over the counter on unredeemed coupon lines. */
  tillBalanceAgorot: Agorot
}

/**
 * `order_items.item_status` collapsed to the four states a queue needs.
 *
 * `pending` and `issued` are one bucket on purpose. They are different facts
 * about the platform -- a voucher has or has not been minted -- and the same
 * fact about the shop: nothing has left it.
 */
export function fulfillmentOf(itemStatus: string | null | undefined): SupplierFulfillmentState {
  switch (itemStatus) {
    case 'shipped':
      return 'in_progress'
    case 'delivered':
      return 'done'
    case 'cancelled':
    case 'refunded':
      return 'closed'
    default:
      return 'awaiting'
  }
}

/**
 * An order is only as finished as its least finished live line.
 *
 * Cancelled and refunded lines are skipped rather than ranked. A two-line order
 * where one line was refunded and the other is still unpacked is an order the
 * shop must still act on, and ranking `closed` against `awaiting` in either
 * direction gets that wrong: taking the max hides the open line, taking the min
 * reports the whole order dead. An order whose every line is closed is closed.
 */
export function orderFulfillment(lines: SupplierOrderLine[]): SupplierFulfillmentState {
  const live = lines.map((line) => fulfillmentOf(line.itemStatus)).filter((s) => s !== 'closed')
  if (live.length === 0) return 'closed'
  if (live.includes('awaiting')) return 'awaiting'
  if (live.includes('in_progress')) return 'in_progress'
  return 'done'
}

/**
 * Snapshot columns are integer agorot by contract, and `agorot()` throws when
 * they are not. Pre-070 rows predate that contract (section 12.4), and one
 * legacy line carrying a fraction must not take down a page showing twenty
 * good ones -- the same reason `productEconomics` refuses to throw. Rounding
 * happens here, at the boundary, so nothing downstream sees a float.
 */
function toAgorot(value: number | null | undefined): Agorot {
  if (typeof value !== 'number' || !Number.isFinite(value)) return agorot(0)
  return agorot(Math.max(0, Math.round(value)))
}

/** Coupons never owe the supplier platform money; the till balance is theirs. */
export function lineFrom(input: {
  orderItemId: string
  orderId: string
  productName: string
  productType: 'coupon' | 'physical' | 'other'
  quantity: number
  itemStatus: string
  settlementStatus: string | null
  platformPercent: number | null
  faceValueAgorot: number | null
  commissionAgorot: number | null
  supplierImmediateAgorot: number | null
  balanceDueAgorot: number | null
}): SupplierOrderLine {
  const isCoupon = input.productType === 'coupon'

  return {
    orderItemId: input.orderItemId,
    orderId: input.orderId,
    productName: input.productName,
    productType: input.productType,
    quantity: input.quantity,
    itemStatus: input.itemStatus,
    settlementStatus: input.settlementStatus,
    platformPercent: input.platformPercent,
    faceValueAgorot: toAgorot(input.faceValueAgorot),
    platformFeeAgorot: toAgorot(input.commissionAgorot),
    supplierDueAgorot: toAgorot(
      supplierDueAgorot({ supplierImmediateAgorot: input.supplierImmediateAgorot ?? 0 }),
    ),
    // A redeemed coupon has already been collected over the counter, so it is
    // no longer money the shop is waiting for. Leaving it in the total made the
    // dashboard's outstanding balance grow forever and never fall.
    tillBalanceAgorot:
      isCoupon && input.settlementStatus !== 'redeemed'
        ? toAgorot(input.balanceDueAgorot)
        : agorot(0),
  }
}

/**
 * Group lines into orders, newest paid first.
 *
 * Insertion order decides ties rather than a second sort key: the query already
 * returns rows newest-first, and re-sorting equal `paid_at` values by anything
 * else would shuffle the list between two renders of identical data.
 */
export function groupSupplierOrders(
  lines: SupplierOrderLine[],
  meta: Map<string, { orderStatus: string; paidAt: string | null }>,
): SupplierOrder[] {
  const byOrder = new Map<string, SupplierOrderLine[]>()
  for (const line of lines) {
    const bucket = byOrder.get(line.orderId)
    if (bucket) bucket.push(line)
    else byOrder.set(line.orderId, [line])
  }

  const orders: SupplierOrder[] = []
  for (const [orderId, orderLines] of byOrder) {
    const info = meta.get(orderId)
    let faceValue = 0
    let platformFee = 0
    let supplierDue = 0
    let tillBalance = 0
    let itemCount = 0

    for (const line of orderLines) {
      faceValue += line.faceValueAgorot
      platformFee += line.platformFeeAgorot
      supplierDue += line.supplierDueAgorot
      tillBalance += line.tillBalanceAgorot
      itemCount += Math.max(0, line.quantity)
    }

    orders.push({
      orderId,
      orderRef: orderId.replace(/-/g, '').slice(-6).toUpperCase(),
      orderStatus: info?.orderStatus ?? 'paid',
      paidAt: info?.paidAt ?? null,
      lines: orderLines,
      itemCount,
      fulfillment: orderFulfillment(orderLines),
      faceValueAgorot: agorot(faceValue),
      platformFeeAgorot: agorot(platformFee),
      supplierDueAgorot: agorot(supplierDue),
      tillBalanceAgorot: agorot(tillBalance),
    })
  }

  return orders.sort((a, b) => {
    if (a.paidAt === b.paidAt) return 0
    if (a.paidAt === null) return 1
    if (b.paidAt === null) return -1
    return b.paidAt.localeCompare(a.paidAt)
  })
}

export function summarizeSupplierOrders(orders: SupplierOrder[]): SupplierOrdersSummary {
  let awaiting = 0
  let supplierDue = 0
  let tillBalance = 0

  for (const order of orders) {
    if (order.fulfillment === 'awaiting') awaiting += 1
    supplierDue += order.supplierDueAgorot
    tillBalance += order.tillBalanceAgorot
  }

  return {
    orders: orders.length,
    awaiting,
    supplierDueAgorot: agorot(supplierDue),
    tillBalanceAgorot: agorot(tillBalance),
  }
}

export const FULFILLMENT_LABEL_HE: Record<SupplierFulfillmentState, string> = {
  awaiting: 'ממתין לטיפול',
  in_progress: 'נשלח',
  done: 'הושלם',
  closed: 'סגור',
}

export const FULFILLMENT_TONE: Record<SupplierFulfillmentState, 'warn' | 'info' | 'ok' | 'muted'> =
  {
    awaiting: 'warn',
    in_progress: 'info',
    done: 'ok',
    closed: 'muted',
  }

export const ITEM_STATUS_LABEL_HE: Record<string, string> = {
  pending: 'ממתין',
  issued: 'הונפק',
  shipped: 'נשלח',
  delivered: 'נמסר',
  cancelled: 'בוטל',
  refunded: 'זוכה',
}
