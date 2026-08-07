import SupplierNav from '@/components/supplier/SupplierNav'
import { requireSupplierMember } from '@/lib/supplier/rbac'
import { ROLE_LABEL_HE } from '@/lib/supplier/roles'
import { signOut } from '@/server/actions/auth'
import { LogOut, Store } from 'lucide-react'
import { Suspense } from 'react'

export const metadata = {
  title: { template: '%s | ספקים KenyonExpress', default: 'אזור ספקים' },
}

/**
 * Same shape as the admin group's frame, and for the same reason: `children` is
 * a pass-through slot, so the boundary this sits behind also covers the supplier
 * pages, which run their own guard. See src/app/(admin)/layout.tsx.
 *
 * The portal branch wrote this as the default export and awaited the session at
 * the top of the layout itself. That is the exact shape [21] removed from every
 * route group: a layout that awaits before it renders makes everything beneath
 * it uncacheable and put 78 prerender errors in the build. Its markup is kept --
 * the role label, the truncation, the shrink-0 icon are all improvements -- and
 * it is kept HERE, behind the Suspense boundary below.
 */
async function SupplierFrame({ children }: { children: React.ReactNode }) {
  const session = await requireSupplierMember('/supplier')

  return (
    <>
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
