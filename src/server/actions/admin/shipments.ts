'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { requireSection } from '@/lib/admin/rbac'
import { withActionContext } from '@/lib/observability/action-context'
import { isCarrierId } from '@/lib/shipping/carrier-registry'
import { createAdminClient } from '@/lib/supabase/admin'
import { createShipmentForOrder } from '@/server/shipping/shipments'
import { type ShipmentRow, refreshShipmentRow } from '@/server/shipping/tracking-poll'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

/**
 * The admin's two carrier moves (STEP 43): create a label for an order, and
 * ask the carrier about a shipment now instead of waiting for the hourly
 * poll. Both are orders:write, both audited by the modules they call.
 */

const uuid = z.string().uuid()
const MISSING_TABLE = new Set(['42P01', 'PGRST205'])

export type CreateLabelState =
  | {
      ok: true
      trackingNumber: string
      shipmentId: string | null
      labelUrl: string | null
      linesShipped: number
      stored: boolean
      notified: boolean
      providerKind: 'mock' | 'http'
    }
  | { ok: false; error: string }

async function runCreateShipmentLabel(
  rawOrderId: unknown,
  rawCarrierId: unknown,
  rawServiceCode: unknown,
): Promise<CreateLabelState> {
  const session = await requireSection('orders', 'write')
  const orderId = uuid.safeParse(rawOrderId)
  if (!orderId.success) return { ok: false, error: 'הזמנה לא תקינה.' }
  if (!isCarrierId(rawCarrierId)) return { ok: false, error: 'חברת משלוחים לא מוכרת.' }
  const serviceCode =
    typeof rawServiceCode === 'string' && rawServiceCode.trim() !== ''
      ? rawServiceCode.trim().slice(0, 40)
      : null

  const admin = createAdminClient()
  const result = await createShipmentForOrder(admin, {
    orderId: orderId.data,
    carrierId: rawCarrierId,
    serviceCode,
    actorId: session.userId,
    actorRole: session.role,
  })
  if (!result.ok) return { ok: false, error: result.error }

  revalidatePath(`/admin/orders/${orderId.data}`)
  revalidatePath('/admin/orders')
  return {
    ok: true,
    trackingNumber: result.trackingNumber,
    shipmentId: result.shipmentId,
    labelUrl: result.labelUrl,
    linesShipped: result.linesShipped,
    stored: result.stored,
    notified: result.notified,
    providerKind: result.providerKind,
  }
}

export async function createShipmentLabel(
  orderId: unknown,
  carrierId: unknown,
  serviceCode: unknown,
): Promise<CreateLabelState> {
  return withActionContext('admin.shipments.create_label', () =>
    runCreateShipmentLabel(orderId, carrierId, serviceCode),
  )
}

export type RefreshTrackingState =
  | { ok: true; status: string | null; changed: boolean; deliveredLines: number }
  | { ok: false; error: string }

async function runRefreshShipmentTracking(rawShipmentId: unknown): Promise<RefreshTrackingState> {
  const session = await requireSection('orders', 'write')
  const shipmentId = uuid.safeParse(rawShipmentId)
  if (!shipmentId.success) return { ok: false, error: 'משלוח לא תקין.' }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('shipments' as never)
    .select('id, order_id, carrier_id, tracking_number, status, order_item_ids, events')
    .eq('id', shipmentId.data)
    .maybeSingle()
  if (error) {
    return {
      ok: false,
      error: MISSING_TABLE.has(error.code ?? '')
        ? 'טבלת המשלוחים עוד לא קיימת (מיגרציה 258 טרם הוחלה).'
        : 'קריאת המשלוח נכשלה.',
    }
  }
  if (!data) return { ok: false, error: 'המשלוח לא נמצא.' }
  const row = data as unknown as ShipmentRow
  const outcome = await refreshShipmentRow(admin, row)
  if (!outcome.ok) {
    return { ok: false, error: 'חברת המשלוחים לא ענתה. ננסה שוב בסבב הבא.' }
  }
  // The label path audits inside createShipmentForOrder; a manual refresh is
  // its own admin act and is recorded here when it changed something.
  if (outcome.changed) {
    await writeAuditLog({
      actorId: session.userId,
      actorRole: session.role,
      action: 'status_change',
      entityType: 'shipments',
      entityId: row.id,
      changes: { status: { from: row.status, to: outcome.status } },
      metadata: { source: 'manual_refresh', delivered_lines: outcome.deliveredLines },
    })
  }
  revalidatePath(`/admin/orders/${row.order_id}`)
  return {
    ok: true,
    status: outcome.status,
    changed: outcome.changed,
    deliveredLines: outcome.deliveredLines,
  }
}

export async function refreshShipmentTracking(shipmentId: unknown): Promise<RefreshTrackingState> {
  return withActionContext('admin.shipments.refresh_tracking', () =>
    runRefreshShipmentTracking(shipmentId),
  )
}
