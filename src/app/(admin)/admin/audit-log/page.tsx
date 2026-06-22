import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'לוג פעילות' }

const ACTION_LABELS: Record<string, string> = {
  INSERT: 'יצירה',
  UPDATE: 'עדכון',
  DELETE: 'מחיקה',
}

const ACTION_COLORS: Record<string, string> = {
  INSERT: 'bg-green-100 text-green-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700',
}

const ENTITY_LABELS: Record<string, string> = {
  products: 'מוצרים',
  categories: 'קטגוריות',
  vendors: 'ספקים',
  profiles: 'משתמשים',
  coupons: 'קופונים',
}

export default async function AuditLogPage() {
  const supabase = await createClient()
  const { data: logs } = await supabase
    .from('admin_audit_log')
    .select('*, profiles(full_name, email)')
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">לוג פעילות</h1>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-right text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
              <th className="px-5 py-3 font-medium">פעולה</th>
              <th className="px-5 py-3 font-medium">ישות</th>
              <th className="px-5 py-3 font-medium">מזהה</th>
              <th className="px-5 py-3 font-medium">משתמש</th>
              <th className="px-5 py-3 font-medium">תאריך</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(logs ?? []).map((log) => {
              const profile = Array.isArray(log.profiles) ? log.profiles[0] : log.profiles
              return (
                <tr key={log.id} className="hover:bg-gray-50 transition-colors align-top">
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                        ACTION_COLORS[log.action] ?? 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {ACTION_LABELS[log.action] ?? log.action}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-700">
                    {ENTITY_LABELS[log.entity_type] ?? log.entity_type}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-gray-400">
                    {log.entity_id ? `${log.entity_id.slice(0, 8)}…` : '—'}
                  </td>
                  <td className="px-5 py-3 text-gray-600">
                    {profile?.full_name ?? profile?.email ?? log.user_id?.slice(0, 8) ?? '—'}
                  </td>
                  <td className="px-5 py-3 text-gray-500 text-xs whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString('he-IL')}
                  </td>
                </tr>
              )
            })}
            {!logs?.length && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-gray-400">
                  אין פעולות רשומות
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
