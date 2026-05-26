import { ROLE_LABELS } from '@/lib/admin/rbac'
import { requireAdminSession } from '@/lib/admin/rbac'
import { createClient } from '@/lib/supabase/server'
import type { UserRole } from '@/types/database'
import UserRoleClient from './UserRoleClient'

export const metadata = { title: 'משתמשים' }

const ROLE_BADGE_COLORS: Record<UserRole, string> = {
  customer: 'bg-gray-100 text-gray-600',
  vendor: 'bg-blue-100 text-blue-700',
  content_uploader: 'bg-purple-100 text-purple-700',
  admin: 'bg-orange-100 text-orange-700',
  super_admin: 'bg-red-100 text-red-700',
}

export default async function AdminUsersPage() {
  const { role: callerRole } = await requireAdminSession()
  const supabase = await createClient()

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, created_at')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">משתמשים</h1>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-right text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
              <th className="px-5 py-3 font-medium">משתמש</th>
              <th className="px-5 py-3 font-medium">אימייל</th>
              <th className="px-5 py-3 font-medium">תפקיד</th>
              <th className="px-5 py-3 font-medium">הצטרפות</th>
              <th className="px-5 py-3 font-medium">שינוי תפקיד</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(profiles ?? []).map((profile) => (
              <tr key={profile.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3 text-gray-800 font-medium">{profile.full_name ?? '—'}</td>
                <td className="px-5 py-3 text-gray-600">{profile.email}</td>
                <td className="px-5 py-3">
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                      ROLE_BADGE_COLORS[profile.role as UserRole] ?? 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {ROLE_LABELS[profile.role as UserRole] ?? profile.role}
                  </span>
                </td>
                <td className="px-5 py-3 text-gray-500 text-xs">
                  {new Date(profile.created_at).toLocaleDateString('he-IL')}
                </td>
                <td className="px-5 py-3">
                  <UserRoleClient
                    userId={profile.id}
                    currentRole={profile.role}
                    callerRole={callerRole}
                  />
                </td>
              </tr>
            ))}
            {!profiles?.length && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-gray-400">
                  אין משתמשים
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
