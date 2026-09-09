import { type TrackingView, trackingView } from '@/lib/shipping/carriers'
import { estimateDelivery } from '@/lib/shipping/estimate'
import type { DeliveryEstimate } from '@/lib/shipping/estimate'
import { type OrderTimeline, buildOrderTimeline } from '@/lib/shipping/timeline'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * The read behind the public tracking page.
 *
 * THE SELECT LIST IS THE PRIVACY BOUNDARY, SO IT IS SHORT AND EXPLICIT
 *
 * The caller has proved possession of a signed link, not an identity: a link
 * forwarded to a spouse, a flatmate or a WhatsApp group opens this page. So the
 * query asks for delivery facts and nothing else -- no email, no phone, no
 * address, no prices, no commission, no invoice. `select('*')` here would leak
 * the customer's money the first time somebody forwarded the mail, and would do
 * it silently, which is why the columns are listed one by one.
 *
 * Product NAMES are included: "where is my order" is unanswerable without them
 * when an order has three parcels, and the person holding the link was mailed
 * the same names in the shipping notice already.
 *
 * THE SERVICE ROLE IS USED BECAUSE THERE IS NO SESSION TO SCOPE TO
 *
 * The token is the authorization, and it is verified by the caller BEFORE this
 * runs. Passing an unverified id to this function reads somebody's order, so
 * the signature demands a verified id and the page is the only caller.
 */

export interface TrackedLine {
  id: string
  productName: string
  quantity: number
  itemStatus: string
  isPhysical: boolean
  tracking: TrackingView | null
  shippedAt: string | null
  deliveredAt: string | null
}

export interface TrackedOrder {
  id: string
  reference: string
  createdAt: string
  paidAt: string | null
  status: string
  lines: TrackedLine[]
  timeline: OrderTimeline
  estimate: DeliveryEstimate | null
}

interface RawLine {
  id: string
  quantity: number
  item_status: string
  product_type: string
  carrier: string | null
  tracking_number: string | null
  shipped_at: string | null
  delivered_at: string | null
  products: { name_he: string | null } | { name_he: string | null }[] | null
}

function productName(row: RawLine): string {
  const embedded = Array.isArray(row.products) ? (row.products[0] ?? null) : row.products
  return embedded?.name_he?.trim() || 'פריט'
}

/**
 * `orderId` MUST already have been verified against the link's signature.
 * `now` is injected so the estimate is testable.
 */
export async function getTrackedOrder(
  orderId: string,
  now: Date = new Date(),
): Promise<TrackedOrder | null> {
  const admin = createAdminClient()

  const { data: order, error } = await admin
    .from('orders')
    .select('id, status, created_at, paid_at, deleted_at')
    .eq('id', orderId)
    .maybeSingle()
  if (error || !order) return null
  // A soft-deleted order is gone as far as a public link is concerned.
  if (order.deleted_at) return null

  const { data: rows, error: linesError } = await admin
    .from('order_items')
    .select(
      'id, quantity, item_status, product_type, carrier, tracking_number, shipped_at, delivered_at, products(name_he)',
    )
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })

  // A failed read here would otherwise render as "this order has no items",
  // which reads as "we lost your order" -- the page says the link is not
  // working instead, and the caller shows that.
  if (linesError) return null

  const raw = (rows ?? []) as unknown as RawLine[]

  const lines: TrackedLine[] = raw.map((row) => ({
    id: row.id,
    productName: productName(row),
    quantity: row.quantity,
    itemStatus: row.item_status,
    isPhysical: row.product_type === 'physical',
    tracking: trackingView(row.carrier, row.tracking_number),
    shippedAt: row.shipped_at,
    deliveredAt: row.delivered_at,
  }))

  const timeline = buildOrderTimeline({
    orderCreatedAt: order.created_at,
    orderPaidAt: order.paid_at,
    orderStatus: order.status,
    lines: raw.map((row) => ({
      itemStatus: row.item_status,
      productType: row.product_type,
      shippedAt: row.shipped_at,
      deliveredAt: row.delivered_at,
    })),
  })

  return {
    id: order.id,
    reference: order.id.slice(0, 8).toUpperCase(),
    createdAt: order.created_at,
    paidAt: order.paid_at,
    status: order.status,
    lines,
    timeline,
    estimate: estimateDelivery({
      paidAt: order.paid_at,
      delivered: timeline.currentStep === 'delivered',
      now,
    }),
  }
}
