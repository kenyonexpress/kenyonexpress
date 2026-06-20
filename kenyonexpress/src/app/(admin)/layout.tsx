import AdminSidebar from '@/components/admin/AdminSidebar'
import { ROLE_LABELS, requireAdminSession } from '@/lib/admin/rbac'
import { signOut } from '@/server/actions/auth'
import { LogOut } from 'lucide-react'
import Link from 'next/link'

export const metadata = { title: { template: '%s | ניהול KenyonExpress', default: 'ניהול' } }

export default async function AdminGroupLayout({ children }: { children: React.ReactNode }) {
  const { role } = await requireAdminSession()

  return (
    <div
      dir="rtl"
      data-admin
      className="min-h-screen bg-[#FFFFFF] text-[#000000]"
      style={{ '--admin-primary': '#B0E0E9' } as React.CSSProperties}
    >
      <header className="sticky top-0 z-20 border-b border-black/10 bg-[#FFFFFF] px-6 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Link href="/admin" className="text-lg font-bold text-[#000000]">
            KenyonExpress <span className="text-sm font-normal text-black/50">/ ניהול</span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-black/60">{ROLE_LABELS[role]}</span>
            <form action={signOut}>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 text-sm text-black/60 transition-colors hover:text-[#000000]"
              >
                <LogOut size={15} aria-hidden="true" />
                יציאה
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl items-start gap-6 px-6 py-6">
        <AdminSidebar />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  )
}
