import { requireSupplierMember } from '@/lib/supplier/rbac'
import ScanClient from './ScanClient'

export const metadata = { title: 'סריקת שובר' }

export default async function SupplierScanPage() {
  const session = await requireSupplierMember()
  return (
    <div dir="rtl" className="mx-auto max-w-[480px] space-y-4 px-1">
      <div className="rounded-xl bg-[#fed700] px-4 py-3">
        <h1 className="text-xl font-bold text-[#333e48]">סריקת שובר</h1>
        <p className="mt-1 text-sm text-[#333e48]/90">
          סרוק QR או הקלד את הקוד, אשר, וגבה את היתרה מהלקוח.
        </p>
      </div>
      <ScanClient supplierName={session.supplierName} />
    </div>
  )
}
