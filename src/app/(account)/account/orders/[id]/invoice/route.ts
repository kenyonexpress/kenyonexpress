import { CacheControl } from '@/lib/cache/http'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getOrderInvoice, renderIssuedInvoiceCopy } from '@/server/payments/invoices'
import { NextResponse } from 'next/server'

const PRIVATE = { 'cache-control': CacheControl.private } as const

/**
 * The customer's tax document, behind their own session.
 *
 * WHY A ROUTE AND NOT A LINK ON THE PAGE
 *
 * The stored URL points at the R2 archive, which is reachable by anyone
 * holding the string. Rendering it into the order page would publish a tax
 * document to everything that ever sees that HTML - a screenshot, a shared
 * browser, a stray referrer. This checks the signed-in user owns the order on
 * every request and only then redirects.
 *
 * WITHOUT AN ARCHIVE, THE DOCUMENT IS RENDERED HERE. R2 is not enabled on
 * this account (measured), so an issued row usually has no `document_url`.
 * The row still carries everything the document says - its number, its VAT
 * split, its issue date - and `renderIssuedInvoiceCopy` draws the same PDF
 * the issue path drew, marked "העתק", and serves it inline under the
 * customer's session with no shared cache allowed to keep it.
 *
 * The ownership check is a `user_id` filter on the order, not a comparison
 * after the fact, so a foreign id is 404 with no way to tell it apart from an
 * order that does not exist.
 */
export async function GET(
  _request: Request,
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
      { headers: PRIVATE },
    )
  }

  const admin = createAdminClient()
  const { data: order } = await admin
    .from('orders')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!order) return new NextResponse('לא נמצא', { status: 404, headers: PRIVATE })

  const invoice = await getOrderInvoice(admin, id)
  if (!invoice) {
    // Not issued yet: come back later. 404 rather than 500, because nothing
    // is broken.
    return new NextResponse('החשבונית עדיין לא הונפקה', { status: 404, headers: PRIVATE })
  }

  if (invoice.documentUrl) {
    // The archived original. A 307 with no Cache-Control is one a browser
    // may replay from history after logout, hence the private header.
    return NextResponse.redirect(invoice.documentUrl, { headers: PRIVATE })
  }

  const rendered = await renderIssuedInvoiceCopy(admin, invoice.id)
  if (!rendered) {
    return new NextResponse('החשבונית עדיין לא הונפקה', { status: 404, headers: PRIVATE })
  }
  return new NextResponse(Buffer.from(rendered.bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${rendered.fileName}"`,
      'Content-Length': String(rendered.bytes.byteLength),
      'Cache-Control': 'private, no-store',
    },
  })
}
