import { log } from '@/lib/observability/log'
import {
  type CarrierId,
  carrierEntry,
  carrierService,
  isCarrierId,
} from '@/lib/shipping/carrier-registry'
import type { TrackingEvent, TrackingStatus } from '@/lib/shipping/providers/types'
import { TRACKING_LABELS_HE } from '@/lib/shipping/tracking'
import type { createAdminClient } from '@/lib/supabase/admin'

/**
 * Staff-facing read of an order's shipments (STEP 43), service role behind
 * the orders:read gate the page already passed. Tolerates the missing table
 * (258 pending) by answering `available: false`, so the order page renders
 * the same before and after the migration with one extra block after.
 */

type AdminClient = ReturnType<typeof createAdminClient>

const MISSING_TABLE = new Set(['42P01', 'PGRST205'])

export interface AdminShipmentView {
  id: string
  carrierId: CarrierId | null
  carrierLabel: string
  serviceLabel: string
  providerKind: string
  status: string
  statusLabel: string
  trackingNumber: string
  labelUrl: string | null
  /** The courier's cost to the platform, agorot; null when the carrier did not say. */
  carrierCostAgorot: number | null
  weightGrams: number
  pieces: number
  lastPolledAt: string | null
  estimatedDelivery: string | null
  events: TrackingEvent[]
  createdAt: string
}

interface Row {
  id: string
  carrier_id: string
  service_code: string
  provider_kind: string
  status: string
  tracking_number: string
  label_url: string | null
  carrier_cost_agorot: number | string | null
  weight_grams: number
  pieces: number
  last_polled_at: string | null
  estimated_delivery: string | null
  events: TrackingEvent[] | null
  created_at: string
}

export async function listOrderShipments(
  admin: AdminClient,
  orderId: string,
): Promise<{ available: boolean; shipments: AdminShipmentView[] }> {
  const { data, error } = await admin
    .from('shipments' as never)
    .select(
      'id, carrier_id, service_code, provider_kind, status, tracking_number, label_url, carrier_cost_agorot, weight_grams, pieces, last_polled_at, estimated_delivery, events, created_at',
    )
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
  if (error) {
    if (!MISSING_TABLE.has(error.code ?? '')) {
      log.warn('shipments.admin_read_failed', { orderId, reason: error.message })
    }
    return { available: false, shipments: [] }
  }
  const shipments = ((data ?? []) as unknown as Row[]).map((row): AdminShipmentView => {
    const carrierId = isCarrierId(row.carrier_id) ? row.carrier_id : null
    const cost = row.carrier_cost_agorot === null ? null : Number(row.carrier_cost_agorot)
    return {
      id: row.id,
      carrierId,
      carrierLabel: carrierId ? carrierEntry(carrierId).label : row.carrier_id,
      serviceLabel: carrierId
        ? carrierService(carrierId, row.service_code).label
        : row.service_code,
      providerKind: row.provider_kind,
      status: row.status,
      statusLabel:
        (TRACKING_LABELS_HE as Record<string, string>)[row.status as TrackingStatus] ??
        (row.status === 'cancelled' ? 'בוטל' : row.status),
      trackingNumber: row.tracking_number,
      labelUrl: row.label_url,
      carrierCostAgorot: cost !== null && Number.isInteger(cost) ? cost : null,
      weightGrams: row.weight_grams,
      pieces: row.pieces,
      lastPolledAt: row.last_polled_at,
      estimatedDelivery: row.estimated_delivery,
      events: Array.isArray(row.events) ? row.events : [],
      createdAt: row.created_at,
    }
  })
  return { available: true, shipments }
}
