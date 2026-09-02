'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { requireSection } from '@/lib/admin/rbac'
import { withActionContext } from '@/lib/observability/action-context'
import { type ShippingVerb, planTransition } from '@/lib/shipping/transitions'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

/**
 * Fulfillment transitions for physical order lines, per
 * ARCHITECTURE-SUPPLIER-PORTAL.md 5.2: an audited Server Action is the ONLY
 * write path (production has no item_status trigger, so this file is the
 * enforcement). The verdict comes from the pure machine in
 * lib/shipping/transitions.ts; the UPDATE re-checks the from-state in its
 * WHERE so two admins racing on the same line cannot double-fire.
 *
 * carrier/tracking_number ship in pending/155. Until it applies those columns
 * do not exist (42703), so the write retries without them and the caller is
 * told the tracking was not stored -- the status transition itself must not
 * be held hostage by a pending migration.
 *
 * No email yet, deliberately: 'order_shipped' enters
 * notification_outbox_kind_check in 155, and enqueueing before that 23514s
 * (see src/lib/email/outbox-kinds.test.ts, the three-way agreement).
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
    .select('id, item_status, product_type, order_id, orders!inner(status)')
    .eq('id', itemId)
    .maybeSingle()
  if (readError || !item) return { ok: false, error: 'השורה לא נמצאה.' }

  const orderStatus = (item.orders as unknown as { status: string }).status
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

  revalidatePath(`/admin/orders/${item.order_id}`)
  return {
    ok: true,
    trackingStored,
    ...(Object.keys(tracking).length > 0 && !trackingStored
      ? { error: 'הסטטוס עודכן, אך המוביל/מעקב לא נשמרו — מיגרציה 155 טרם הוחלה.' }
      : {}),
  }
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
