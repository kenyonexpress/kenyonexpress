import StatsCard from '@/components/admin/StatsCard'
import { AUDIT_ACTION_LABELS, PENDING_QUEUE_LABELS, labelFor } from '@/lib/admin/labels'
import { canSeeMoney } from '@/lib/admin/permissions'
import { requireSection } from '@/lib/admin/rbac'
import { shekelsFromIlsRounded } from '@/lib/money-format'
import { log } from '@/lib/observability/log'
import { createClient } from '@/lib/supabase/server'
import { Coins, Package, RefreshCw, ShoppingCart, Store, Users } from 'lucide-react'
import Link from 'next/link'
import DashboardCharts from './DashboardCharts'

export const metadata = { title: 'לוח בקרה' }

// The daily cockpit (V2 section 2, live-tables subset): today's numbers,
// pending queues from v_admin_pending_queues (049), and the latest audit
// events. Zero client fetching; support sees everything except money.
// F62: Added active users (24h), pending refunds, suppliers awaiting approval,
// and revenue/orders charts for 7/30/90 days.

const QUEUE_LINKS: Record<string, string> = {
  product_approvals: '/admin/approvals',
  stuck_payments: '/admin/payments',
  expired_pending_orders: '/admin/orders?status=pending',
  affiliate_applications: '/admin/affiliates?status=pending_review',
}

export default async function DashboardPage() {
  const { role } = await requireSection('dashboard')
  const showMoney = canSeeMoney(role)

  const supabase = await createClient()
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayIso = todayStart.toISOString()

  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const [
    { count: ordersToday },
    { data: paymentsToday },
    { count: _couponsIssuedToday },
    { count: _couponsUsedToday },
    { count: _newCustomersToday },
    { count: activeProducts },
    { data: activeUserOrders },
    { count: pendingRefunds },
    { count: suppliersAwaitingApproval },
    { data: queues },
    { data: auditFeed },
  ] = await Promise.all([
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null)
      .gte('created_at', todayIso),
    supabase
      .from('payments')
      .select('amount_ils, kind, status')
      .eq('status', 'succeeded')
      .gte('created_at', todayIso),
    supabase
      .from('coupon_codes')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', todayIso),
    supabase
      .from('coupon_codes')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'used')
      .gte('redeemed_at', todayIso),
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', todayIso),
    supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .is('deleted_at', null),
    // Active users: fetch user_ids from orders in last 24h, count distinct in JS
    supabase
      .from('orders')
      .select('user_id')
      .gte('created_at', last24h)
      .not('user_id', 'is', null),
    // Pending refunds: requested, approved, executing
    supabase
      .from('refunds')
      .select('id', { count: 'exact', head: true })
      .in('state', ['requested', 'approved', 'executing']),
    // Supplier applications awaiting approval
    supabase
      .from('supplier_applications')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabase.from('v_admin_pending_queues').select('*'),
    supabase
      .from('audit_log')
      .select('id, action, entity_type, actor_role, created_at')
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  // Count distinct active users
  const activeUsers24h = new Set(activeUserOrders?.map((o) => o.user_id) ?? []).size

  const cashInToday = (paymentsToday ?? [])
    .filter((p) => p.kind === 'charge')
    .reduce((sum, p) => sum + p.amount_ils, 0)

  const pendingQueues = (queues ?? []).filter((q) => (q.n ?? 0) > 0)

  // Fetch chart data for last 90 days
  const days90Ago = new Date()
  days90Ago.setDate(days90Ago.getDate() - 90)
  days90Ago.setHours(0, 0, 0, 0)

  const { data: ordersData, error: ordersError } = await supabase
    .from('orders')
    .select('created_at, status, total_ils_agorot')
    .gte('created_at', days90Ago.toISOString())
    .is('deleted_at', null)
    .in('status', ['paid', 'partially_fulfilled', 'fulfilled', 'platform_settled'])
    .order('created_at', { ascending: true })

  if (ordersError) log.warn('admin_dashboard.orders_read_failed', { err: ordersError })

  // Group by day
  const dayMap = new Map<string, { orders: number; revenue: number }>()
  for (let i = 0; i < 90; i++) {
    const d = new Date(days90Ago)
    d.setDate(d.getDate() + i)
    const key = d.toISOString().split('T')[0]!
    dayMap.set(key, { orders: 0, revenue: 0 })
  }

  for (const order of ordersData ?? []) {
    const dateKey = order.created_at.split('T')[0]!
    const existing = dayMap.get(dateKey)
    if (existing) {
      existing.orders += 1
      existing.revenue += order.total_ils_agorot ?? 0
    }
  }

  const days90 = Array.from(dayMap.entries())
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const days30 = days90.slice(-30)
  const days7 = days90.slice(-7)

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-heading">לוח בקרה</h1>

      {/* Row 1: today's numbers */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatsCard
          label="הזמנות היום"
          value={(ordersToday ?? 0).toLocaleString('he-IL')}
          icon={ShoppingCart}
          variant="admin"
        />
        {showMoney ? (
          <StatsCard
            label="הכנסות היום"
            value={shekelsFromIlsRounded(cashInToday)}
            icon={Coins}
            variant="admin"
          />
        ) : (
          <div className="flex items-center justify-center rounded-xl border border-gray-200 bg-white p-4 text-xs text-black/40">
            נתוני כסף: אין הרשאה
          </div>
        )}
        <StatsCard
          label="משתמשים פעילים (24 שעות)"
          value={(activeUsers24h ?? 0).toLocaleString('he-IL')}
          icon={Users}
          variant="admin"
        />
        <StatsCard
          label="החזרים ממתינים"
          value={(pendingRefunds ?? 0).toLocaleString('he-IL')}
          icon={RefreshCw}
          variant="admin"
        />
        <StatsCard
          label="ספקים לאישור"
          value={(suppliersAwaitingApproval ?? 0).toLocaleString('he-IL')}
          icon={Store}
          variant="admin"
        />
        <StatsCard
          label="מוצרים פעילים"
          value={(activeProducts ?? 0).toLocaleString('he-IL')}
          icon={Package}
          variant="admin"
        />
      </div>

      {/* Row 1.5: Charts */}
      {showMoney && <DashboardCharts days7={days7} days30={days30} days90={days90} />}

      {/* Row 2: pending queues */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-800">תורים ממתינים לטיפול</h2>
        {pendingQueues.length ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {pendingQueues.map((queue) => {
              const key = queue.queue ?? ''
              const oldest = queue.oldest_at ? new Date(queue.oldest_at) : null
              const slaBreached =
                oldest && queue.sla
                  ? Date.now() - oldest.getTime() > parseSlaMs(String(queue.sla))
                  : false
              return (
                <Link
                  key={key}
                  href={QUEUE_LINKS[key] ?? '/admin/dashboard'}
                  className={`rounded-xl border p-4 transition-colors hover:border-brand-primary ${
                    slaBreached ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'
                  }`}
                >
                  <p className="text-2xl font-bold text-heading">
                    {(queue.n ?? 0).toLocaleString('he-IL')}
                  </p>
                  <p className="text-sm text-black/60">{labelFor(PENDING_QUEUE_LABELS, key)}</p>
                  {oldest && (
                    <p className={`mt-1 text-xs ${slaBreached ? 'text-red-600' : 'text-black/40'}`}>
                      הישן ביותר: {oldest.toLocaleDateString('he-IL')}
                    </p>
                  )}
                </Link>
              )
            })}
          </div>
        ) : (
          <p className="rounded-xl border border-gray-200 bg-white px-4 py-6 text-center text-sm text-black/40">
            אין פריטים ממתינים. בוקר טוב.
          </p>
        )}
      </section>

      {/* Row 3: latest audit events */}
      <section className="rounded-xl border border-black/10 bg-white">
        <div className="flex items-center justify-between border-b border-black/5 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-800">פעילות אחרונה</h2>
          <Link href="/admin/audit-log" className="text-xs text-brand hover:underline">
            ללוג המלא
          </Link>
        </div>
        <ul className="divide-y divide-black/5 text-sm">
          {(auditFeed ?? []).map((event) => (
            <li key={event.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
              <span>
                {labelFor(AUDIT_ACTION_LABELS, event.action)}
                <span className="text-black/50"> ב-{event.entity_type}</span>
              </span>
              <span className="text-xs text-black/40">
                {event.actor_role ?? 'מערכת'} | {new Date(event.created_at).toLocaleString('he-IL')}
              </span>
            </li>
          ))}
          {!auditFeed?.length && (
            <li className="px-5 py-6 text-center text-sm text-black/40">אין פעילות רשומה</li>
          )}
        </ul>
      </section>
    </div>
  )
}

// Postgres interval comes back as e.g. "3 days" / "01:00:00"; parse the two
// shapes the 049 view emits.
function parseSlaMs(sla: string): number {
  const daysMatch = sla.match(/^(\d+)\s*day/)
  if (daysMatch?.[1]) return Number(daysMatch[1]) * 24 * 60 * 60 * 1000
  const timeMatch = sla.match(/^(\d{2}):(\d{2}):(\d{2})$/)
  if (timeMatch) {
    return (Number(timeMatch[1]) * 3600 + Number(timeMatch[2]) * 60 + Number(timeMatch[3])) * 1000
  }
  return Number.POSITIVE_INFINITY
}
