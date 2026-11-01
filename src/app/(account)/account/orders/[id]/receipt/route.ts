import { resolveInvoiceIssuer } from '@/lib/invoices/issuer'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import {
  OrderNotPaidError,
  buildOrderReceipt,
  receiptFileName,
  renderOrderReceiptPdf,
} from '@/lib/orders/receipt-pdf'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getOrderDetail } from '@/server/queries/orders'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * The customer's order confirmation as a PDF, behind their own session.
 *
 * Same door as `../invoice`: the session is checked on every request and
 * `getOrderDetail` filters on the owner, so a foreign id is a 404 that cannot
 * be told apart from an order that does not exist. Unlike the invoice route
 * there is nothing to redirect to: the document is rendered here, from the
 * same read the order page shows, and served as an attachment that no shared
 * cache may keep.
 *
 * An unpaid order is 404 and not 500. Nothing is broken; there is simply no
 * payment to confirm yet, and the return page is still polling for it.
 */
async function handleGET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(
      new URL(
        `/login?next=${encodeURIComponent(`/account/orders/${id}`)}`,
        process.env.NEXT_PUBLIC_APP_URL ?? 'https://kenyonexpress.co.il',
      ),
    )
  }

  const order = await getOrderDetail(id)
  if (!order) return new NextResponse('לא נמצא', { status: 404 })
  if (!order.paidAt) return new NextResponse('ההזמנה עדיין לא שולמה', { status: 404 })

  const admin = createAdminClient()
  let shippingAddress: Parameters<typeof buildOrderReceipt>[1]['shippingAddress'] = null
  if (order.addressId) {
    const { data, error } = await admin
      .from('user_addresses')
      .select('full_name, phone, street, street_number, apartment, floor, city, zip')
      .eq('id', order.addressId)
      .eq('user_id', user.id)
      .maybeSingle()
    // The address is a courtesy line on the document, not its subject. A
    // failed read is logged and the receipt prints without it, rather than
    // denying the shopper their confirmation over a column.
    if (error) log.warn('receipt.address_read_failed', { orderId: id, message: error.message })
    shippingAddress = data ?? null
  }

  let bytes: Uint8Array
  try {
    const receipt = buildOrderReceipt(order, {
      issuer: resolveInvoiceIssuer('platform'),
      customer: {
        name:
          shippingAddress?.full_name ??
          (typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : null),
        email: user.email ?? null,
        phone: shippingAddress?.phone ?? user.phone ?? null,
      },
      shippingAddress,
    })
    bytes = await renderOrderReceiptPdf(receipt)
  } catch (error) {
    if (error instanceof OrderNotPaidError) {
      return new NextResponse('ההזמנה עדיין לא שולמה', { status: 404 })
    }
    throw error
  }

  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${receiptFileName(id)}"`,
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': 'private, no-store',
    },
  })
}

export const GET = withRequestLog('/account/orders/[id]/receipt', handleGET)
