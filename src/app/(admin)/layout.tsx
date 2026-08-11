import AdminSidebar from '@/components/admin/AdminSidebar'
import { adminLandingPath } from '@/lib/admin/nav'
import { ROLE_LABELS, requirePanelSession } from '@/lib/admin/rbac'
import { signOut } from '@/server/actions/auth'
import { LogOut } from 'lucide-react'
import Link from 'next/link'
import { Suspense } from 'react'

export const metadata = {
  title: { template: '%s | ניהול KenyonExpress', default: 'ניהול' },
  robots: { index: false, follow: false },
}

// Admin is always fully dynamic: zero cache, always-fresh truth (V2 rule 4).
// Under `cacheComponents` that is the default and needs no export: nothing in
// this group carries `use cache`, so every read is uncached and happens at
// request time. The rule is now enforced by NOT adding one, which is exactly
// why it is worth writing down.

/**
 * The whole panel frame, and the one read it takes to produce it.
 *
 * Layout guard = layer 2 of 4 (proxy -> layout -> per-page section gate ->
 * action guard + RLS). Panel entry only; pages still enforce the section
 * matrix, and they do it inside this same boundary.
 *
 * `children` is a PASS-THROUGH slot. It is rendered, never inspected, so the
 * boundary this component sits behind also covers every page in the group. That
 * is the point: all 34 admin routes call a guard of their own, and without a
 * boundary above them each one would need its own.
 */
async function AdminFrame({ children }: { children: React.ReactNode }) {
  const { role } = await requirePanelSession()

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white px-6 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Link href={adminLandingPath(role)} className="text-lg font-bold text-heading">
            KenyonExpress <span className="text-sm font-normal text-black/50">/ ניהול</span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-black/60">{ROLE_LABELS[role]}</span>
            <form action={signOut}>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 text-sm text-black/60 transition-colors hover:text-heading"
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
    </>
  )
}

/**
 * Reserves the sticky header's box so the panel does not jump down by its
 * height the moment the frame arrives.
 *
 * 53px is measured, by scripts/_panel-header-height.mjs, against the real
 * markup: `py-3` either side of a `text-lg` line box, plus the 1px bottom
 * border. Computing it from the class names gave 57 and was wrong.
 */
function AdminFrameFallback() {
  return <div className="h-[53px] border-b border-gray-200 bg-white" aria-hidden="true" />
}

/**
 * SYNCHRONOUS, so the group has a static shell instead of 34 routes that each
 * block on `auth.getUser()` before emitting a byte. The markup below the
 * boundary is unchanged from when this function did the awaiting itself.
 */
export default function AdminGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div dir="rtl" data-admin className="min-h-screen bg-white font-sans text-heading">
      <Suspense fallback={<AdminFrameFallback />}>
        <AdminFrame>{children}</AdminFrame>
      </Suspense>
    </div>
  )
}
