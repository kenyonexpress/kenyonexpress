import ContactRequestForm from '@/components/supplier/ContactRequestForm'
import WithdrawContactRequest from '@/components/supplier/WithdrawContactRequest'
import { formatDate } from '@/lib/account/format'
import { t } from '@/lib/i18n/messages'
import { createAdminClient } from '@/lib/supabase/admin'
import { CONTACT_FIELD_LABEL_HE, isContactField } from '@/lib/supplier/contact-fields'
import { requireSupplierRole } from '@/lib/supplier/rbac'
import { getSupplierContactRequests } from '@/server/queries/supplier'

export const metadata = { title: t('supplier.settingsTitle') }

const STATUS_LABEL_HE: Record<string, string> = {
  pending: 'ממתינה',
  approved: 'אושרה',
  rejected: 'נדחתה',
  withdrawn: 'בוטלה',
}

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-900',
  approved: 'bg-green-100 text-green-900',
  rejected: 'bg-red-100 text-red-900',
  withdrawn: 'bg-gray-100 text-gray-700',
}

/**
 * "Contact details edit request form (admin approves)" -- section 28's last
 * item, and the one thing in it that had no code anywhere.
 *
 * OWNER-GATED, matching 225's INSERT policy. A manager who could open this page
 * would fill the form in and be refused by RLS with no rows and no reason.
 *
 * The current values are read HERE with the service role rather than in the
 * client component, so nothing about the shop's own row travels to the browser
 * beyond the seven contact strings the supplier is already allowed to edit.
 */
export default async function SupplierSettingsPage() {
  const session = await requireSupplierRole('owner', '/supplier/settings')

  const admin = createAdminClient()
  const [{ data: supplier }, requests] = await Promise.all([
    admin
      .from('suppliers')
      .select('contact_name, contact_email, contact_phone, whatsapp, address, city, website')
      .eq('id', session.supplierId)
      .maybeSingle(),
    getSupplierContactRequests(session.supplierId),
  ])

  const current = (supplier ?? {}) as Record<string, string | null>

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold text-heading">{t('supplier.settingsTitle')}</h1>
        <p className="mt-1 text-sm text-gray-500">
          פרטי הקשר מתעדכנים דרך בקשה שאנחנו מאשרים, כדי שלא ישתנו בטעות פרטים שהתשלומים וההזמנות
          מסתמכים עליהם. שם העסק ומספר ח.פ. אינם ניתנים לעדכון כאן.
        </p>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-bold text-heading">{t('supplier.requestHeading')}</h2>
        <div className="mt-3">
          <ContactRequestForm current={current} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-heading">{t('supplier.requestHistoryHeading')}</h2>
        {requests.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-500">
            עדיין לא הגשתם בקשות.
          </p>
        ) : (
          <ul className="space-y-2">
            {requests.map((request) => (
              <li
                key={request.id}
                className="rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-heading">
                      {isContactField(request.field)
                        ? CONTACT_FIELD_LABEL_HE[request.field]
                        : request.field}
                    </p>
                    <p className="mt-1 text-sm text-gray-700">
                      <span dir="ltr">{request.currentValue || '—'}</span>
                      {' ← '}
                      <span dir="ltr" className="font-semibold">
                        {request.requestedValue}
                      </span>
                    </p>
                    {request.note ? (
                      <p className="mt-1 text-xs text-gray-500">הערה: {request.note}</p>
                    ) : null}
                    {request.decisionNote ? (
                      <p className="mt-1 text-xs text-gray-500">תשובה: {request.decisionNote}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-gray-400">{formatDate(request.createdAt)}</p>
                  </div>
                  <div className="shrink-0 space-y-2 text-end">
                    <span
                      className={`inline-block rounded-full px-2 py-1 text-xs font-semibold ${
                        STATUS_STYLE[request.status] ?? 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {STATUS_LABEL_HE[request.status] ?? request.status}
                    </span>
                    {request.status === 'pending' ? (
                      <WithdrawContactRequest requestId={request.id} />
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
