import { requireSupplierMember } from '@/lib/supplier/rbac'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import PartnerScanClient from './PartnerScanClient'

export const metadata: Metadata = {
  title: 'סריקת שובר - שותפים',
  robots: { index: false, follow: false },
}

/**
 * Partner QR scanner route. Provides camera-based QR scanning for voucher
 * redemption. When a valid voucher QR is scanned, redirects to the redemption
 * flow which validates the signature and marks the voucher as redeemed.
 *
 * This route requires supplier/partner authentication. Partners are suppliers
 * who redeem vouchers at their business.
 */

async function PartnerScanContent() {
  const session = await requireSupplierMember('/partner/scan')

  return (
    <main dir="rtl" className="mx-auto max-w-md px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">סריקת שובר</h1>
        <p className="mt-1 text-sm text-gray-500">{session.supplierName}</p>
        <p className="mt-2 text-sm text-gray-600">סרקו את קוד ה-QR של הלקוח למימוש השובר</p>
      </header>

      <PartnerScanClient />
    </main>
  )
}

export default function PartnerScanPage() {
  return (
    <Suspense
      fallback={
        <main dir="rtl" className="mx-auto max-w-md px-4 py-6">
          <div className="h-64 animate-pulse rounded-2xl bg-gray-100" />
        </main>
      }
    >
      <PartnerScanContent />
    </Suspense>
  )
}
