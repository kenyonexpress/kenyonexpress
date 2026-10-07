import { writeAuditLog } from '@/lib/admin/audit'
import { resolveInvoiceIssuer } from '@/lib/invoices/issuer'
import { type Agorot, agorot, parseIls } from '@/lib/money'
import { log } from '@/lib/observability/log'
import { type CarrierId, carrierService, legacyCarrierText } from '@/lib/shipping/carrier-registry'
import { type ShippingEnv, loadShippingEnv } from '@/lib/shipping/env'
import { labelFileName, renderShippingLabelPdf } from '@/lib/shipping/label-pdf'
import { getCarrierProvider } from '@/lib/shipping/providers'
import {
  CarrierError,
  type CarrierProvider,
  type CreatedLabel,
  type ParcelAddress,
} from '@/lib/shipping/providers/types'
import { declaredValueAgorot, estimateParcelWeightGrams } from '@/lib/shipping/quote'
import { planTransition } from '@/lib/shipping/transitions'
import type { createAdminClient } from '@/lib/supabase/admin'
import { enqueueShippedNotifications } from '@/server/orders/shipped-notification'

/**
 * Create a carrier label for an order and ship its pending physical lines.
 *
 * ORDER OF WRITES, AND WHY. The provider is called first (a label that
 * cannot be created ships nothing). Then `order_items` is written: carrier,
 * tracking number, `shipped` with the same race barrier as the manual
 * buttons. That table exists in production and is what the account page,
 * the shipped mail and the SMS read, so after this write the customer has
 * everything they had under the manual flow. Only then is the `shipments`
 * row inserted; it is the richer record (events, cost, archive) and its
 * table arrives with pending 258, so a missing table is logged and tolerated
 * and the label is still handed back.
 *
 * The transition verdict comes from `planTransition`, exactly as the
 * per-line action and the board: this file adds a provider call in front of
 * the same machine, not a second machine.
 */

type AdminClient = ReturnType<typeof createAdminClient>

const MISSING_TABLE = new Set(['42P01', 'PGRST205'])
const UNDEFINED_COLUMN = '42703'

export interface CreateShipmentInput {
  orderId: string
  carrierId: CarrierId
  serviceCode: string | null
  actorId: string | null
  actorRole: string | null
  now?: Date
}

export type CreateShipmentFailure =
  | 'NOT_FOUND'
  | 'NO_LINES'
  | 'NOT_ALLOWED'
  | 'NO_ADDRESS'
  | 'CARRIER'
  | 'WRITE'

export type CreateShipmentResult =
  | {
      ok: true
      shipmentId: string | null
      carrierId: CarrierId
      serviceCode: string
      trackingNumber: string
      /** The label bytes, rendered by us when the carrier gave none. */
      labelPdf: Uint8Array
      labelUrl: string | null
      linesShipped: number
      /** False when 258 is not applied and only order_items carries the fact. */
      stored: boolean
      notified: boolean
      providerKind: 'mock' | 'http'
    }
  | { ok: false; code: CreateShipmentFailure; error: string }

interface OrderLineRow {
  id: string
  product_type: string
  item_status: string
  quantity: number
  product_id: string | null
  total_price_ils: number | string | null
}

interface OrderRow {
  id: string
  status: string
  user_id: string
  address_id: string | null
  order_items: OrderLineRow[]
}

interface AddressRow {
  full_name: string
  phone: string | null
  city: string
  street: string
  street_number: string | null
  apartment: string | null
  floor: string | null
  entrance: string | null
  zip: string | null
  notes_for_courier: string | null
}

export interface CreateShipmentDeps {
  env?: ShippingEnv
  provider?: CarrierProvider
  /** Archives the PDF and returns its public URL, or null. Defaults to R2 when configured. */
  archive?: (bytes: Uint8Array, key: string) => Promise<string | null>
}

export function shipmentStorageKey(orderId: string, trackingNumber: string): string {
  return `labels/${orderId}/${labelFileName(trackingNumber)}`
}

export function orderRefOf(orderId: string): string {
  return orderId.slice(0, 8).toUpperCase()
}

export function addressToParcel(address: AddressRow): ParcelAddress {
  return {
    fullName: address.full_name,
    phone: address.phone,
    city: address.city,
    street: address.street,
    streetNumber: address.street_number,
    apartment: address.apartment,
    floor: address.floor,
    entrance: address.entrance,
    zip: address.zip,
    notes: address.notes_for_courier,
  }
}

/** The sender block for a platform-rendered label: the invoice issuer, or the brand alone. */
export function labelSender(source: NodeJS.ProcessEnv = process.env): {
  name: string
  addressLine: string
  phone: string | null
} {
  const issuer = resolveInvoiceIssuer(null, source)
  const phone = source.SHIPPING_SENDER_PHONE?.trim()
  return {
    name: issuer.businessName,
    addressLine: issuer.address ?? 'ישראל',
    phone: phone ? phone : null,
  }
}

async function archiveToR2(bytes: Uint8Array, key: string): Promise<string | null> {
  try {
    // Dynamic for the same reason invoices.ts does it: `lib/storage/r2` is
    // server-only and this module is reached from action tests.
    const { createR2PresignedPutUrl, isR2Configured, r2PublicUrl } = await import(
      '@/lib/storage/r2'
    )
    if (!isR2Configured()) return null
    const { uploadUrl, publicUrl } = await createR2PresignedPutUrl(key)
    const put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf' },
      body: bytes as unknown as BodyInit,
    })
    if (!put.ok) {
      log.warn('shipments.archive_failed', { key, status: put.status })
      return null
    }
    return publicUrl || r2PublicUrl(key)
  } catch (error) {
    log.warn('shipments.archive_threw', {
      key,
      reason: error instanceof Error ? error.message : 'unknown',
    })
    return null
  }
}

async function readWeights(
  admin: AdminClient,
  productIds: string[],
): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>()
  if (productIds.length === 0) return out
  const { data, error } = await admin
    .from('products')
    .select('id, weight_grams' as never)
    .in('id', productIds)
  if (error) {
    if (error.code !== UNDEFINED_COLUMN) {
      log.warn('shipments.weights_read_failed', { reason: error.message })
    }
    return out
  }
  for (const row of (data ?? []) as unknown as { id: string; weight_grams: number | null }[]) {
    out.set(row.id, row.weight_grams)
  }
  return out
}

function lineTotalAgorot(value: number | string | null): Agorot {
  if (value === null || value === undefined) return agorot(0)
  try {
    return parseIls(String(value))
  } catch {
    return agorot(0)
  }
}

export async function createShipmentForOrder(
  admin: AdminClient,
  input: CreateShipmentInput,
  deps: CreateShipmentDeps = {},
): Promise<CreateShipmentResult> {
  const env = deps.env ?? loadShippingEnv()
  const provider = deps.provider ?? getCarrierProvider(input.carrierId, env)
  const archive = deps.archive ?? archiveToR2
  const now = input.now ?? new Date()
  const service = carrierService(input.carrierId, input.serviceCode)

  const { data: orderData, error: orderError } = await admin
    .from('orders')
    .select(
      'id, status, user_id, address_id, order_items(id, product_type, item_status, quantity, product_id, total_price_ils)',
    )
    .eq('id', input.orderId)
    .is('deleted_at', null)
    .maybeSingle()
  if (orderError) {
    log.error('shipments.order_read_failed', { orderId: input.orderId, reason: orderError.message })
    return { ok: false, code: 'WRITE', error: 'קריאת ההזמנה נכשלה.' }
  }
  if (!orderData) return { ok: false, code: 'NOT_FOUND', error: 'ההזמנה לא נמצאה.' }
  const order = orderData as unknown as OrderRow
  const lines = Array.isArray(order.order_items) ? order.order_items : []

  const pending = lines.filter((l) => l.product_type === 'physical' && l.item_status === 'pending')
  if (pending.length === 0) {
    return {
      ok: false,
      code: 'NO_LINES',
      error: lines.some((l) => l.product_type === 'physical')
        ? 'כל שורות המוצר הפיזי כבר נשלחו.'
        : 'אין בהזמנה שורות מוצר פיזי לשליחה.',
    }
  }
  const verdict = planTransition({
    verb: 'ship',
    productType: 'physical',
    itemStatus: 'pending',
    orderStatus: order.status,
  })
  if (!verdict.ok) return { ok: false, code: 'NOT_ALLOWED', error: verdict.reason }

  if (!order.address_id) {
    return { ok: false, code: 'NO_ADDRESS', error: 'להזמנה אין כתובת למשלוח.' }
  }
  const { data: addressData, error: addressError } = await admin
    .from('user_addresses')
    .select(
      'full_name, phone, city, street, street_number, apartment, floor, entrance, zip, notes_for_courier',
    )
    .eq('id', order.address_id)
    .maybeSingle()
  if (addressError || !addressData) {
    return { ok: false, code: 'NO_ADDRESS', error: 'כתובת המשלוח לא נמצאה.' }
  }
  const destination = addressToParcel(addressData as AddressRow)

  const weights = await readWeights(
    admin,
    pending.map((l) => l.product_id).filter((id): id is string => Boolean(id)),
  )
  const parcel = {
    weightGrams: estimateParcelWeightGrams(
      pending.map((l) => ({
        quantity: l.quantity,
        weightGrams: l.product_id ? (weights.get(l.product_id) ?? null) : null,
      })),
    ),
    declaredValueAgorot: declaredValueAgorot(
      pending.map((l) => lineTotalAgorot(l.total_price_ils)),
    ),
    pieces: Math.max(
      1,
      pending.reduce((n, l) => n + Math.max(0, Math.trunc(l.quantity)), 0),
    ),
  }
  const orderRef = orderRefOf(order.id)

  let created: CreatedLabel
  try {
    created = await provider.createLabel({
      carrierId: input.carrierId,
      serviceCode: service.code,
      orderId: order.id,
      orderRef,
      destination,
      parcel,
      quoteRef: null,
    })
  } catch (error) {
    const kind = error instanceof CarrierError ? error.kind : 'network'
    log.warn('shipments.carrier_failed', {
      orderId: order.id,
      carrier: input.carrierId,
      kind,
      reason: error instanceof Error ? error.message : 'unknown',
    })
    return {
      ok: false,
      code: 'CARRIER',
      error:
        kind === 'auth'
          ? 'חברת המשלוחים דחתה את פרטי החיבור. אפשר להזין מספר מעקב ידנית.'
          : 'חברת המשלוחים לא זמינה כרגע. אפשר להזין מספר מעקב ידנית.',
    }
  }

  // The fact the customer reads, on the table that exists.
  const nowIso = now.toISOString()
  const lineIds = pending.map((l) => l.id)
  const { data: moved, error: moveError } = await admin
    .from('order_items')
    .update({
      item_status: 'shipped',
      shipped_at: nowIso,
      carrier: legacyCarrierText(input.carrierId),
      tracking_number: created.trackingNumber,
    } as never)
    .in('id', lineIds)
    .eq('item_status', 'pending')
    .select('id')
  if (moveError) {
    log.error('shipments.lines_update_failed', { orderId: order.id, reason: moveError.message })
    return { ok: false, code: 'WRITE', error: 'התווית נוצרה אך עדכון השורות נכשל. נסו שוב.' }
  }
  const movedIds = ((moved ?? []) as { id: string }[]).map((r) => r.id)
  if (movedIds.length === 0) {
    return { ok: false, code: 'WRITE', error: 'השורות השתנו בינתיים. רענן ונסה שוב.' }
  }

  const labelPdf =
    created.labelPdf ??
    (await renderShippingLabelPdf({
      carrierId: input.carrierId,
      serviceCode: service.code,
      trackingNumber: created.trackingNumber,
      orderRef,
      recipient: destination,
      sender: labelSender(),
      weightGrams: parcel.weightGrams,
      pieces: parcel.pieces,
      createdAt: now,
    }))
  const key = shipmentStorageKey(order.id, created.trackingNumber)
  const labelUrl = await archive(labelPdf, key)

  let shipmentId: string | null = null
  let stored = false
  const { data: inserted, error: insertError } = await admin
    .from('shipments' as never)
    .insert({
      order_id: order.id,
      carrier_id: input.carrierId,
      service_code: service.code,
      provider_kind: provider.kind,
      status: 'label_created',
      tracking_number: created.trackingNumber,
      provider_shipment_id: created.providerShipmentId,
      label_url: labelUrl,
      label_key: labelUrl ? key : null,
      carrier_cost_agorot: created.carrierCostAgorot,
      shopper_agorot: 0,
      weight_grams: parcel.weightGrams,
      pieces: parcel.pieces,
      order_item_ids: movedIds,
      events: [{ at: nowIso, status: 'label_created', description: 'תווית נוצרה', location: null }],
      provider_response: created.raw ?? null,
      last_event_at: nowIso,
      created_by: input.actorId,
    } as never)
    .select('id')
    .maybeSingle()
  if (insertError) {
    if (MISSING_TABLE.has(insertError.code ?? '')) {
      log.info('shipments.table_missing', { orderId: order.id, migration: 258 })
    } else {
      log.warn('shipments.insert_failed', { orderId: order.id, reason: insertError.message })
    }
  } else if (inserted) {
    shipmentId = (inserted as { id: string }).id
    stored = true
  }

  await writeAuditLog({
    actorId: input.actorId ?? undefined,
    actorRole: input.actorRole ?? undefined,
    action: 'status_change',
    entityType: 'orders',
    entityId: order.id,
    changes: {
      item_status: { from: 'pending', to: 'shipped' },
      lines: movedIds,
      carrier: input.carrierId,
      service: service.code,
      tracking_number: created.trackingNumber,
    },
    metadata: {
      source: 'carrier_label',
      provider: provider.kind,
      shipment_id: shipmentId,
      stored,
    },
  } as never)

  const shipments = lines
    .filter((l) => l.product_type === 'physical')
    .map((l) =>
      movedIds.includes(l.id)
        ? { carrier: legacyCarrierText(input.carrierId), tracking_number: created.trackingNumber }
        : { carrier: null, tracking_number: null },
    )
  const outcome = await enqueueShippedNotifications(admin, {
    orderId: order.id,
    userId: order.user_id,
    addressId: order.address_id,
    itemCount: lines.length,
    shipments,
  })

  return {
    ok: true,
    shipmentId,
    carrierId: input.carrierId,
    serviceCode: service.code,
    trackingNumber: created.trackingNumber,
    labelPdf,
    labelUrl,
    linesShipped: movedIds.length,
    stored,
    notified: outcome.email === 'queued' || outcome.whatsapp === 'queued',
    providerKind: provider.kind,
  }
}
