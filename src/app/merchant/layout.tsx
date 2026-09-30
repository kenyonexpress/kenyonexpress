import { requireSupplierMember } from '@/lib/supplier/rbac'
import { ROLE_LABEL_HE } from '@/lib/supplier/roles'
import { Store } from 'lucide-react'
import { Suspense } from 'react'
import MerchantSignOut from './MerchantSignOut'

export const metadata = {
  title: { template: '%s | קניון אקספרס', default: 'סורק שוברים' },
  robots: { index: false, follow: false },
}

/**
 * The till's frame: the business name, the role, and a way out. Nothing else.
 *
 * Not the (supplier) group layout, on purpose. That frame carries the portal
 * nav, and every link on it leaves the installed app's scope (/merchant/) for
 * the browser. A cashier who taps "orders" from the viewfinder and lands in
 * Safari has lost the scanner; the one link out of here says where it goes.
 *
 * Same shape as that layout for the same reason: the session is awaited
 * behind a Suspense boundary so the page below stays prerenderable and the
 * service worker can keep a shell of it.
 */
async function MerchantFrame({ children }: { children: React.ReactNode }) {
  const session = await requireSupplierMember('/merchant/scan')
  return (
    <>
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Store size={18} className="shrink-0 text-gray-500" aria-hidden="true" />
            <div className="min-w-0">
              <p className="truncate text-base font-bold">
                {session.supplierName || 'סורק שוברים'}
              </p>
              <p className="text-xs text-gray-500">{ROLE_LABEL_HE[session.memberRole]}</p>
            </div>
          </div>
          <MerchantSignOut />
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-5">{children}</main>
    </>
  )
}

export default function MerchantLayout({ children }: { children: React.ReactNode }) {
  return (
    <div dir="rtl" className="min-h-screen bg-gray-50 font-sans text-gray-900">
      <Suspense
        fallback={
          <div className="h-supplier-header border-b border-gray-200 bg-white" aria-hidden="true" />
        }
      >
        <MerchantFrame>{children}</MerchantFrame>
      </Suspense>
    </div>
  )
}
