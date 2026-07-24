import { requireSupplierMember } from '@/lib/supplier/rbac'
import ScanClient from './ScanClient'

export const metadata = { title: 'סריקת שובר' }

export default async function SupplierScanPage() {
  const session = await requireSupplierMember()
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">סריקת שובר</h1>
        <p className="mt-1 text-sm text-gray-500">
          סרוק QR או הקלד את הקוד, אשר, וגבה את היתרה מהלקוח.
        </p>
      </div>
      <ScanClient supplierName={session.supplierName} />
    </div>
  )
}
