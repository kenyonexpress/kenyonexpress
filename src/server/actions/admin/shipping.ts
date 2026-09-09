'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { requireSection } from '@/lib/admin/rbac'
import { withActionContext } from '@/lib/observability/action-context'
import { type ShippingVerb, planTransition } from '@/lib/shipping/transitions'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyOrderShipped } from '@/server/shipping/notify'
import { revalidatePath } from 'next/cache'

/**
 * Fulfillment transitions for physical order lines, per
 * ARCHITECTURE-SUPPLIER-PORTAL.md 5.2: an audited Server Action is the ONLY
 * write path (production has no item_status trigger, so this file is the
 * enforcement). The verdict comes from the pure machine in
 * lib/shipping/transitions.ts; the UPDATE re-checks the from-state in its
 * WHERE so two admins racing on the same line cannot double-fire.
 *
 * carrier/tracking_number came in 155 and ARE applied in production (measured
 * 2026-09-10). The 42703 retry below is kept as a belt: if the columns are ever
 * missing the status transition still lands and the caller is told the tracking
 * was not stored, rather than the shipment failing outright.
 *
 * THE CUSTOMER IS NOW TOLD, AND THE COMMENT THAT USED TO SIT HERE WAS STALE
 *
 * This file used to say "No email yet, deliberately: 'order_shipped' enters
 * notification_outbox_kind_check in 155, and enqueueing before that 23514s".
 * 155 is applied and the constraint accepts the kind, so the only thing left of
 * that decision was the silence: an admin typed a carrier and a tracking number
 * and nobody was told. See lib/shipping/shipped-notice.ts for why the database
 * trigger did not cover this.
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

  // Only shipping is announced. Delivery has no outbox kind in production
  // (`notification_outbox_kind_check` has no `order_delivered`), and inventing
  // one here would 23514 on every delivery.
  if (verdict.nextStatus === 'shipped') {
    await notifyOrderShipped(admin, item.order_id, itemId)
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

export interface BulkShippingState {
  ok: boolean
  moved: number
  /** One message per line that refused, already in Hebrew. Never a summary. */
  failures: { itemId: string; error: string }[]
  error?: string
}

/**
 * The same transition, applied to several lines, because the day a supplier
 * hands over twenty parcels is the day the per-line button becomes the reason
 * nobody records tracking numbers at all.
 *
 * SEQUENTIAL, AND NOT A SINGLE UPDATE ... IN (...)
 *
 * One statement over twenty ids would be one audit row for twenty lines, would
 * skip `planTransition` per line, and would move lines that should have been
 * refused (a cancelled line, an unpaid order) alongside the ones that should
 * not. Twenty calls to the same audited path is twenty correct verdicts and
 * twenty audit rows, and twenty is not a performance problem.
 *
 * PARTIAL SUCCESS IS THE NORMAL OUTCOME, SO IT IS REPORTED AS ONE
 *
 * Selecting "all pending" and pressing ship will always include a line somebody
 * else just moved. The lines that went are reported as moved, the ones that
 * refused are listed individually with the machine's own reason, and nothing is
 * rolled back: the parcels really did leave.
 */
const BULK_LIMIT = 100

async function runBulk(
  itemIds: readonly string[],
  verb: ShippingVerb,
  carrier?: string,
  trackingNumber?: string,
): Promise<BulkShippingState> {
  const ids = Array.from(new Set(itemIds.map((id) => id.trim()).filter(Boolean)))
  if (ids.length === 0) return { ok: false, moved: 0, failures: [], error: 'לא נבחרו שורות.' }
  if (ids.length > BULK_LIMIT) {
    return {
      ok: false,
      moved: 0,
      failures: [],
      error: `אפשר לעדכן עד ${BULK_LIMIT} שורות בבת אחת.`,
    }
  }

  /**
   * A carrier is shared across a batch -- one van takes all of them. A tracking
   * number is not: writing the same number onto four lines mails the customer
   * four parcels that all claim to be the same parcel, and the courier's site
   * will show one of them. Refused rather than silently dropped, because the
   * operator typed it and is entitled to know it did not go in.
   */
  if (verb === 'ship' && (trackingNumber ?? '').trim() !== '' && ids.length > 1) {
    return {
      ok: false,
      moved: 0,
      failures: [],
      error: 'מספר מעקב שייך לחבילה אחת. לעדכון קבוצתי אפשר למלא מוביל בלבד.',
    }
  }

  const failures: { itemId: string; error: string }[] = []
  let moved = 0
  for (const itemId of ids) {
    const result = await runMarkItem(itemId, verb, carrier, trackingNumber)
    if (result.ok) moved += 1
    else failures.push({ itemId, error: result.error ?? 'העדכון נכשל.' })
  }

  return { ok: moved > 0, moved, failures }
}

export async function bulkMarkItemsShipped(
  itemIds: string[],
  carrier?: string,
  trackingNumber?: string,
): Promise<BulkShippingState> {
  return withActionContext('admin.shipping.bulk_ship', () =>
    runBulk(itemIds, 'ship', carrier, trackingNumber),
  )
}

export async function bulkMarkItemsDelivered(itemIds: string[]): Promise<BulkShippingState> {
  return withActionContext('admin.shipping.bulk_deliver', () => runBulk(itemIds, 'deliver'))
}
