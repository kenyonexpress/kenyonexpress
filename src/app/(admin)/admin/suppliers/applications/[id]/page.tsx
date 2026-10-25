import { requireSection } from '@/lib/admin/rbac'
import { getSupplierApplicationDetails } from '@/lib/supplier-onboarding'
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import { notFound } from 'next/navigation'
import ApplicationReviewActions from './ApplicationReviewActions'

export const metadata = { title: 'סקירת בקשת ספק | Admin' }

interface Props {
  params: Promise<{ id: string }>
}

export default async function ApplicationReviewPage({ params }: Props) {
  await requireSection('suppliers', 'write')

  const { id } = await params
  const { application, agreement } = await getSupplierApplicationDetails(id)

  if (!application) {
    notFound()
  }

  const profiles = application.profiles as unknown as { full_name: string; email: string } | null

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">סקירת בקשת ספק</h1>
        <p className="text-xs text-gray-500 mt-0.5">בדוק/י את הפרטים ואשר/י או דחה/י</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">פרטי הבקשה</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500 mb-1">שם העסק</p>
              <p className="text-sm font-medium text-gray-900">{application.business_name}</p>
            </div>

            <div>
              <p className="text-xs text-gray-500 mb-1">איש קשר</p>
              <p className="text-sm font-medium text-gray-900">{application.contact_name}</p>
            </div>

            <div>
              <p className="text-xs text-gray-500 mb-1">טלפון</p>
              <p className="text-sm font-medium text-gray-900" dir="ltr">
                {application.contact_phone}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-500 mb-1">אימייל</p>
              <p className="text-sm font-medium text-gray-900" dir="ltr">
                {application.contact_email}
              </p>
            </div>

            {application.business_id && (
              <div>
                <p className="text-xs text-gray-500 mb-1">ח.פ / עוסק מורשה</p>
                <p className="text-sm font-medium text-gray-900">{application.business_id}</p>
              </div>
            )}

            {application.city && (
              <div>
                <p className="text-xs text-gray-500 mb-1">עיר</p>
                <p className="text-sm font-medium text-gray-900">{application.city}</p>
              </div>
            )}

            <div>
              <p className="text-xs text-gray-500 mb-1">תאריך הגשה</p>
              <p className="text-sm font-medium text-gray-900">
                {new Date(application.created_at).toLocaleDateString('he-IL', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>

            {profiles && (
              <div>
                <p className="text-xs text-gray-500 mb-1">משתמש מגיש</p>
                <p className="text-sm font-medium text-gray-900">{profiles.full_name}</p>
                <p className="text-xs text-gray-500" dir="ltr">
                  {profiles.email}
                </p>
              </div>
            )}
          </div>

          {application.business_summary && (
            <div className="mt-4">
              <p className="text-xs text-gray-500 mb-1">תיאור העסק</p>
              <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">
                {application.business_summary}
              </p>
            </div>
          )}
        </div>

        {agreement && (
          <div className="border-t border-gray-200 pt-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">פרטי אימות והסכמה</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500 mb-1">מספר טרמינל Cardcom</p>
                <p className="text-sm font-medium text-gray-900">{agreement.cardcom_terminal_id}</p>
              </div>

              <div>
                <p className="text-xs text-gray-500 mb-1">גרסת הסכם</p>
                <p className="text-sm font-medium text-gray-900">{agreement.agreement_version}</p>
              </div>

              <div>
                <p className="text-xs text-gray-500 mb-1">תאריך אישור הסכם</p>
                <p className="text-sm font-medium text-gray-900">
                  {new Date(agreement.accepted_at).toLocaleDateString('he-IL', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>

              <div>
                <p className="text-xs text-gray-500 mb-1">IP</p>
                <p className="text-sm font-medium text-gray-900" dir="ltr">
                  {agreement.accepted_ip}
                </p>
              </div>

              <div>
                <p className="text-xs text-gray-500 mb-1">סטטוס אימות כרטיס</p>
                <div className="flex items-center gap-2">
                  {agreement.verification_status === 'verified' ? (
                    <>
                      <CheckCircle2 size={16} className="text-green-600" />
                      <span className="text-sm font-medium text-green-700">אומת</span>
                    </>
                  ) : agreement.verification_status === 'failed' ? (
                    <>
                      <XCircle size={16} className="text-red-600" />
                      <span className="text-sm font-medium text-red-700">נכשל</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle size={16} className="text-amber-600" />
                      <span className="text-sm font-medium text-amber-700">ממתין</span>
                    </>
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs text-gray-500 mb-1">סטטוס אימות אימייל</p>
                <div className="flex items-center gap-2">
                  {agreement.email_verified_at ? (
                    <>
                      <CheckCircle2 size={16} className="text-green-600" />
                      <span className="text-sm font-medium text-green-700">אומת</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle size={16} className="text-amber-600" />
                      <span className="text-sm font-medium text-amber-700">ממתין לאימות</span>
                    </>
                  )}
                </div>
              </div>

              {agreement.verification_charge_id && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">מזהה חיוב Cardcom</p>
                  <p className="text-sm font-medium text-gray-900" dir="ltr">
                    {agreement.verification_charge_id}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="border-t border-gray-200 pt-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">פעולות</h2>

          <ApplicationReviewActions applicationId={application.id} />
        </div>
      </div>
    </div>
  )
}
