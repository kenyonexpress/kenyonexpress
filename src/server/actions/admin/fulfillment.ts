'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { ORDER_STATUS_LABELS } from '@/lib/admin/labels'
import { type AdminSessionInfo, requireSection } from '@/lib/admin/rbac'
import type { OrderStatus } from '@/lib/checkout/state-machine'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { planTransition } from '@/lib/shipping/transitions'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { parcelLines } from '@/server/domain/orders/fulfillment-lanes'
import { canAdminOverride, effectsFor } from '@/server/domain/orders/order-transitions'
import { cancelPendingOrderCore } from '@/server/orders/cancel-pending-order'
import { enqueueDeliveredNotification } from '@/server/orders/delivered-notification'
import { enqueueShippedNotifications } from '@/server/orders/shipped-notification'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

/**
 * The fulfilment board's bulk moves (STEP 15): ship, deliver, cancel, each
 * over a selection of orders.
 *
 * THE MACHINES ARE NOT REPEATED HERE. A line ships or delivers only if
 * `planTransition` (lib/shipping/transitions.ts) says so, exactly as the
 * per-line buttons on the order page; the order reaches `fulfilled` only
 * through `canAdminOverride` and the declared `effectsFor` plan, exactly as
 * the manual override; an unpaid order is cancelled by the same core the
 * one-click cancel runs. What this file adds is the loop, the per-order
 * outcome the toolbar prints, and the shipped notification at ship time.
 *
 * ONE ORDER FAILING DOES NOT ROLL BACK THE OTHERS. An operator who selected
 * forty parcels and typed forty tracking numbers wants the thirty-nine that
 * were legal to go, and the one that was not to be named. Every skip carries
 * its reason, and every completed order carries its own audit row.
 *
 * Every UPDATE re-checks the from-state in its WHERE (the race barrier the
 * single-line action has), so two operators on the same board cannot
 * double-fire a line.
 */

const MAX_BATCH = 100
const UNDEFINED_COLUMN = '42703'

const uuid = z.string().uuid()

const shipEntrySchema = z.object({
  orderId: uuid,
  carrier: z.string().trim().max(120).optional(),
  trackingNumber: z.string().trim().max(120).optional(),
})

export type ShipEntry = z.infer<typeof shipEntrySchema>

export interface BulkSkip {
  orderId: string
  reason: string
}

export interface BulkOutcome {
  /** Orders the move completed on. */
  done: string[]
  /** Orders the move refused, each with the machine's reason. */
  skipped: BulkSkip[]
  /** Set when nothing ran at all: no permission, bad input. */
  error?: string
  /** Ship only: how many orders had a customer message queued on any channel. */
  notified?: number
}

interface LineRow {
  id: string
  product_type: string
  item_status: string
  carrier: string | null
  tracking_number: string | null
}

interface OrderRow {
  id: string
  status: string
  notes: string | null
  user_id: string
  address_id: string | null
  order_items: LineRow[]
}

async function gate(): Promise<AdminSessionInfo | null> {
  try {
    return await requireSection('orders', 'write')
  } catch {
    return null
  }
}

function parseIds(ids: unknown): string[] | null {
  const parsed = z.array(uuid).min(1).max(MAX_BATCH).safeParse(ids)
  return parsed.success ? Array.from(new Set(parsed.data)) : null
}

async function readOrder(
  admin: ReturnType<typeof createAdminClient>,
  orderId: string,
): Promise<OrderRow | null> {
  const { data, error } = await admin
    .from('orders')
    .select(
      'id, status, notes, user_id, address_id, order_items(id, product_type, item_status, carrier, tracking_number)',
    )
    .eq('id', orderId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error || !data) return null
  const row = data as unknown as OrderRow
  return { ...row, order_items: Array.isArray(row.order_items) ? row.order_items : [] }
}

function revalidate(orderIds: string[]): void {
  revalidatePath('/admin/orders')
  for (const id of orderIds) revalidatePath(`/admin/orders/${id}`)
}

// ---------------------------------------------------------------------------
// ship
// ---------------------------------------------------------------------------

async function runShipOrders(rawEntries: unknown): Promise<BulkOutcome> {
  const session = await gate()
  if (!session) return { done: [], skipped: [], error: 'אין הרשאה' }

  const parsed = z.array(shipEntrySchema).min(1).max(MAX_BATCH).safeParse(rawEntries)
  if (!parsed.success) return { done: [], skipped: [], error: 'קלט לא תקין' }

  const admin = createAdminClient()
  const done: string[] = []
  const skipped: BulkSkip[] = []
  let notified = 0
  const seen = new Set<string>()

  for (const entry of parsed.data) {
    if (seen.has(entry.orderId)) continue
    seen.add(entry.orderId)

    const order = await readOrder(admin, entry.orderId)
    if (!order) {
      skipped.push({ orderId: entry.orderId, reason: 'ההזמנה לא נמצאה' })
      continue
    }

    const pending = order.order_items.filter(
      (l) => l.product_type === 'physical' && l.item_status === 'pending',
    )
    if (pending.length === 0) {
      skipped.push({
        orderId: order.id,
        reason:
          parcelLines(order.order_items).length === 0
            ? 'אין בהזמנה שורות מוצר פיזי לשליחה'
            : 'כל השורות כבר נשלחו',
      })
      continue
    }

    // The verdict is per line and comes from the machine; the first refusal
    // names the order, because a paid-or-later order with a pending physical
    // line is the only shape the machine accepts.
    const verdict = planTransition({
      verb: 'ship',
      productType: 'physical',
      itemStatus: 'pending',
      orderStatus: order.status,
    })
    if (!verdict.ok) {
      skipped.push({ orderId: order.id, reason: verdict.reason })
      continue
    }

    const now = new Date().toISOString()
    const carrier = entry.carrier?.trim() ? entry.carrier.trim() : null
    const trackingNumber = entry.trackingNumber?.trim() ? entry.trackingNumber.trim() : null
    const tracking = {
      ...(carrier ? { carrier } : {}),
      ...(trackingNumber ? { tracking_number: trackingNumber } : {}),
    }
    const lineIds = pending.map((l) => l.id)

    let trackingStored = Object.keys(tracking).length > 0
    let { data: updated, error } = await admin
      .from('order_items')
      .update({ item_status: 'shipped', shipped_at: now, ...tracking } as never)
      .in('id', lineIds)
      .eq('item_status', 'pending')
      .select('id')

    // Same stance as the single-line action: on a database without the
    // tracking columns the status still moves and the caller is told.
    if (error && error.code === UNDEFINED_COLUMN && trackingStored) {
      trackingStored = false
      ;({ data: updated, error } = await admin
        .from('order_items')
        .update({ item_status: 'shipped', shipped_at: now } as never)
        .in('id', lineIds)
        .eq('item_status', 'pending')
        .select('id'))
    }
    if (error) {
      skipped.push({ orderId: order.id, reason: 'העדכון נכשל' })
      continue
    }
    const movedIds = ((updated ?? []) as { id: string }[]).map((r) => r.id)
    if (movedIds.length === 0) {
      skipped.push({ orderId: order.id, reason: 'השורות השתנו בינתיים. רענן ונסה שוב.' })
      continue
    }

    await writeAuditLog({
      actorId: session.userId,
      actorRole: session.role,
      action: 'status_change',
      entityType: 'orders',
      entityId: order.id,
      changes: {
        item_status: { from: 'pending', to: 'shipped' },
        lines: movedIds,
        ...(trackingStored ? tracking : {}),
      },
      metadata: { source: 'fulfillment_board', tracking_stored: trackingStored },
    })

    // Every parcel of the order with a number, the ones shipped earlier
    // included: the message is about the order, and a customer with two
    // numbers wants both in one place.
    const shipments = order.order_items
      .filter((l) => l.product_type === 'physical')
      .map((l) =>
        movedIds.includes(l.id) && trackingStored
          ? { carrier, tracking_number: trackingNumber }
          : { carrier: l.carrier, tracking_number: l.tracking_number },
      )
    const outcome = await enqueueShippedNotifications(admin, {
      orderId: order.id,
      userId: order.user_id,
      addressId: order.address_id,
      itemCount: order.order_items.length,
      shipments,
    })
    if (outcome.email === 'queued' || outcome.whatsapp === 'queued') notified += 1

    done.push(order.id)
  }

  revalidate(done)
  return { done, skipped, notified }
}

// ---------------------------------------------------------------------------
// deliver
// ---------------------------------------------------------------------------

async function runDeliverOrders(rawIds: unknown): Promise<BulkOutcome> {
  const session = await gate()
  if (!session) return { done: [], skipped: [], error: 'אין הרשאה' }

  const ids = parseIds(rawIds)
  if (!ids) return { done: [], skipped: [], error: 'קלט לא תקין' }

  const admin = createAdminClient()
  const done: string[] = []
  const skipped: BulkSkip[] = []
  let notified = 0

  for (const orderId of ids) {
    const order = await readOrder(admin, orderId)
    if (!order) {
      skipped.push({ orderId, reason: 'ההזמנה לא נמצאה' })
      continue
    }

    const shipped = order.order_items.filter(
      (l) => l.product_type === 'physical' && l.item_status === 'shipped',
    )
    if (shipped.length === 0) {
      skipped.push({ orderId, reason: 'אין בהזמנה שורות שנשלחו וטרם נמסרו' })
      continue
    }
    const verdict = planTransition({
      verb: 'deliver',
      productType: 'physical',
      itemStatus: 'shipped',
      orderStatus: order.status,
    })
    if (!verdict.ok) {
      skipped.push({ orderId, reason: verdict.reason })
      continue
    }

    const now = new Date().toISOString()
    const lineIds = shipped.map((l) => l.id)
    const { data: updated, error } = await admin
      .from('order_items')
      .update({ item_status: 'delivered', delivered_at: now, fulfilled_at: now } as never)
      .in('id', lineIds)
      .eq('item_status', 'shipped')
      .select('id')
    if (error) {
      skipped.push({ orderId, reason: 'העדכון נכשל' })
      continue
    }
    const movedIds = ((updated ?? []) as { id: string }[]).map((r) => r.id)
    if (movedIds.length === 0) {
      skipped.push({ orderId, reason: 'השורות השתנו בינתיים. רענן ונסה שוב.' })
      continue
    }

    await writeAuditLog({
      actorId: session.userId,
      actorRole: session.role,
      action: 'status_change',
      entityType: 'orders',
      entityId: orderId,
      changes: { item_status: { from: 'shipped', to: 'delivered' }, lines: movedIds },
      metadata: { source: 'fulfillment_board' },
    })

    // Every parcel delivered: the order is fulfilled, and saying so on the
    // order row is what fires the customer's "delivered" WhatsApp (173) and
    // closes the lane. The move goes through the override policy, with the
    // same CAS and the same audit row the manual override writes, so a
    // status the policy protects (a refunded order, say) is left alone.
    const remaining = parcelLines(order.order_items).filter(
      (l) => !movedIds.includes(l.id) && l.item_status !== 'delivered',
    )

    // The customer's "delivered" mail (STEP 16), once, when the last parcel
    // lands. App-side because "delivered" is a fold over the lines, not an
    // order status; see server/orders/delivered-notification.ts. Best-effort:
    // the lines are already delivered whatever the queue says.
    if (remaining.length === 0) {
      const outcome = await enqueueDeliveredNotification(admin, {
        orderId,
        userId: order.user_id,
        addressId: order.address_id,
        itemCount: order.order_items.length,
      })
      if (outcome.email === 'queued' || outcome.whatsapp === 'queued') notified += 1
    }

    const from = order.status as OrderStatus
    if (remaining.length === 0 && canAdminOverride(from, 'fulfilled')) {
      const effects = effectsFor(from, 'fulfilled') ?? []
      const update: { status: OrderStatus; notes?: string } = { status: 'fulfilled' }
      if (effects.includes('append_note')) {
        const line = `[${now}] ${session.userId}: לוח האספקה: כל הפריטים נמסרו, ${ORDER_STATUS_LABELS[from]} > ${ORDER_STATUS_LABELS.fulfilled}`
        update.notes = order.notes ? `${order.notes}\n${line}` : line
      }
      const { data: moved, error: moveError } = await admin
        .from('orders')
        .update(update)
        .eq('id', orderId)
        .eq('status', from)
        .select('id')
        .maybeSingle()
      if (moveError || !moved) {
        log.warn('fulfillment.order_fulfil_after_delivery_failed', {
          orderId,
          reason: moveError?.message ?? 'status changed concurrently',
        })
      } else {
        await writeAuditLog({
          actorId: session.userId,
          actorRole: session.role,
          action: 'manual_override',
          entityType: 'orders',
          entityId: orderId,
          changes: { status: { from, to: 'fulfilled' } },
          metadata: { reason: 'לוח האספקה: כל הפריטים נמסרו', source: 'fulfillment_board' },
        })
      }
    }

    done.push(orderId)
  }

  revalidate(done)
  return { done, skipped, notified }
}

// ---------------------------------------------------------------------------
// cancel
// ---------------------------------------------------------------------------

const cancelReasonSchema = z
  .string()
  .trim()
  .min(3, 'חובה לציין סיבת ביטול (לפחות 3 תווים)')
  .max(500, 'סיבת הביטול ארוכה מדי')

async function runCancelOrders(rawIds: unknown, rawReason: unknown): Promise<BulkOutcome> {
  const session = await gate()
  if (!session) return { done: [], skipped: [], error: 'אין הרשאה' }

  const ids = parseIds(rawIds)
  if (!ids) return { done: [], skipped: [], error: 'קלט לא תקין' }
  const reason = cancelReasonSchema.safeParse(rawReason)
  if (!reason.success) {
    return { done: [], skipped: [], error: reason.error.issues[0]?.message ?? 'קלט לא תקין' }
  }

  // The RLS client, as the one-click cancel uses: the core's CAS on `pending`
  // and the two release RPCs read the same either way, and an admin who can
  // see the order can cancel it.
  const supabase = await createClient()
  const done: string[] = []
  const skipped: BulkSkip[] = []

  for (const orderId of ids) {
    const result = await cancelPendingOrderCore({
      supabase,
      session,
      orderId,
      reason: reason.data,
    })
    if (result.ok) done.push(orderId)
    else skipped.push({ orderId, reason: result.error })
  }

  revalidate(done)
  return { done, skipped }
}

// ---------------------------------------------------------------------------
// exports
// ---------------------------------------------------------------------------

export async function shipOrders(entries: ShipEntry[]): Promise<BulkOutcome> {
  return withActionContext('admin.fulfillment.ship', () => runShipOrders(entries))
}

export async function deliverOrders(ids: string[]): Promise<BulkOutcome> {
  return withActionContext('admin.fulfillment.deliver', () => runDeliverOrders(ids))
}

export async function cancelOrders(ids: string[], reason: string): Promise<BulkOutcome> {
  return withActionContext('admin.fulfillment.cancel', () => runCancelOrders(ids, reason))
}
