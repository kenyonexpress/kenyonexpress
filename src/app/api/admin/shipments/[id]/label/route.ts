import { canReadSection } from '@/lib/admin/permissions'
import { getSessionWithRole } from '@/lib/admin/rbac'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { isCarrierId } from '@/lib/shipping/carrier-registry'
import { labelFileName, renderShippingLabelPdf } from '@/lib/shipping/label-pdf'
import { createAdminClient } from '@/lib/supabase/admin'
import { addressToParcel, labelSender, orderRefOf } from '@/server/shipping/shipments'
import type { NextRequest } from 'next/server'
import { z } from 'zod'

/**
 * The shipping label, for an admin to print (STEP 43).
 *
 * A route and not a server action because the answer is a file. Archived
 * labels (R2 configured) redirect to the archive; otherwise the label is
 * rendered on demand from the shipment row and the order's address, which is
 * the state of every environment today. Admin-only: the label carries the
 * customer's name, phone and address.
 */

const MISSING_TABLE = new Set(['42P01', 'PGRST205'])

interface LabelRow {
  id: string
  order_id: string
  carrier_id: string
  service_code: string
  tracking_number: string
  label_url: string | null
  weight_grams: number
  pieces: number
  created_at: string
}

async function handleGET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getSessionWithRole()
  if (!session || !canReadSection(session.role, 'orders')) {
    return new Response('אין הרשאה', { status: 403 })
  }
  const { id } = await context.params
  if (!z.string().uuid().safeParse(id).success) {
    return new Response('משלוח לא תקין', { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('shipments' as never)
    .select(
      'id, order_id, carrier_id, service_code, tracking_number, label_url, weight_grams, pieces, created_at',
    )
    .eq('id', id)
    .maybeSingle()
  if (error) {
    const status = MISSING_TABLE.has(error.code ?? '') ? 404 : 503
    return new Response(status === 404 ? 'המשלוח לא נמצא' : 'קריאת המשלוח נכשלה', {
      status,
      headers: { 'cache-control': 'no-store' },
    })
  }
  if (!data) return new Response('המשלוח לא נמצא', { status: 404 })
  const row = data as unknown as LabelRow

  if (row.label_url) {
    return Response.redirect(row.label_url, 302)
  }
  if (!isCarrierId(row.carrier_id)) {
    return new Response('חברת משלוחים לא מוכרת', { status: 422 })
  }

  const { data: order, error: orderError } = await admin
    .from('orders')
    .select('id, address_id')
    .eq('id', row.order_id)
    .maybeSingle()
  if (orderError) return new Response('קריאת ההזמנה נכשלה', { status: 503 })
  const addressId = (order as { address_id: string | null } | null)?.address_id ?? null
  if (!addressId) return new Response('להזמנה אין כתובת', { status: 422 })
  const { data: address, error: addressError } = await admin
    .from('user_addresses')
    .select(
      'full_name, phone, city, street, street_number, apartment, floor, entrance, zip, notes_for_courier',
    )
    .eq('id', addressId)
    .maybeSingle()
  if (addressError) return new Response('קריאת הכתובת נכשלה', { status: 503 })
  if (!address) return new Response('כתובת המשלוח לא נמצאה', { status: 422 })

  const bytes = await renderShippingLabelPdf({
    carrierId: row.carrier_id,
    serviceCode: row.service_code,
    trackingNumber: row.tracking_number,
    orderRef: orderRefOf(row.order_id),
    recipient: addressToParcel(address),
    sender: labelSender(),
    weightGrams: row.weight_grams,
    pieces: row.pieces,
    createdAt: new Date(row.created_at),
  })
  log.info('shipments.label_rendered', { shipmentId: row.id, actor: session.userId })
  return new Response(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${labelFileName(row.tracking_number)}"`,
      'cache-control': 'private, no-store',
    },
  })
}

export const GET = withRequestLog('/api/admin/shipments/[id]/label', handleGET)
