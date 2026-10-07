import { log } from '@/lib/observability/log'
import { type CarrierId, isCarrierId } from '@/lib/shipping/carrier-registry'
import { type ShippingEnv, loadShippingEnv } from '@/lib/shipping/env'
import { getCarrierProvider } from '@/lib/shipping/providers'
import type { CarrierProvider, TrackingEvent, TrackingStatus } from '@/lib/shipping/providers/types'
import { isActiveTrackingStatus, mergeTrackingEvents } from '@/lib/shipping/tracking'
import { planTransition } from '@/lib/shipping/transitions'
import type { createAdminClient } from '@/lib/supabase/admin'
import {
  enqueueDeliveredNotification,
  orderIsDelivered,
} from '@/server/orders/delivered-notification'

/**
 * The tracking poller. Asks each carrier about every shipment that is not
 * final, merges the answer into the row, and when the carrier says delivered
 * moves the covered lines through the same `deliver` transition the admin
 * buttons use, so the order folds to delivered and the customer gets the
 * delivery mail from the existing enqueuer.
 *
 * Idempotent per run: a shipment polled twice merges the same events once
 * (dedupe on at+status), and a line already delivered is skipped by the
 * `item_status = 'shipped'` barrier. A carrier failure marks the row polled
 * (so one dead courier does not pin the queue) and moves on.
 *
 * Without 258 there is no table and the run reports `skipped: 'table_missing'`
 * with a 200: the cron is live before the migration, and that is the shape
 * every cron here has when its table is still pending.
 */

type AdminClient = ReturnType<typeof createAdminClient>

const MISSING_TABLE = new Set(['42P01', 'PGRST205'])
const FINAL_STATUSES = ['delivered', 'returned', 'cancelled']

export interface ShipmentRow {
  id: string
  order_id: string
  carrier_id: string
  tracking_number: string
  status: string
  order_item_ids: string[] | null
  events: TrackingEvent[] | null
}

export interface PollSummary {
  polled: number
  updated: number
  delivered: number
  failed: number
  skipped: 'table_missing' | null
}

export interface PollDeps {
  env?: ShippingEnv
  providerFor?: (carrierId: CarrierId) => CarrierProvider
  now?: () => Date
}

export async function readActiveShipments(
  admin: AdminClient,
  limit: number,
): Promise<{ rows: ShipmentRow[]; missing: boolean }> {
  const { data, error } = await admin
    .from('shipments' as never)
    .select('id, order_id, carrier_id, tracking_number, status, order_item_ids, events')
    .not('status', 'in', `(${FINAL_STATUSES.join(',')})`)
    .order('last_polled_at', { ascending: true, nullsFirst: true })
    .limit(limit)
  if (error) {
    if (MISSING_TABLE.has(error.code ?? '')) return { rows: [], missing: true }
    log.error('shipments.poll_read_failed', { reason: error.message })
    return { rows: [], missing: false }
  }
  return { rows: (data ?? []) as unknown as ShipmentRow[], missing: false }
}

/**
 * Marks the shipment's shipped lines delivered when the order allows it, then
 * lets the order-level fold decide about the mail. Returns how many lines moved.
 */
export async function deliverShipmentLines(
  admin: AdminClient,
  shipment: Pick<ShipmentRow, 'order_id' | 'order_item_ids'>,
  nowIso: string,
): Promise<number> {
  const lineIds = shipment.order_item_ids ?? []
  if (lineIds.length === 0) return 0

  const { data: orderData, error: orderError } = await admin
    .from('orders')
    .select('id, status, user_id, address_id')
    .eq('id', shipment.order_id)
    .maybeSingle()
  if (orderError || !orderData) return 0
  const order = orderData as {
    id: string
    status: string
    user_id: string | null
    address_id: string | null
  }

  const verdict = planTransition({
    verb: 'deliver',
    productType: 'physical',
    itemStatus: 'shipped',
    orderStatus: order.status,
  })
  if (!verdict.ok) {
    log.warn('shipments.deliver_refused', { orderId: order.id, reason: verdict.reason })
    return 0
  }

  const { data: moved, error } = await admin
    .from('order_items')
    .update({ item_status: 'delivered', delivered_at: nowIso, fulfilled_at: nowIso } as never)
    .in('id', lineIds)
    .eq('item_status', 'shipped')
    .select('id')
  if (error) {
    log.error('shipments.deliver_failed', { orderId: order.id, reason: error.message })
    return 0
  }
  const count = ((moved ?? []) as { id: string }[]).length
  if (count === 0) return 0

  const { data: lines, error: linesError } = await admin
    .from('order_items')
    .select('product_type, item_status, tracking_number, carrier')
    .eq('order_id', order.id)
  if (linesError || !lines) return count
  const shaped = (
    lines as {
      product_type: string
      item_status: string
      tracking_number: string | null
      carrier: string | null
    }[]
  ).map((l) => ({
    productType: l.product_type === 'coupon' ? ('coupon' as const) : ('physical' as const),
    itemStatus: l.item_status,
    trackingNumber: l.tracking_number,
    carrier: l.carrier,
  }))
  if (orderIsDelivered(shaped)) {
    await enqueueDeliveredNotification(admin, {
      orderId: order.id,
      userId: order.user_id,
      addressId: order.address_id,
      itemCount: shaped.length,
    })
  }
  return count
}

export interface RefreshOutcome {
  ok: boolean
  status: TrackingStatus | null
  changed: boolean
  deliveredLines: number
  error?: string
}

/** Polls one shipment row and writes what the carrier said. */
export async function refreshShipmentRow(
  admin: AdminClient,
  row: ShipmentRow,
  deps: PollDeps = {},
): Promise<RefreshOutcome> {
  const env = deps.env ?? loadShippingEnv()
  const providerFor = deps.providerFor ?? ((id: CarrierId) => getCarrierProvider(id, env))
  const now = (deps.now ?? (() => new Date()))()
  const nowIso = now.toISOString()

  if (!isCarrierId(row.carrier_id)) {
    return { ok: false, status: null, changed: false, deliveredLines: 0, error: 'unknown carrier' }
  }
  const provider = providerFor(row.carrier_id)

  let result: Awaited<ReturnType<CarrierProvider['track']>>
  try {
    result = await provider.track(row.tracking_number)
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown'
    log.warn('shipments.track_failed', { shipmentId: row.id, carrier: row.carrier_id, reason })
    await admin
      .from('shipments' as never)
      .update({ last_polled_at: nowIso } as never)
      .eq('id', row.id)
    return { ok: false, status: null, changed: false, deliveredLines: 0, error: reason }
  }

  const events = mergeTrackingEvents(row.events ?? [], result.events)
  const changed = result.status !== row.status || events.length !== (row.events ?? []).length
  const delivered = result.status === 'delivered'
  const { error: updateError } = await admin
    .from('shipments' as never)
    .update({
      status: result.status,
      events,
      estimated_delivery: result.estimatedDelivery,
      provider_response: result.raw ?? null,
      last_polled_at: nowIso,
      ...(changed ? { last_event_at: events[0]?.at ?? nowIso } : {}),
      ...(delivered ? { delivered_at: events[0]?.at ?? nowIso } : {}),
    } as never)
    .eq('id', row.id)
  if (updateError) {
    log.error('shipments.poll_write_failed', { shipmentId: row.id, reason: updateError.message })
    return {
      ok: false,
      status: result.status,
      changed,
      deliveredLines: 0,
      error: updateError.message,
    }
  }

  let deliveredLines = 0
  if (delivered && row.status !== 'delivered') {
    deliveredLines = await deliverShipmentLines(admin, row, nowIso)
  }
  if (!isActiveTrackingStatus(result.status) && result.status !== 'delivered') {
    log.warn('shipments.final_not_delivered', { shipmentId: row.id, status: result.status })
  }
  return { ok: true, status: result.status, changed, deliveredLines }
}

export async function pollActiveShipments(
  admin: AdminClient,
  options: { limit?: number } & PollDeps = {},
): Promise<PollSummary> {
  const { rows, missing } = await readActiveShipments(admin, options.limit ?? 100)
  const summary: PollSummary = {
    polled: 0,
    updated: 0,
    delivered: 0,
    failed: 0,
    skipped: missing ? 'table_missing' : null,
  }
  for (const row of rows) {
    summary.polled += 1
    const outcome = await refreshShipmentRow(admin, row, options)
    if (!outcome.ok) summary.failed += 1
    else if (outcome.changed) summary.updated += 1
    summary.delivered += outcome.deliveredLines
  }
  return summary
}
