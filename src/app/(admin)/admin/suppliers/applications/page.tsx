import ApplicationReviewRow from '@/components/admin/ApplicationReviewRow'
import { requireSection } from '@/lib/admin/rbac'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { bankByCode, maskedAccount } from '@/lib/suppliers/bank-account'

export const metadata = { title: 'בקשות הצטרפות' }

const MISSING = new Set(['42P01', 'PGRST205', 'PGRST204', '42703'])

type ApplicationRow = {
  id: string
  business_name: string
  business_id: string
  legal_form: string
  contact_name: string
  email: string
  phone: string
  city: string
  website: string | null
  category: string | null
  status: string
  submitted_at: string | null
  bank_code: string | null
  bank_branch: string | null
  bank_last4: string | null
}

type DocumentRow = { application_id: string; kind: string; original_name: string | null }

/**
 * The approval console.
 *
 * WHAT THE OPERATOR IS ACTUALLY DECIDING, and the page is laid out to say so:
 * the company number sits NEXT TO the certificate rather than under a green
 * tick, because the check digit only proves the number is well-formed and the
 * document is the only thing that proves the business exists. A validator that
 * returns true is the easiest thing in an onboarding flow to read as
 * "verified", so this page never renders it as one.
 *
 * THE BANK ACCOUNT IS NOT ON THIS PAGE and cannot be. It is a vault secret, and
 * 204 deliberately ships no read function - what shows is the bank, the branch
 * and the last four, which is what somebody needs to match against the
 * אישור ניהול חשבון and is not enough to move money.
 */
export default async function SupplierApplicationsPage() {
  await requireSection('suppliers', 'read')

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('supplier_applications')
    .select(
      'id, business_name, business_id, legal_form, contact_name, email, phone, city, website, category, status, submitted_at, bank_code, bank_branch, bank_last4',
    )
    .in('status', ['submitted', 'in_review'])
    .order('submitted_at', { ascending: true })
    .limit(100)

  if (error && MISSING.has(error.code ?? '')) {
    return (
      <div dir="rtl" className="space-y-6 p-6">
        <h1 className="text-2xl font-bold">בקשות הצטרפות</h1>
        <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
          הטבלאות של תהליך ההצטרפות עדיין לא הוחלו. הקובץ ממתין ב-
          <code>migrations/pending/204_supplier_onboarding.sql</code>, ואומת מול פרודקשן בתוך בלוק
          שהתגלגל אחורה.
        </p>
      </div>
    )
  }

  const applications = (data ?? []) as unknown as ApplicationRow[]

  const { data: documentData, error: documentError } = await admin
    .from('supplier_application_documents')
    .select('application_id, kind, original_name')
    .in(
      'application_id',
      applications.map((application) => application.id),
    )
  // A read that FAILED is not "no documents uploaded", and on this page the
  // difference decides an approval: the checklist below marks a missing bank
  // confirmation, so an unreadable table would tell the operator that every
  // applicant is missing every document.
  if (documentError && !MISSING.has(documentError.code ?? '')) {
    log.error('admin.application_documents_read_failed', { reason: documentError.message })
  }
  const documents = (documentData ?? []) as unknown as DocumentRow[]
  const documentsUnreadable = Boolean(documentError)

  return (
    <div dir="rtl" className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">בקשות הצטרפות</h1>
        <p className="mt-1 text-sm text-gray-600">
          <strong>אישור יוצר את הספק.</strong> עד לרגע הזה אין שורה ב-<code>suppliers</code>, ולכן
          מבקש שטרם אושר אינו יכול להופיע במדריך, בבוררי האדמין, בשער הפרסום או בהרצת התשלומים. ספרת
          הביקורת של מספר העסק בודקת שהמספר תקין בצורתו, <strong>לא שהעסק קיים</strong>. את זה מוכיח
          המסמך.
        </p>
      </header>

      {documentsUnreadable && (
        <p className="rounded-lg bg-red-50 p-4 text-sm text-red-900">
          לא ניתן לקרוא את רשימת המסמכים. <strong>אל תאשרו בקשה על סמך המסך הזה</strong>, הרשימה
          למטה תיראה ריקה גם אם הועלו מסמכים.
        </p>
      )}

      {applications.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-gray-500">
          אין בקשות ממתינות.
        </p>
      ) : (
        <ul className="space-y-4">
          {applications.map((application) => {
            const bank = application.bank_code ? bankByCode(application.bank_code) : undefined
            return (
              <ApplicationReviewRow
                key={application.id}
                id={application.id}
                businessName={application.business_name}
                businessId={application.business_id}
                legalForm={application.legal_form}
                contactName={application.contact_name}
                email={application.email}
                phone={application.phone}
                city={application.city}
                website={application.website}
                category={application.category}
                status={application.status}
                submittedAt={application.submitted_at}
                bankLine={
                  bank && application.bank_branch && application.bank_last4
                    ? maskedAccount(bank.name, application.bank_branch, application.bank_last4)
                    : null
                }
                documents={documents
                  .filter((document) => document.application_id === application.id)
                  .map((document) => ({
                    kind: document.kind,
                    name: document.original_name,
                  }))}
              />
            )
          })}
        </ul>
      )}
    </div>
  )
}
