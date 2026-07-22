import AdminSidebar from '@/components/admin/AdminSidebar'
import { ROLE_LABELS, requirePanelSession } from '@/lib/admin/rbac'
import { signOut } from '@/server/actions/auth'
import { LogOut } from 'lucide-react'
import Link from 'next/link'

export const metadata = {
  title: { template: '%s | ניהול KenyonExpress', default: 'ניהול' },
  robots: { index: false, follow: false },
}

// Admin is always fully dynamic: zero cache, always-fresh truth (V2 rule 4).
export const dynamic = 'force-dynamic'

export default async function AdminGroupLayout({ children }: { children: React.ReactNode }) {
  // Layout guard = layer 2 of 4 (proxy -> layout -> per-page section gate ->
  // action guard + RLS). Panel entry only; pages enforce the section matrix.
  const { role } = await requirePanelSession()

  return (
    <div
      dir="rtl"
      data-admin
      className="min-h-screen bg-white font-sans text-[#333e48]"
      style={{ '--admin-primary': '#fed700' } as React.CSSProperties}
    >
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white px-6 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Link href="/admin/dashboard" className="text-lg font-bold text-[#333e48]">
            KenyonExpress <span className="text-sm font-normal text-black/50">/ ניהול</span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-black/60">{ROLE_LABELS[role]}</span>
            <form action={signOut}>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 text-sm text-black/60 transition-colors hover:text-[#333e48]"
              >
                <LogOut size={15} aria-hidden="true" />
                יציאה
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl items-start gap-6 px-6 py-6">
        <AdminSidebar role={role} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  )
}
