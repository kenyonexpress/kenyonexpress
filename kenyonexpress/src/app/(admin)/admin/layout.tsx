import AdminSidebar from '@/components/admin/AdminSidebar'
import { requireAdminSession } from '@/lib/admin/rbac'
import { ROLE_LABELS } from '@/lib/admin/rbac'
import { signOut } from '@/server/actions/auth'
import { LogOut } from 'lucide-react'
import Link from 'next/link'

export const metadata = { title: { template: '%s | ניהול KenyonExpress', default: 'ניהול' } }

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { role } = await requireAdminSession()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="sticky top-0 z-20 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <Link href="/admin" className="text-lg font-bold text-brand">
          KenyonExpress <span className="font-normal text-gray-400 text-sm">/ ניהול</span>
        </Link>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">{ROLE_LABELS[role]}</span>
          <form action={signOut}>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
            >
              <LogOut size={15} />
              יציאה
            </button>
          </form>
        </div>
      </header>

      {/* Body */}
      <div className="max-w-screen-xl mx-auto px-6 py-6 flex gap-6 items-start">
        <AdminSidebar />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  )
}
