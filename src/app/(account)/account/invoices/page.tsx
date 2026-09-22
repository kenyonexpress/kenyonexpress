import BusinessInvoiceSettings from '@/components/account/BusinessInvoiceSettings'
import { formatDate, formatIls } from '@/lib/account/format'
import { t } from '@/lib/i18n/messages'
import { createClient } from '@/lib/supabase/server'
import { getInvoiceSettings } from '@/server/queries/invoice-settings'
import { getMyInvoices } from '@/server/queries/invoices'
import Link from 'next/link'

export const metadata = { title: t('account.invoices') }

function typeLabel(documentType: string): string {
  switch (documentType) {
    case 'coupon_receipt':
      return t('account.invoiceTypeCoupon')
    case 'credit_note':
      return t('account.invoiceTypeCredit')
    default:
      return t('account.invoiceTypeTax')
  }
}

/**
 * Every tax document behind the customer's orders, in one list (section 56).
 * The link goes through /account/orders/[id]/invoice, which re-checks
 * ownership on every request before redirecting to the provider's PDF, so
 * nothing here needs to hold the document URL itself.
 */
export default async function InvoicesPage() {
  const invoices = await getMyInvoices()
  const issued = invoices.filter((i) => i.status === 'issued')

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const settings = user
    ? await getInvoiceSettings(supabase, user.id)
    : { invoiceToBusiness: false, businessName: null, businessRegistrationNumber: null }

  return (
    <>
      <h1 className="account-title">{t('account.invoices')}</h1>
      <p className="account-subtitle">
        {issued.length} {t('account.invoicesCount')}
      </p>

      <BusinessInvoiceSettings
        invoiceToBusiness={settings.invoiceToBusiness}
        businessName={settings.businessName}
        businessRegistrationNumber={settings.businessRegistrationNumber}
      />

      <section className="account-card">
        {invoices.length === 0 ? (
          <p className="account-empty">{t('account.invoicesEmpty')}</p>
        ) : (
          invoices.map((invoice) => (
            <div className="account-row" key={invoice.id}>
              <div className="account-row__main">
                <p className="account-row__title">
                  {typeLabel(invoice.documentType)}
                  {invoice.documentNumber ? (
                    <span dir="ltr" className="ms-2 account-row__meta">
                      {invoice.documentNumber}
                    </span>
                  ) : null}
                </p>
                <p className="account-row__meta">
                  {formatDate(invoice.issuedAt ?? invoice.createdAt)} ·{' '}
                  {formatIls(invoice.totalAgorot)}
                  {invoice.vatAgorot > 0
                    ? ` · ${t('account.invoiceVat')} ${formatIls(invoice.vatAgorot)}`
                    : ''}
                  {' · '}
                  <span dir="ltr">{invoice.orderRef}</span>
                </p>
              </div>
              <div className="account-row__actions">
                {invoice.status === 'issued' && invoice.hasDocument ? (
                  <Link className="account-btn" href={`/account/orders/${invoice.orderId}/invoice`}>
                    {t('account.invoiceView')}
                  </Link>
                ) : (
                  <span className="account-chip account-chip--muted">
                    {t('account.invoicePending')}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </section>
    </>
  )
}
