'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { requireSection } from '@/lib/admin/rbac'
import { withActionContext } from '@/lib/observability/action-context'
import { type ShippingVerb, planTransition } from '@/lib/shipping/transitions'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  enqueueDeliveredNotification,
  orderIsDelivered,
} from '@/server/orders/delivered-notification'
import { revalidatePath } from 'next/cache'

/**
 * Fulfillment transitions for physical order lines, per
 * ARCHITECTURE-SUPPLIER-PORTAL.md 5.2: an audited Server Action is the ONLY
 * write path (production has no item_status trigger, so this file is the
 * enforcement). The verdict comes from the pure machine in
 * lib/shipping/transitions.ts; the UPDATE re-checks the from-state in its
 * WHERE so two admins racing on the same line cannot double-fire.
 *
 * carrier/tracking_number arrived with 155, since applied. The 42703 retry
 * below predates that and stays: on a database without the columns the write
 * retries without them and the caller is told the tracking was not stored --
 * the status transition itself must not be held hostage by a schema gap.
 *
 * No SHIPPED email from here, deliberately: `tg_orders_notify_shipped` (183,
 * payload widened by 196) enqueues 'order_shipped' when the ORDER reaches
 * fulfilled, with the tracking numbers of every line. Enqueueing from this
 * per-line action too would mail the customer twice for the same shipment.
 *
 * The DELIVERED email is different (STEP 16): "delivered" is a fold over the
 * lines and no trigger watches it, so after a `deliver` this action re-reads
 * the order's lines and, when `orderIsDelivered` says the last parcel just
 * landed, enqueues `order_delivered` once (deduped on the order id) through
 * server/orders/delivered-notification.ts. The fulfilment board does the
 * same; whichever writer closes the fold sends the mail.
 */

const UNDEFINED_COLUMN = '42703'

export type ShippingActionState = { ok: boolean; error?: string; trackingStored?: boolean }

async function runMarkItem(
  itemId: string,
  verb: ShippingVerb,
  carrier?: string,
  trackingNumber?: string,
): Promise<ShippingActionState> {
  const session = await requireSection('orders', 'write')
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) return { ok: false, error: 'שורה לא תקינה.' }

  const admin = createAdminClient()
  const { data: item, error: readError } = await admin
    .from('order_items')
    .select('id, item_status, product_type, order_id, orders!inner(status, user_id, address_id)')
    .eq('id', itemId)
    .maybeSingle()
  if (readError || !item) return { ok: false, error: 'השורה לא נמצאה.' }

  const parentOrder = item.orders as unknown as {
    status: string
    user_id: string | null
    address_id: string | null
  }
  const orderStatus = parentOrder.status
  const verdict = planTransition({
    verb,
    productType: item.product_type,
    itemStatus: item.item_status,
    orderStatus,
  })
  if (!verdict.ok) return { ok: false, error: verdict.reason }

  const now = new Date().toISOString()
  const stamps =
    verdict.nextStatus === 'shipped'
      ? { shipped_at: now }
      : { delivered_at: now, fulfilled_at: now }
  const tracking =
    verdict.nextStatus === 'shipped'
      ? {
          ...(carrier?.trim() ? { carrier: carrier.trim().slice(0, 120) } : {}),
          ...(trackingNumber?.trim()
            ? { tracking_number: trackingNumber.trim().slice(0, 120) }
            : {}),
        }
      : {}

  let trackingStored = Object.keys(tracking).length > 0
  let { data: updated, error } = await admin
    .from('order_items')
    .update({ item_status: verdict.nextStatus, ...stamps, ...tracking } as never)
    .eq('id', itemId)
    .eq('item_status', item.item_status) // the race barrier
    .select('id')
    .maybeSingle()

  if (error && error.code === UNDEFINED_COLUMN && trackingStored) {
    trackingStored = false
    ;({ data: updated, error } = await admin
      .from('order_items')
      .update({ item_status: verdict.nextStatus, ...stamps } as never)
      .eq('id', itemId)
      .eq('item_status', item.item_status)
      .select('id')
      .maybeSingle())
  }
  if (error) return { ok: false, error: 'העדכון נכשל.' }
  if (!updated) return { ok: false, error: 'השורה השתנתה בינתיים — רענן ונסה שוב.' }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'status_change',
    entityType: 'order_item',
    entityId: itemId,
    changes: { item_status: { from: item.item_status, to: verdict.nextStatus }, ...tracking },
  })

  if (verdict.nextStatus === 'delivered') {
    await notifyIfOrderDelivered(admin, item.order_id, parentOrder.user_id, parentOrder.address_id)
  }

  revalidatePath(`/admin/orders/${item.order_id}`)
  return {
    ok: true,
    trackingStored,
    ...(Object.keys(tracking).length > 0 && !trackingStored
      ? { error: 'הסטטוס עודכן, אך המוביל/מעקב לא נשמרו — מיגרציה 155 טרם הוחלה.' }
      : {}),
  }
}

/**
 * Re-read every line of the order after a delivery and mail the customer if
 * that was the last one. Best-effort: a read that fails, or a queue that
 * refuses, must not undo a status the admin just set; both are logged by the
 * enqueuer or here and the action still reports success.
 */
async function notifyIfOrderDelivered(
  admin: ReturnType<typeof createAdminClient>,
  orderId: string,
  userId: string | null,
  addressId: string | null = null,
): Promise<void> {
  const { data: lines, error } = await admin
    .from('order_items')
    .select('product_type, item_status, tracking_number, carrier')
    .eq('order_id', orderId)
  if (error || !lines) return
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
  if (!orderIsDelivered(shaped)) return
  await enqueueDeliveredNotification(admin, {
    orderId,
    userId,
    addressId,
    itemCount: shaped.length,
  })
}

export async function markItemShipped(
  itemId: string,
  carrier?: string,
  trackingNumber?: string,
): Promise<ShippingActionState> {
  return withActionContext('admin.shipping.ship', () =>
    runMarkItem(itemId, 'ship', carrier, trackingNumber),
  )
}

export async function markItemDelivered(itemId: string): Promise<ShippingActionState> {
  return withActionContext('admin.shipping.deliver', () => runMarkItem(itemId, 'deliver'))
}
