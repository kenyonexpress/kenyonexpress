import type { SupabaseClient } from '@supabase/supabase-js'
import { renderSupplierNewOrder } from '../_shared/emails/render.ts'
import type { SupplierOrderLine } from '../_shared/emails/SupplierNewOrder.tsx'
import type { PostalAddress } from '../_shared/emails/format.ts'
import { drain, readNumber, readString } from '../_shared/outbox.ts'
import type { OutboxRow, Prepared } from '../_shared/outbox.ts'
import { adminClient, authorize, batchSize, json, siteUrl } from '../_shared/runtime.ts'

/**
 * Supabase Edge Function: notify-supplier-new-order
 *
 * Tells a business, by email, that somebody has just bought from it.
 *
 * Auth:     Authorization: Bearer $CRON_SECRET
 * Schedule: every minute (`supabase/schedules/`), or invoked directly after a
 *           checkout closes for a faster first attempt.
 * Deploy:   supabase functions deploy notify-supplier-new-order --no-verify-jwt
 * Secrets:  CRON_SECRET, RESEND_API_KEY, SUPABASE_URL,
 *           SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_APP_URL, EMAIL_FROM
 *
 * IT DOES NOT DECIDE WHETHER A MAIL IS OWED. `095`'s trigger already did, in
 * the same transaction that set `paid_at`, and wrote one `supplier_sale` row
 * per supplier per order. This decides only when the mail goes out and what it
 * looks like. That division is the whole point of the outbox: if this function
 * is down for an hour, nothing is lost.
 *
 * WHAT IT ADDS TO THE FROZEN PAYLOAD, AND WHY. The queue row carries the sale
 * as it was — product names, quantities, the supplier's share — because those
 * must not be rewritten by a later rename. It does not carry the delivery
 * address or the customer's phone, and those are fetched here, live. A delivery
 * address is an instruction about the future rather than a fact about a past
 * transaction: if the customer corrected it between the charge and this send,
 * the corrected one is the one that gets the parcel to them.
 */

interface AddressRow {
  street: string | null
  street_number: string | null
  apartment: string | null
  entrance: string | null
  floor: string | null
  city: string | null
  zip: string | null
  full_name: string | null
  phone: string | null
}

interface OrderContext {
  customerName: string | null
  customerPhone: string | null
  notes: string | null
  address: PostalAddress | null
  recipientName: string | null
  recipientPhone: string | null
}

async function loadOrderContext(
  admin: SupabaseClient,
  orderId: string,
): Promise<OrderContext> {
  const empty: OrderContext = {
    customerName: null,
    customerPhone: null,
    notes: null,
    address: null,
    recipientName: null,
    recipientPhone: null,
  }

  const { data: order } = await admin
    .from('orders')
    .select('id, user_id, address_id, notes')
    .eq('id', orderId)
    .maybeSingle()

  if (!order) return empty

  const row = order as { user_id: string | null; address_id: string | null; notes: string | null }
  const context: OrderContext = { ...empty, notes: row.notes ?? null }

  if (row.user_id) {
    const { data: profile } = await admin
      .from('profiles')
      .select('full_name, phone')
      .eq('id', row.user_id)
      .maybeSingle()
    const p = profile as { full_name: string | null; phone: string | null } | null
    context.customerName = p?.full_name ?? null
    context.customerPhone = p?.phone ?? null
  }

  if (row.address_id) {
    // Soft-deleted rows are read deliberately: `account.ts` documents that
    // orders reference `address_id` and must keep resolving, so an address the
    // customer has since removed from their book is still the address this
    // parcel was bought for.
    const { data: address } = await admin
      .from('user_addresses')
      .select('street, street_number, apartment, entrance, floor, city, zip, full_name, phone')
      .eq('id', row.address_id)
      .maybeSingle()

    const a = address as AddressRow | null

    if (a) {
      // Mapped field by field. The column is `street_number` and the template
      // property is `streetNumber`; a spread would silently drop it and print
      // a street with no house number on a picking slip.
      context.address = {
        street: a.street,
        streetNumber: a.street_number,
        apartment: a.apartment,
        entrance: a.entrance,
        floor: a.floor,
        city: a.city,
        zip: a.zip,
      }
      context.recipientName = a.full_name
      context.recipientPhone = a.phone
    }
  }

  return context
}

function readLines(payload: Record<string, unknown> | null): SupplierOrderLine[] {
  const raw = payload?.lines
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry) => {
      if (typeof entry !== 'object' || entry === null) return null
      const line = entry as Record<string, unknown>
      const name = typeof line.product_name === 'string' ? line.product_name : null
      if (!name) return null
      return {
        productName: name,
        quantity: typeof line.quantity === 'number' ? line.quantity : 1,
        productType: typeof line.product_type === 'string' ? line.product_type : 'physical',
        sku: typeof line.sku === 'string' ? line.sku : null,
      } satisfies SupplierOrderLine
    })
    .filter((line): line is SupplierOrderLine => line !== null)
}

export function makePreparer(admin: SupabaseClient, site: string) {
  return async function prepare(row: OutboxRow): Promise<Prepared | null> {
    const orderId = readString(row.payload, 'order_id')
    const lines = readLines(row.payload)
    // No order and no lines is a row nothing can render, however many times it
    // is retried. `drain` settles it as terminal rather than burning attempts.
    if (!orderId || lines.length === 0) return null

    const context = await loadOrderContext(admin, orderId)

    const email = await renderSupplierNewOrder({
      siteUrl: site,
      supplierName: readString(row.payload, 'supplier_name'),
      orderRef: readString(row.payload, 'order_ref') ?? orderId.slice(0, 8).toUpperCase(),
      customerName: context.recipientName ?? context.customerName,
      customerPhone: context.recipientPhone ?? context.customerPhone,
      lines,
      amountAgorot: readNumber(row.payload, 'amount_agorot'),
      shippingAddress: context.address,
      notes: context.notes,
    })

    return { email }
  }
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST' && request.method !== 'GET') {
    return json({ ok: false, error: 'method' }, 405)
  }

  const refusal = authorize(request)
  if (refusal) return refusal

  try {
    const admin = adminClient()
    const site = siteUrl()

    const result = await drain(admin, {
      kinds: ['supplier_sale'],
      limit: batchSize(),
      source: 'edge:notify-supplier-new-order',
      prepare: makePreparer(admin, site),
    })

    return json({ ok: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('notify-supplier-new-order failed:', message)
    return json({ ok: false, error: message }, 500)
  }
})
