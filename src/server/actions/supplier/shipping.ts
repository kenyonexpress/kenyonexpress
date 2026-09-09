'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { withActionContext } from '@/lib/observability/action-context'
import { planTransition } from '@/lib/shipping/transitions'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSupplierRole } from '@/lib/supplier/rbac'
import { notifyOrderShipped } from '@/server/shipping/notify'
import { revalidatePath } from 'next/cache'

/**
 * The supplier marks their own line shipped, with a carrier and a number.
 *
 * WHY THIS DID NOT EXIST, AND WHY THAT REASON IS NOW SPENT
 *
 * `supplier/orders/page.tsx` says so in its header: "There is no 'mark shipped'
 * button, and its absence is the design. ARCHITECTURE-SUPPLIER-PORTAL.md 5.2
 * routes every fulfillment transition through a Server Action that writes
 * `audit_log`, and section 3.2 gives suppliers SELECT on `orders` and nothing
 * else. A button here would need a write path that does not exist yet; shipping
 * one that quietly used the service role would be the audit hole those two
 * sections are written to close."
 *
 * That is correct and it describes the missing thing rather than forbidding it.
 * This file IS the write path 5.2 prescribes: an audited Server Action. The
 * service role is used, and the reason it is not the hole 3.2 warns about is
 * the ownership check below -- the caller's supplier is read from their
 * membership, never from the request, and the UPDATE is scoped to it.
 *
 * THE OWNERSHIP CHECK IS THE WHOLE SECURITY MODEL, SO IT IS IN THE WHERE
 *
 * `requireSupplierRole('manager')` establishes WHICH supplier is calling.
 * `.eq('supplier_id', session.supplierId)` on the UPDATE is what stops them
 * touching anybody else's line. Checking ownership in a preceding SELECT and
 * then updating by id alone would leave a window between the two; putting it in
 * the WHERE means a line that is not theirs updates zero rows and the action
 * fails, whatever happened in between.
 *
 * `manager`, not `scanner`, matching the page it appears on: the orders list is
 * gated at manager because its rows carry the commission percent and the
 * residual owed, and handing the till phone to a shift worker must not hand
 * them the business terms -- or the ability to declare an order shipped.
 *
 * THE VERDICT COMES FROM THE SAME MACHINE THE ADMIN USES
 *
 * `planTransition` is pure and shared. A second copy of "may this line ship"
 * living here would be a second answer, and the two would disagree the first
 * time either was changed. Production has no `item_status` trigger, so that
 * module plus this action is the enforcement.
 */

const UNDEFINED_COLUMN = '42703'

export type SupplierShippingState = { ok: boolean; error?: string }

async function runMarkShipped(
  itemId: string,
  carrier: string,
  trackingNumber: string,
): Promise<SupplierShippingState> {
  const session = await requireSupplierRole('manager')
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) return { ok: false, error: 'שורה לא תקינה.' }

  const admin = createAdminClient()

  // Scoped to the caller's supplier on the READ as well, so a line that is not
  // theirs is "not found" rather than "forbidden". The distinction matters:
  // "forbidden" confirms the id exists, which lets a supplier enumerate other
  // suppliers' order lines one guess at a time.
  const { data: item, error: readError } = await admin
    .from('order_items')
    .select('id, item_status, product_type, order_id, supplier_id, orders!inner(status)')
    .eq('id', itemId)
    .eq('supplier_id', session.supplierId)
    .maybeSingle()
  if (readError || !item) return { ok: false, error: 'השורה לא נמצאה.' }

  const orderStatus = (item.orders as unknown as { status: string }).status
  const verdict = planTransition({
    verb: 'ship',
    productType: item.product_type,
    itemStatus: item.item_status,
    orderStatus,
  })
  if (!verdict.ok) return { ok: false, error: verdict.reason }

  // Both required here, unlike the admin form where they are optional. A
  // supplier declaring a parcel shipped without saying who has it and under
  // what number leaves the customer exactly where they were, and this button
  // exists to end that.
  const carrierValue = carrier.trim().slice(0, 120)
  const trackingValue = trackingNumber.trim().slice(0, 120)
  if (!carrierValue || !trackingValue) {
    return { ok: false, error: 'יש למלא חברת שליחויות ומספר מעקב.' }
  }

  const patch = {
    item_status: verdict.nextStatus,
    shipped_at: new Date().toISOString(),
    carrier: carrierValue,
    tracking_number: trackingValue,
  }

  const { data: updated, error } = await admin
    .from('order_items')
    .update(patch as never)
    .eq('id', itemId)
    .eq('supplier_id', session.supplierId)
    // The race barrier, same as the admin path: two managers on the same line
    // cannot both fire the transition.
    .eq('item_status', item.item_status)
    .select('id')
    .maybeSingle()

  if (error?.code === UNDEFINED_COLUMN) {
    // 155 gives `order_items` its carrier and tracking columns and IS applied in
    // production. Kept as an explicit branch anyway because this action REQUIRES
    // both fields, so unlike the admin path it cannot fall back to writing the
    // status alone: a shipment recorded here without its number is the defect
    // this file exists to fix, and doing it silently would be worse than
    // refusing.
    return { ok: false, error: 'לא ניתן לשמור מוביל ומעקב במסד הזה.' }
  }
  if (error) return { ok: false, error: 'העדכון נכשל.' }
  if (!updated) return { ok: false, error: 'השורה השתנתה בינתיים — רעננו ונסו שוב.' }

  // The audit row is what makes this a legitimate write path rather than the
  // hole 3.2 describes. The actor is the supplier's user, not the service role,
  // so "who declared this shipped" survives.
  await writeAuditLog({
    actorId: session.userId,
    // `vendor`, the PLATFORM role, because that is what `audit_log.actor_role`
    // holds -- a `user_role` value, not a supplier membership. `supplier:manager`
    // would have been rejected by the column's own type, and the membership is
    // the more interesting fact anyway, so it goes in `metadata` where it can
    // be read without pretending to be something it is not.
    actorRole: 'vendor',
    action: 'status_change',
    entityType: 'order_item',
    entityId: itemId,
    changes: {
      item_status: { from: item.item_status, to: verdict.nextStatus },
      carrier: carrierValue,
      tracking_number: trackingValue,
    },
    metadata: {
      via: 'supplier_portal',
      supplier_id: session.supplierId,
      member_role: session.memberRole,
    },
  })

  // The customer hears about it from here too, and through the same builder as
  // the admin path: two write paths that told the customer different things
  // would be worse than one that told them nothing.
  await notifyOrderShipped(admin, item.order_id, itemId)

  revalidatePath('/supplier/orders')
  return { ok: true }
}

export async function markSupplierItemShipped(
  itemId: string,
  carrier: string,
  trackingNumber: string,
): Promise<SupplierShippingState> {
  return withActionContext('supplier.shipping.ship', () =>
    runMarkShipped(itemId, carrier, trackingNumber),
  )
}
