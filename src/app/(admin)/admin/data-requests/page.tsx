/**
 * Admin page for data requests (exports and deletions)
 * Path: /app/(admin)/admin/data-requests/page.tsx
 */

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export const metadata = {
  title: 'Data Requests - Admin',
  description: 'Manage user data exports and deletion requests',
}

export default async function DataRequestsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const { data: exports } = await supabase
    .from('pending_exports')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  const { data: deletions } = await supabase
    .from('pending_deletions')
    .select('*')
    .order('requested_at', { ascending: false })
    .limit(100)

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-8">Data Requests</h1>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-blue-50 p-4 rounded">
          <div className="text-2xl font-bold text-blue-600">{exports?.length || 0}</div>
          <div className="text-sm text-gray-600">Active Exports</div>
        </div>
        <div className="bg-yellow-50 p-4 rounded">
          <div className="text-2xl font-bold text-yellow-600">
            {deletions?.filter((d: any) => d.status === 'requested').length || 0}
          </div>
          <div className="text-sm text-gray-600">Pending Deletions</div>
        </div>
        <div className="bg-orange-50 p-4 rounded">
          <div className="text-2xl font-bold text-orange-600">
            {deletions?.filter((d: any) => d.status === 'grace_period').length || 0}
          </div>
          <div className="text-sm text-gray-600">In Grace Period</div>
        </div>
        <div className="bg-gray-50 p-4 rounded">
          <div className="text-2xl font-bold text-gray-600">
            {deletions?.filter((d: any) => d.status === 'anonymized').length || 0}
          </div>
          <div className="text-sm text-gray-600">Anonymized</div>
        </div>
      </div>

      <div className="space-y-8">
        <div>
          <h2 className="text-xl font-semibold mb-4">Data Export Requests</h2>
          {!exports?.length ? (
            <div className="bg-gray-50 p-8 rounded text-center text-gray-600">
              No pending exports
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">User ID</th>
                    <th className="px-4 py-2 text-left font-medium">Created</th>
                    <th className="px-4 py-2 text-left font-medium">Expires</th>
                    <th className="px-4 py-2 text-left font-medium">Downloaded</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {exports.map((exp: any) => (
                    <tr key={exp.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono text-xs">{exp.user_id.slice(0, 8)}...</td>
                      <td className="px-4 py-2">{new Date(exp.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-2">{new Date(exp.expires_at).toLocaleDateString()}</td>
                      <td className="px-4 py-2">{exp.downloaded_at ? '✓' : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-4">Deletion Requests</h2>
          {!deletions?.length ? (
            <div className="bg-gray-50 p-8 rounded text-center text-gray-600">
              No pending deletions
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">User ID</th>
                    <th className="px-4 py-2 text-left font-medium">Status</th>
                    <th className="px-4 py-2 text-left font-medium">Requested</th>
                    <th className="px-4 py-2 text-left font-medium">Delete In</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {deletions.map((del: any) => {
                    const daysLeft = del.scheduled_delete_at
                      ? Math.ceil(
                          (new Date(del.scheduled_delete_at).getTime() - new Date().getTime()) /
                            (1000 * 60 * 60 * 24),
                        )
                      : null
                    return (
                      <tr key={del.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-mono text-xs">
                          {del.user_id.slice(0, 8)}...
                        </td>
                        <td className="px-4 py-2">
                          <span className="px-2 py-1 rounded text-xs bg-yellow-100">
                            {del.status}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          {new Date(del.requested_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-2">{daysLeft ? `${daysLeft}d` : '-'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
