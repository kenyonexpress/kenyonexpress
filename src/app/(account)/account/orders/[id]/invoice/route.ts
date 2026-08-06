import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getOrderInvoice } from '@/server/payments/invoices'
import { NextResponse } from 'next/server'

/**
 * The customer's tax document, behind their own session.
 *
 * WHY A ROUTE AND NOT A LINK ON THE PAGE
 *
 * The stored URL points at the provider or at the R2 mirror, and both are
 * reachable by anyone holding the string. Rendering it into the order page
 * would publish a tax document to everything that ever sees that HTML - a
 * screenshot, a shared browser, a stray referrer. This checks the signed-in
 * user owns the order on every request and only then redirects.
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
  if (!order) return new NextResponse('לא נמצא', { status: 404 })

  const invoice = await getOrderInvoice(admin, id)
  if (!invoice?.documentUrl) {
    // Issued-but-no-URL and not-yet-issued are the same thing to a reader: come
    // back later. 404 rather than 500, because nothing is broken.
    return new NextResponse('החשבונית עדיין לא הונפקה', { status: 404 })
  }

  return NextResponse.redirect(invoice.documentUrl)
}
