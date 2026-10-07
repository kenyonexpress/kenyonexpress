import { log } from '@/lib/observability/log'
import {
  type CarrierId,
  carrierEntry,
  carrierIdFromText,
  carrierService,
  isCarrierId,
} from '@/lib/shipping/carrier-registry'
import { resolveCarrier } from '@/lib/shipping/carriers'
import type { TrackingEvent, TrackingStatus } from '@/lib/shipping/providers/types'
import { TRACKING_LABELS_HE, timelineIndex, trackingTone } from '@/lib/shipping/tracking'
import { createClient } from '@/lib/supabase/server'
import type { OrderLine } from '@/server/queries/orders'

/**
 * The customer's shipments, for the account widget.
 *
 * Read through the SESSION client so 258's policy (rows of orders the user
 * owns) is the filter, not a WHERE this file could get wrong. Until 258 is
 * applied the table does not exist; the read answers `available: false` and
 * the page builds the same shape from the order's own lines
 * (`shipmentsFromLines`), which carry carrier, tracking number, shipped_at
 * and delivered_at today. Two steps instead of four, same widget.
 */

const MISSING_TABLE = new Set(['42P01', 'PGRST205'])

export interface CustomerShipment {
  id: string | null
  orderId: string
  carrierId: CarrierId | null
  carrierLabel: string | null
  serviceLabel: string | null
  trackingNumber: string | null
  trackingUrl: string | null
  status: TrackingStatus | null
  statusLabel: string
  tone: 'ok' | 'warn' | 'default' | 'dead'
  /** 0..3 on the four-step timeline. */
  step: number
  events: TrackingEvent[]
  estimatedDelivery: string | null
  /** True when the row came from `shipments`; false when derived from the lines. */
  live: boolean
}

interface ShipmentRow {
  id: string
  order_id: string
  carrier_id: string
  service_code: string
  status: string
  tracking_number: string
  events: TrackingEvent[] | null
  estimated_delivery: string | null
}

const STATUSES: readonly TrackingStatus[] = [
  'label_created',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'exception',
  'returned',
]

function asStatus(value: string): TrackingStatus | null {
  return (STATUSES as readonly string[]).includes(value) ? (value as TrackingStatus) : null
}

export function shipmentFromRow(row: ShipmentRow): CustomerShipment {
  const carrierId = isCarrierId(row.carrier_id) ? row.carrier_id : null
  const status = asStatus(row.status)
  const entry = carrierId ? carrierEntry(carrierId) : null
  const resolved = resolveCarrier(entry?.legacyCarrierText ?? row.carrier_id, row.tracking_number)
  return {
    id: row.id,
    orderId: row.order_id,
    carrierId,
    carrierLabel: entry?.label ?? resolved?.label ?? null,
    serviceLabel: carrierId ? carrierService(carrierId, row.service_code).label : null,
    trackingNumber: row.tracking_number,
    trackingUrl: resolved?.url ?? null,
    status,
    statusLabel: status ? TRACKING_LABELS_HE[status] : 'בטיפול',
    tone: status ? trackingTone(status) : 'default',
    step: timelineIndex(status),
    events: Array.isArray(row.events) ? row.events : [],
    estimatedDelivery: row.estimated_delivery,
    live: true,
  }
}

/**
 * The fallback: one entry per tracked physical line, or one untracked entry
 * per shipped line, from what `order_items` already holds.
 */
export function shipmentsFromLines(
  orderId: string,
  lines: readonly Pick<
    OrderLine,
    'id' | 'productType' | 'itemStatus' | 'carrier' | 'trackingNumber' | 'shippedAt' | 'deliveredAt'
  >[],
): CustomerShipment[] {
  const out: CustomerShipment[] = []
  const seen = new Set<string>()
  for (const line of lines) {
    if (line.productType !== 'physical') continue
    if (line.itemStatus !== 'shipped' && line.itemStatus !== 'delivered') continue
    const key = line.trackingNumber?.trim() || `line:${line.id}`
    if (seen.has(key)) continue
    seen.add(key)
    const status: TrackingStatus = line.itemStatus === 'delivered' ? 'delivered' : 'in_transit'
    const carrierId = carrierIdFromText(line.carrier)
    const resolved = resolveCarrier(line.carrier, line.trackingNumber)
    const events: TrackingEvent[] = []
    if (line.deliveredAt) {
      events.push({
        at: line.deliveredAt,
        status: 'delivered',
        description: 'נמסר',
        location: null,
      })
    }
    if (line.shippedAt) {
      events.push({ at: line.shippedAt, status: 'in_transit', description: 'נשלח', location: null })
    }
    out.push({
      id: null,
      orderId,
      carrierId,
      carrierLabel: resolved?.label ?? null,
      serviceLabel: null,
      trackingNumber: line.trackingNumber?.trim() || null,
      trackingUrl: resolved?.url ?? null,
      status,
      statusLabel: TRACKING_LABELS_HE[status],
      tone: trackingTone(status),
      step: timelineIndex(status),
      events,
      estimatedDelivery: null,
      live: false,
    })
  }
  return out
}

export async function getMyShipmentsForOrder(
  orderId: string,
): Promise<{ available: boolean; shipments: CustomerShipment[] }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('shipments' as never)
    .select(
      'id, order_id, carrier_id, service_code, status, tracking_number, events, estimated_delivery',
    )
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
  if (error) {
    if (!MISSING_TABLE.has(error.code ?? '')) {
      log.warn('shipments.customer_read_failed', { orderId, reason: error.message })
    }
    return { available: false, shipments: [] }
  }
  return {
    available: true,
    shipments: ((data ?? []) as unknown as ShipmentRow[]).map(shipmentFromRow),
  }
}
