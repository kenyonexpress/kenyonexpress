import type { SupabaseClient } from '@supabase/supabase-js'
import type { CouponLine } from '../_shared/emails/CustomerCouponOrder.tsx'
import type { PhysicalOrderLine } from '../_shared/emails/CustomerPhysicalOrder.tsx'
import type { PostalAddress } from '../_shared/emails/format.ts'
import { renderCustomerCouponOrder, renderCustomerPhysicalOrder } from '../_shared/emails/render.ts'
import { agorotFromRow, sumAgorot } from '../_shared/money.ts'
import { drain, readString } from '../_shared/outbox.ts'
import type { EmailAttachment } from '../_shared/resend.ts'
import type { OutboxRow, Prepared } from '../_shared/outbox.ts'
import { voucherQrAttachment } from '../_shared/qr.ts'
import { adminClient, authorize, batchSize, json, siteUrl } from '../_shared/runtime.ts'

/**
 * Supabase Edge Function: notify-customer-order
 *
 * The customer's order confirmation, in whichever of its two shapes the order
 * turned out to have.
 *
 * Auth:     Authorization: Bearer $CRON_SECRET
 * Schedule: every minute (`supabase/schedules/`), or invoked after checkout.
 * Deploy:   supabase functions deploy notify-customer-order --no-verify-jwt
 * Secrets:  CRON_SECRET, RESEND_API_KEY, SUPABASE_URL,
 *           SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_APP_URL, EMAIL_FROM
 *
 * TWO KINDS, ONE FUNCTION. `102` already made the database decide which of the
 * two an order is: a paid order that issued vouchers enqueues `voucher_issued`
 * and one that did not enqueues `order_paid`, and never both. Splitting this
 * into two Edge Functions would put that same either/or in a second place,
 * where it could disagree.
 *
 * WHY THE VOUCHERS ARE RE-READ INSTEAD OF TAKEN FROM THE PAYLOAD. `102` freezes
 * a voucher list into the queue row, and that list is missing the two things
 * this email needs most: `qr_payload`, without which there is no QR, and
 * `offer_valid_until`. Reading `vouchers` by `order_id` gets both from the
 * source of truth, and a voucher row is immutable in every field this template
 * shows, so nothing can drift under it.
 *
 * WHY THE QR IS AN ATTACHMENT. See `_shared/qr.ts` and the template's own
 * header: an inline `data:` URI is stripped by Gmail and by most corporate
 * filters, a `cid:` reference to a real attachment is not, and when the encoder
 * fails the mail still carries the code and the link.
 */

/**
 * How many QR images one email will carry.
 *
 * A basket of forty coupons would otherwise attach forty PNGs, and a mail large
 * enough to be refused or truncated delivers zero coupons instead of forty. Past
 * the cap the codes and the per-coupon links are still there, which is the
 * fallback the template was built around anyway.
 */
const MAX_QR_ATTACHMENTS = 10

interface VoucherRow {
  id: string
  code: string
  qr_payload: string | null
  face_value_agorot: number | null
  coupon_price_agorot: number | null
  remaining_amount_due_agorot: number | null
  expires_at: string
  offer_valid_until: string | null
  products: { name_he: string | null } | { name_he: string | null }[] | null
  suppliers:
    | { name: string | null; address: string | null; contact_phone: string | null }
    | { name: string | null; address: string | null; contact_phone: string | null }[]
    | null
}

/** PostgREST returns an embedded row as an object or as a one-element array. */
function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

async function prepareCouponEmail(
  admin: SupabaseClient,
  site: string,
  row: OutboxRow,
  orderId: string,
): Promise<Prepared | null> {
  const { data, error } = await admin
    .from('vouchers')
    .select(
      `id, code, qr_payload, face_value_agorot, coupon_price_agorot,
       remaining_amount_due_agorot, expires_at, offer_valid_until,
       products(name_he),
       suppliers(name, address, contact_phone)`,
    )
    .eq('order_id', orderId)
    .order('issued_at', { ascending: true })

  if (error) throw new Error(`vouchers_read_failed: ${error.message}`)

  const vouchers = (data ?? []) as unknown as VoucherRow[]
  // A `voucher_issued` row whose order has no vouchers cannot become sendable
  // later; `drain` settles it as terminal rather than retrying five times.
  if (vouchers.length === 0) return null

  const attachments: EmailAttachment[] = []
  const lines: CouponLine[] = []

  for (const voucher of vouchers) {
    const product = firstOf(voucher.products)
    const supplier = firstOf(voucher.suppliers)

    const qr =
      attachments.length < MAX_QR_ATTACHMENTS
        ? await voucherQrAttachment(site, voucher.id, voucher.qr_payload)
        : null

    if (qr) {
      attachments.push({
        filename: qr.filename,
        content: qr.base64,
        contentId: qr.contentId,
        contentType: 'image/png',
      })
    }

    lines.push({
      id: voucher.id,
      code: voucher.code,
      productName: product?.name_he ?? null,
      supplierName: supplier?.name ?? null,
      supplierAddress: supplier?.address ?? null,
      supplierPhone: supplier?.contact_phone ?? null,
      faceValueAgorot: voucher.face_value_agorot ?? 0,
      couponPriceAgorot: voucher.coupon_price_agorot ?? 0,
      remainingDueAgorot: voucher.remaining_amount_due_agorot ?? 0,
      expiresAt: voucher.expires_at,
      offerValidUntil: voucher.offer_valid_until,
      qrCid: qr?.contentId ?? null,
    })
  }

  const email = await renderCustomerCouponOrder({
    siteUrl: site,
    customerName: readString(row.payload, 'customer_name'),
    orderRef: readString(row.payload, 'order_ref') ?? orderId.slice(0, 8).toUpperCase(),
    vouchers: lines,
  })

  return { email, attachments }
}

async function preparePhysicalEmail(
  admin: SupabaseClient,
  site: string,
  row: OutboxRow,
  orderId: string,
): Promise<Prepared | null> {
  const { data: order, error } = await admin
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle()

  if (error) throw new Error(`order_read_failed: ${error.message}`)
  if (!order) return null

  const orderRow = order as Record<string, unknown>

  // `*` and not a column list, deliberately. The line total is spelled
  // `total_price_agorot` in one lineage and `total_price_ils` in the other, and
  // PostgREST fails the whole request when a named column is absent, so naming
  // either one makes this email blank on the other deployment. `095`'s trigger
  // reads the same pair out of `to_jsonb(i)` for the same reason.
  const { data: itemRows } = await admin
    .from('order_items')
    .select('*, products(name_he)')
    .eq('order_id', orderId)

  const items = (itemRows ?? []) as Record<string, unknown>[]

  const lines: PhysicalOrderLine[] = items.map((item) => {
    const product = firstOf(item.products as { name_he: string | null } | null)
    return {
      // `order_items.supplier_name` is the business, not the product, and is
      // the wrong fallback: a line reading "מאפיית לחם" where the product goes
      // looks like a product until somebody tries to reorder it.
      productName: product?.name_he ?? 'פריט',
      quantity: typeof item.quantity === 'number' ? item.quantity : 1,
      totalAgorot: agorotFromRow(item, 'total_price_agorot', 'total_price_ils'),
    }
  })

  // The order's own total wins when it is there. Summing the lines is the
  // fallback and is not the same number: it misses shipping and any order-level
  // discount, so it is used only when the column is unreadable.
  const total =
    agorotFromRow(orderRow, 'total_agorot', 'total_ils') ??
    sumAgorot(lines.map((line) => line.totalAgorot))

  let address: PostalAddress | null = null
  let recipientName: string | null = null
  let recipientPhone: string | null = null

  const addressId = typeof orderRow.address_id === 'string' ? orderRow.address_id : null
  if (addressId) {
    const { data: addressRow } = await admin
      .from('user_addresses')
      .select('street, street_number, apartment, entrance, floor, city, zip, full_name, phone')
      .eq('id', addressId)
      .maybeSingle()

    const a = addressRow as Record<string, string | null> | null
    if (a) {
      address = {
        street: a.street,
        streetNumber: a.street_number,
        apartment: a.apartment,
        entrance: a.entrance,
        floor: a.floor,
        city: a.city,
        zip: a.zip,
      }
      recipientName = a.full_name
      recipientPhone = a.phone
    }
  }

  const email = await renderCustomerPhysicalOrder({
    siteUrl: site,
    customerName: readString(row.payload, 'customer_name'),
    orderId,
    orderRef: readString(row.payload, 'order_ref') ?? orderId.slice(0, 8).toUpperCase(),
    lines,
    totalAgorot: total,
    shippingAddress: address,
    recipientName,
    recipientPhone,
  })

  return { email }
}

export function makePreparer(admin: SupabaseClient, site: string) {
  return async function prepare(row: OutboxRow): Promise<Prepared | null> {
    const orderId = readString(row.payload, 'order_id')
    if (!orderId) return null

    if (row.kind === 'voucher_issued') {
      return prepareCouponEmail(admin, site, row, orderId)
    }
    return preparePhysicalEmail(admin, site, row, orderId)
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
      kinds: ['voucher_issued', 'order_paid'],
      limit: batchSize(),
      source: 'edge:notify-customer-order',
      prepare: makePreparer(admin, site),
      // Longer than the other two: this one encodes QR images and can hold a
      // row for several seconds. A lease shorter than the work is a second send.
      leaseMinutes: 10,
    })

    return json({ ok: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('notify-customer-order failed:', message)
    return json({ ok: false, error: message }, 500)
  }
})
