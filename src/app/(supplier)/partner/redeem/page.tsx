import { requireSupplierMember } from '@/lib/supplier/rbac'
import ScanClient from '../../scan/ScanClient'

/**
 * Partner-facing redemption screen. Same flow as /scan (lookup, confirm, one
 * idempotent redeem), reachable at the address partners are given. Accepts a
 * QR, the 10-character voucher code, or the 8-digit counter PIN; the routes it
 * posts to resolve a PIN among the caller's own suppliers.
 */

export const metadata = { title: 'מימוש שובר' }

export default async function PartnerRedeemPage() {
  const session = await requireSupplierMember('/partner/redeem')
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">מימוש שובר</h1>
        <p className="mt-1 text-sm text-gray-500">
          סרקו QR או הקלידו את הקוד או את 8 ספרות ה-PIN, בדקו את פרטי השובר ואשרו.
        </p>
      </div>
      <ScanClient supplierName={session.supplierName} />
    </div>
  )
}
