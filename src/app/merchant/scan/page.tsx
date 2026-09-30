import { requireSupplierMember } from '@/lib/supplier/rbac'
import type { Metadata } from 'next'
import MerchantScanClient from './MerchantScanClient'

/**
 * The installable till (STEP 14).
 *
 * What is different from /scan: this one keeps working when the signal does
 * not. A scan that cannot reach the server is queued on the device under an
 * idempotency key and drained through /api/supplier/vouchers/redeem-batch when
 * the connection returns; the service worker keeps a shell of this document
 * so the page itself opens offline; and the manifest below gives it a
 * home-screen icon that launches straight into the viewfinder.
 *
 * `manifest` here overrides the root layout's field, which is the whole reason
 * the shop's manifest became a route handler. The layout already requires a
 * membership; the call below is what supplies the name and keeps the page
 * honest if the layout is ever restructured.
 */
export const metadata: Metadata = {
  title: 'סורק שוברים',
  manifest: '/merchant/manifest.webmanifest',
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: 'סורק שוברים', statusBarStyle: 'default' },
}

export default async function MerchantScanPage() {
  const session = await requireSupplierMember('/merchant/scan')
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">סורק שוברים</h1>
        <p className="mt-1 text-sm text-gray-500">
          סרקו את ה-QR של הלקוח או הקלידו את הקוד. סריקה בלי חיבור נשמרת במכשיר ומסונכרנת כשהחיבור
          חוזר.
        </p>
      </div>
      <MerchantScanClient supplierName={session.supplierName} />
    </div>
  )
}
