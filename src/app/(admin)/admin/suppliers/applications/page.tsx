import { requireSection } from '@/lib/admin/rbac'
import { getPendingSupplierApplications } from '@/lib/supplier-onboarding'
import { Clock } from 'lucide-react'
import Link from 'next/link'

export const metadata = { title: 'בקשות ספקים ממתינות | Admin' }

export default async function SupplierApplicationsPage() {
  await requireSection('suppliers', 'write')

  const applications = await getPendingSupplierApplications()

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">בקשות ספקים ממתינות</h1>
        <p className="text-xs text-gray-500 mt-0.5">בדיקה ואישור/דחייה של בקשות להצטרפות כספקים</p>
      </div>

      {applications.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <Clock className="mx-auto text-gray-300 mb-4" size={48} />
          <p className="text-gray-500">אין בקשות ממתינות</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-start text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
                <th className="px-5 py-3 font-medium text-start">שם העסק</th>
                <th className="px-5 py-3 font-medium text-start">איש קשר</th>
                <th className="px-5 py-3 font-medium text-start">טלפון</th>
                <th className="px-5 py-3 font-medium text-start">אימייל</th>
                <th className="px-5 py-3 font-medium text-start">תאריך הגשה</th>
                <th className="px-5 py-3 font-medium text-start">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {applications.map((app) => (
                <tr key={app.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 font-medium text-gray-900">{app.business_name}</td>
                  <td className="px-5 py-3 text-gray-700">{app.contact_name}</td>
                  <td className="px-5 py-3 text-gray-600" dir="ltr">
                    {app.contact_phone}
                  </td>
                  <td className="px-5 py-3 text-gray-600" dir="ltr">
                    {app.contact_email}
                  </td>
                  <td className="px-5 py-3 text-gray-600">
                    {new Date(app.created_at).toLocaleDateString('he-IL')}
                  </td>
                  <td className="px-5 py-3">
                    <Link
                      href={`/admin/suppliers/applications/${app.id}`}
                      className="text-brand hover:underline font-medium"
                    >
                      סקירה
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
