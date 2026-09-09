import VoucherLookupForm from '@/components/admin/VoucherLookupForm'
import { canWriteSection } from '@/lib/admin/permissions'
import { requireSection } from '@/lib/admin/rbac'

export const metadata = { title: 'איתור שובר' }

export default async function AdminVoucherLookupPage() {
  const session = await requireSection('catalog', 'read')
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">איתור שובר ומימוש ידני</h1>
        <p className="mt-1 text-sm text-gray-600">
          בדיקה לפי קוד. מימוש ידני שמור למנהל, נרשם בלוג הפעילות, ושורף את השובר כמו סריקה בקופה.
        </p>
      </header>
      <VoucherLookupForm canRedeem={canWriteSection(session.role, 'orders')} />
    </div>
  )
}
