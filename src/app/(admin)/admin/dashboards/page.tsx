import StatsCard from '@/components/admin/StatsCard'
import { countBy, ledgerKindTotal, summarizeOrders } from '@/lib/admin/dashboards'
import { canSeeMoney } from '@/lib/admin/permissions'
import { requireSection } from '@/lib/admin/rbac'
import { shekels } from '@/lib/money-format'
import { createClient } from '@/lib/supabase/server'
import { Building2, Coins, Package, ShoppingCart } from 'lucide-react'

export const metadata = { title: 'דשבורדים' }

// Orders, products, suppliers and platform revenue in one view. Money is
// integer agorot end to end: orders.total_ils_agorot for order value, and the
// double-entry ledger (v_ledger_account_balances) for platform revenue and
// supplier payables. Support sees counts only.

const PAGE = 1000

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: 'ממתינה',
  paid: 'שולמה',
  partially_fulfilled: 'סופקה חלקית',
  fulfilled: 'סופקה',
  cancelled: 'בוטלה',
  refunded: 'הוחזרה',
  platform_settled: 'הוסדרה',
}

export default async function DashboardsPage() {
  const { role } = await requireSection('dashboard')
  const showMoney = canSeeMoney(role)
  const supabase = await createClient()

  // PostgREST caps a response at 1000 rows; page so the sum is never truncated.
  const orders: { status: string; total_ils_agorot: number | null }[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('orders')
      .select('status, total_ils_agorot')
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`dashboards orders: ${error.message}`)
    orders.push(...(data ?? []))
    if ((data?.length ?? 0) < PAGE) break
  }

  const [productsRes, suppliersRes, ledgerRes] = await Promise.all([
    supabase.from('products').select('status').is('deleted_at', null),
    supabase.from('suppliers').select('status').is('deleted_at', null),
    showMoney
      ? supabase
          .from('v_ledger_account_balances')
          .select('kind, natural_balance_agorot')
          .in('kind', ['platform_revenue', 'supplier_payable'])
      : Promise.resolve({ data: [], error: null }),
  ])
  for (const res of [productsRes, suppliersRes, ledgerRes]) {
    if (res.error) throw new Error(`dashboards: ${res.error.message}`)
  }

  const orderSummary = summarizeOrders(orders)
  const productsByStatus = countBy(productsRes.data ?? [], (p) => p.status)
  const suppliersByStatus = countBy(suppliersRes.data ?? [], (s) => s.status)
  const ledger = ledgerRes.data ?? []
  const productTotal = (productsRes.data ?? []).length
  const supplierTotal = (suppliersRes.data ?? []).length

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-heading">דשבורדים</h1>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatsCard
          label="הזמנות"
          value={orderSummary.total.toLocaleString('he-IL')}
          icon={ShoppingCart}
          variant="admin"
        />
        <StatsCard
          label="מוצרים"
          value={productTotal.toLocaleString('he-IL')}
          icon={Package}
          variant="admin"
        />
        <StatsCard
          label="ספקים"
          value={supplierTotal.toLocaleString('he-IL')}
          icon={Building2}
          variant="admin"
        />
        {showMoney ? (
          <StatsCard
            label="הכנסות הפלטפורמה"
            value={shekels(ledgerKindTotal(ledger, 'platform_revenue'))}
            icon={Coins}
            variant="admin"
          />
        ) : (
          <div className="flex items-center justify-center rounded-xl border border-gray-200 bg-white p-4 text-xs text-black/40">
            נתוני כסף: אין הרשאה
          </div>
        )}
      </div>

      <section className="rounded-xl border border-black/10 bg-white">
        <h2 className="border-b border-black/5 px-5 py-3 text-sm font-semibold text-gray-800">
          הזמנות
        </h2>
        <ul className="divide-y divide-black/5 text-sm">
          {Object.entries(orderSummary.byStatus).map(([status, n]) => (
            <li key={status} className="flex justify-between px-5 py-2.5">
              <span>{ORDER_STATUS_LABELS[status] ?? status}</span>
              <span>{n.toLocaleString('he-IL')}</span>
            </li>
          ))}
          {showMoney && (
            <li className="flex justify-between px-5 py-2.5 font-semibold">
              <span>סך הזמנות ששולמו ({orderSummary.paidCount.toLocaleString('he-IL')})</span>
              <span>{shekels(orderSummary.paidSum)}</span>
            </li>
          )}
        </ul>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-black/10 bg-white">
          <h2 className="border-b border-black/5 px-5 py-3 text-sm font-semibold text-gray-800">
            מוצרים לפי סטטוס
          </h2>
          <ul className="divide-y divide-black/5 text-sm">
            {Object.entries(productsByStatus).map(([status, n]) => (
              <li key={status} className="flex justify-between px-5 py-2.5">
                <span>{status}</span>
                <span>{n.toLocaleString('he-IL')}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-xl border border-black/10 bg-white">
          <h2 className="border-b border-black/5 px-5 py-3 text-sm font-semibold text-gray-800">
            ספקים לפי סטטוס
          </h2>
          <ul className="divide-y divide-black/5 text-sm">
            {Object.entries(suppliersByStatus).map(([status, n]) => (
              <li key={status} className="flex justify-between px-5 py-2.5">
                <span>{status}</span>
                <span>{n.toLocaleString('he-IL')}</span>
              </li>
            ))}
            {showMoney && (
              <li className="flex justify-between px-5 py-2.5 font-semibold">
                <span>יתרת חוב לספקים</span>
                <span>{shekels(ledgerKindTotal(ledger, 'supplier_payable'))}</span>
              </li>
            )}
          </ul>
        </section>
      </div>
    </div>
  )
}
