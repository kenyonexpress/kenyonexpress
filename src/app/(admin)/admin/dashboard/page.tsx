import StatsCard from '@/components/admin/StatsCard'
import { AUDIT_ACTION_LABELS, PENDING_QUEUE_LABELS, labelFor } from '@/lib/admin/labels'
import { canSeeMoney } from '@/lib/admin/permissions'
import { requireSection } from '@/lib/admin/rbac'
import { shekelsFromIlsRounded } from '@/lib/money-format'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { LOW_RATING_MAX, readRatingsTile } from '@/server/queries/ratings-admin'
import { Coins, FileText, Package, QrCode, ShoppingCart, Star, UserPlus } from 'lucide-react'
import Link from 'next/link'

export const metadata = { title: 'לוח בקרה' }

// The daily cockpit (V2 section 2, live-tables subset): today's numbers,
// pending queues from v_admin_pending_queues (049), and the latest audit
// events. Zero client fetching; support sees everything except money.

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

  const [
    { count: ordersToday },
    { data: paymentsToday },
    { count: couponsIssuedToday },
    { count: couponsUsedToday },
    { count: newCustomersToday },
    { count: activeProducts },
    { data: queues },
    { data: auditFeed },
    ratings,
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
    supabase.from('v_admin_pending_queues').select('*'),
    supabase
      .from('audit_log')
      .select('id, action, entity_type, actor_role, created_at')
      .order('created_at', { ascending: false })
      .limit(10),
    // Service role: both rating tables are owner-scoped for the admin's own
    // session (247, 154). The page is already behind requireSection.
    readRatingsTile(createAdminClient(), 30),
  ])

  const cashInToday = (paymentsToday ?? [])
    .filter((p) => p.kind === 'charge')
    .reduce((sum, p) => sum + p.amount_ils, 0)

  const pendingQueues = (queues ?? []).filter((q) => (q.n ?? 0) > 0)

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
            label="נגבה באתר היום"
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
          label="קופונים הונפקו היום"
          value={(couponsIssuedToday ?? 0).toLocaleString('he-IL')}
          icon={FileText}
          variant="admin"
        />
        <StatsCard
          label="מימושים היום"
          value={(couponsUsedToday ?? 0).toLocaleString('he-IL')}
          icon={QrCode}
          variant="admin"
        />
        <StatsCard
          label="לקוחות חדשים היום"
          value={(newCustomersToday ?? 0).toLocaleString('he-IL')}
          icon={UserPlus}
          variant="admin"
        />
        <StatsCard
          label="מוצרים פעילים"
          value={(activeProducts ?? 0).toLocaleString('he-IL')}
          icon={Package}
          variant="admin"
        />
      </div>

      {/* Row 1b: private ratings (STEP 45). Owner-only numbers; nothing here
          is rendered on the storefront. */}
      <section data-section="ratings-tile">
        <Link
          href="/admin/reviews"
          className={`flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border p-4 transition-colors hover:border-brand-primary ${
            ratings.low > 0 ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'
          }`}
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-gray-800">
            <Star size={16} aria-hidden="true" />
            דירוגים (פנימי) · 30 ימים
          </span>
          {ratings.available ? (
            <>
              <span className="text-sm">
                ממוצע חוויית הזמנה:{' '}
                <strong className="text-heading">
                  {ratings.average == null ? '—' : ratings.average.toLocaleString('he-IL')}
                </strong>
                <span className="text-black/50">
                  {' '}
                  / 5 ({ratings.count.toLocaleString('he-IL')})
                </span>
              </span>
              <span className={`text-sm ${ratings.low > 0 ? 'text-red-700' : 'text-black/60'}`}>
                נמוכים (עד {LOW_RATING_MAX}): {ratings.low.toLocaleString('he-IL')}
              </span>
              <span className="text-sm text-black/60">
                ביקורות מוצר לעיון: {ratings.pendingReviews.toLocaleString('he-IL')}
              </span>
            </>
          ) : (
            <span className="text-sm text-black/50">
              אין נתונים עדיין: טבלת המשוב (247) ממתינה להחלה.
            </span>
          )}
          <span className="ms-auto text-xs text-brand">לכל הדירוגים</span>
        </Link>
      </section>

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
