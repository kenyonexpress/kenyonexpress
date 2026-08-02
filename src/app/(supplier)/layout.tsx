import { requireSupplierMember } from '@/lib/supplier/rbac'
import { signOut } from '@/server/actions/auth'
import { LogOut, Store } from 'lucide-react'
import { Suspense } from 'react'

export const metadata = {
  title: { template: '%s | ספקים KenyonExpress', default: 'אזור ספקים' },
}

/**
 * Same shape as the admin group's frame, and for the same reason: `children` is
 * a pass-through slot, so the boundary this sits behind also covers the two
 * supplier pages, which run their own guard. See src/app/(admin)/layout.tsx.
 */
async function SupplierFrame({ children }: { children: React.ReactNode }) {
  const session = await requireSupplierMember()

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div className="flex items-center gap-2">
            <Store size={18} className="text-gray-500" aria-hidden="true" />
            <span className="text-base font-bold">{session.supplierName || 'אזור ספקים'}</span>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-900"
            >
              <LogOut size={15} aria-hidden="true" />
              יציאה
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
    </>
  )
}

export default function SupplierGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div dir="rtl" className="min-h-screen bg-gray-50 font-sans text-gray-900">
      {/* Reserves the sticky header's box. 49.5px measured against the real
          markup by scripts/_panel-header-height.mjs, not derived from the class
          names - doing that gave 53 and was wrong. */}
      <Suspense
        fallback={
          <div className="h-[49.5px] border-b border-gray-200 bg-white" aria-hidden="true" />
        }
      >
        <SupplierFrame>{children}</SupplierFrame>
      </Suspense>
    </div>
  )
}
