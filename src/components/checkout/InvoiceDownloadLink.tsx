import { t } from '@/lib/i18n/messages'
import {
  InvoiceLinkSecretMissingError,
  invoiceDownloadPath,
  signInvoiceLink,
} from '@/lib/invoices/download-token'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOrderInvoice } from '@/server/payments/invoices'

/**
 * "For the tax invoice/receipt, click here to download."
 *
 * Rendered on the thank-you page and the order page. It is a plain link to a
 * signed, expiring download route; it is never emailed or messaged on its own,
 * and nothing about rendering it sends anything. Reads at request time, so it
 * must sit inside a Suspense boundary or a dynamic page, like its callers.
 */
export default async function InvoiceDownloadLink({ orderId }: { orderId: string }) {
  const invoice = await getOrderInvoice(createAdminClient(), orderId).catch(() => null)

  if (!invoice?.documentUrl) {
    return (
      <p className="checkout-success__sub" data-testid="invoice-pending">
        {t('invoice.pending')}
      </p>
    )
  }

  let href: string
  try {
    href = invoiceDownloadPath(orderId, signInvoiceLink(orderId))
  } catch (error) {
    if (!(error instanceof InvoiceLinkSecretMissingError)) throw error
    log.error('invoice.link.secret_missing', { orderId })
    return null
  }

  return (
    <p className="checkout-success__sub">
      <a href={href} download data-testid="invoice-download" style={{ fontWeight: 600 }}>
        {t('invoice.downloadCta')}
      </a>
    </p>
  )
}
