import SupplierNav from '@/components/supplier/SupplierNav'
import { requireSupplierMember } from '@/lib/supplier/rbac'
import { ROLE_LABEL_HE } from '@/lib/supplier/roles'
import { signOut } from '@/server/actions/auth'
import { LogOut, Store } from 'lucide-react'

export const metadata = {
  title: { template: '%s | ספקים KenyonExpress', default: 'אזור ספקים' },
}

export default async function SupplierGroupLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSupplierMember('/supplier')

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50 font-sans text-gray-900">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Store size={18} className="shrink-0 text-gray-500" aria-hidden="true" />
            <div className="min-w-0">
              <p className="truncate text-base font-bold">{session.supplierName || 'אזור ספקים'}</p>
              <p className="text-xs text-gray-500">{ROLE_LABEL_HE[session.memberRole]}</p>
            </div>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center gap-1.5 px-2 text-sm text-gray-500 transition-colors hover:text-gray-900"
            >
              <LogOut size={15} aria-hidden="true" />
              יציאה
            </button>
          </form>
        </div>
        <SupplierNav memberRole={session.memberRole} />
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
    </div>
  )
}
