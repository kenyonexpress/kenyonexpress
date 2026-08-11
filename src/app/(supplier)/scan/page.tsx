import { requireSupplierMember } from '@/lib/supplier/rbac'
import ScanClient from './ScanClient'

/**
 * The scan screen lives at /scan rather than /supplier/scan: it is typed into a
 * phone at a till, sometimes read aloud to staff, and the shortest URL that can
 * be got wrong is the one worth having. /supplier/scan redirects here so the
 * old address, and anything printed with it, still works.
 *
 * The (supplier) group layout already requires an active supplier membership;
 * requireSupplierMember here is what supplies the name and keeps the page
 * honest if the layout is ever restructured.
 */

export const metadata = { title: 'סריקת שובר' }

export default async function ScanPage() {
  const session = await requireSupplierMember('/scan')
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">סריקת שובר</h1>
        <p className="mt-1 text-sm text-gray-500">
          סרקו QR או הקלידו את הקוד, בדקו את פרטי השובר, אשרו, וגבו את היתרה מהלקוח.
        </p>
      </div>
      <ScanClient supplierName={session.supplierName} />
    </div>
  )
}
