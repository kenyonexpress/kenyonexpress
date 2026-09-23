import { t } from '@/lib/i18n/messages'
import { verifyInvoiceLink } from '@/lib/invoices/download-token'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOrderInvoice } from '@/server/payments/invoices'
import { NextResponse } from 'next/server'

/**
 * Downloads one order's tax invoice/receipt as a file, on a signed link.
 *
 * The link is rendered on the thank-you and order pages and nowhere else; this
 * route never sends it to anyone. The document is streamed through this origin
 * rather than redirected to, so the provider URL (openable by anyone holding
 * the string) is never handed to the browser.
 */
async function handleGET(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
): Promise<Response> {
  const { orderId } = await params
  const url = new URL(request.url)

  let verdict: ReturnType<typeof verifyInvoiceLink>
  try {
    verdict = verifyInvoiceLink(orderId, url.searchParams.get('exp'), url.searchParams.get('sig'))
  } catch (error) {
    // Secret missing: fail closed and say so loudly, but not to the visitor.
    log.error('invoice.download.secret_missing', { error: String(error) })
    return new NextResponse(t('invoice.unavailable'), { status: 503 })
  }
  if (verdict === 'expired') {
    return new NextResponse(t('invoice.linkExpired'), {
      status: 410,
    })
  }
  if (verdict !== 'ok') return new NextResponse(t('invoice.notFound'), { status: 404 })

  const invoice = await getOrderInvoice(createAdminClient(), orderId)
  if (!invoice?.documentUrl) {
    return new NextResponse(t('invoice.notIssued'), { status: 404 })
  }

  let upstream: Response
  try {
    const target = new URL(invoice.documentUrl)
    if (target.protocol !== 'https:') throw new Error('non-https document url')
    upstream = await fetch(target, { cache: 'no-store' })
  } catch (error) {
    log.error('invoice.download.fetch_failed', { orderId, error: String(error) })
    return new NextResponse(t('invoice.tryAgain'), { status: 502 })
  }
  if (!upstream.ok || !upstream.body) {
    log.error('invoice.download.upstream_status', { orderId, status: upstream.status })
    return new NextResponse(t('invoice.tryAgain'), { status: 502 })
  }

  const number = invoice.documentNumber?.replace(/[^\w-]/g, '') || orderId.slice(0, 8)
  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/pdf',
      'content-disposition': `attachment; filename="invoice-${number}.pdf"`,
      'cache-control': 'private, no-store',
      'x-robots-tag': 'noindex',
    },
  })
}

export const GET = withRequestLog('/api/invoices/[orderId]/download', handleGET)
