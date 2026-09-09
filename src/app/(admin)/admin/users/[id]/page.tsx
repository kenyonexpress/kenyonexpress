import StatusBadge, { orderStatusBadge } from '@/components/admin/StatusBadge'
import { COUPON_STATUS_LABELS, labelFor } from '@/lib/admin/labels'
import { canWriteSection } from '@/lib/admin/permissions'
import { ROLE_LABELS, requireSection } from '@/lib/admin/rbac'
import { shekelsFromIlsRounded } from '@/lib/money-format'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import UserRoleClient from '../UserRoleClient'

export const metadata = { title: 'משתמש 360' }

export default async function AdminUserDetailPage(props: {
  params: Promise<{ id: string }>
}) {
  const { role: callerRole } = await requireSection('users')
  const { id } = await props.params

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, full_name, phone, role, created_at, affiliate_code')
    .eq('id', id)
    .single()

  if (!profile) notFound()

  const [{ data: orders }, { data: wallet }, { data: walletTx }, { data: coupons }] =
    await Promise.all([
      supabase
        .from('orders')
        .select('id, invoice_number, status, total_ils, created_at')
        .eq('user_id', id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('wallet_balances')
        .select('balance_ils, lifetime_earned_ils, lifetime_redeemed_ils')
        .eq('user_id', id)
        .maybeSingle(),
      supabase
        .from('wallet_transactions')
        .select('id, type, amount_ils, notes, created_at')
        .eq('user_id', id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('coupon_codes')
        .select('id, code, status, expires_at, created_at')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(5),
    ])

  const canEditRoles = canWriteSection(callerRole, 'users')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-900">
          {profile.full_name ?? profile.email}
          <span className="ms-3 align-middle text-sm font-normal text-black/50">
            {ROLE_LABELS[profile.role as keyof typeof ROLE_LABELS] ?? profile.role}
          </span>
        </h1>
        <Link href="/admin/users" className="text-sm text-brand hover:underline">
          חזרה לרשימת המשתמשים
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <section className="rounded-xl border border-black/10 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-gray-800">פרטים</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-black/50">אימייל</dt>
              <dd dir="ltr" className="text-black/80">
                {profile.email}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-black/50">טלפון</dt>
              <dd dir="ltr" className="text-black/80">
                {profile.phone ?? ''}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-black/50">הצטרפות</dt>
              <dd>{new Date(profile.created_at).toLocaleDateString('he-IL')}</dd>
            </div>
            {profile.affiliate_code && (
              <div className="flex justify-between gap-2">
                <dt className="text-black/50">קוד שותף</dt>
                <dd className="font-mono text-xs">{profile.affiliate_code}</dd>
              </div>
            )}
          </dl>
          {canEditRoles && (
            <div className="mt-4 border-t border-black/5 pt-3">
              <p className="mb-2 text-xs text-black/50">שינוי תפקיד</p>
              <UserRoleClient
                userId={profile.id}
                currentRole={profile.role}
                callerRole={callerRole}
              />
            </div>
          )}
        </section>

        <section className="rounded-xl border border-black/10 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-gray-800">ארנק</h2>
          <p className="text-2xl font-bold text-heading">
            {shekelsFromIlsRounded(wallet?.balance_ils ?? 0)}
          </p>
          <p className="mt-1 text-xs text-black/50">
            נצבר: {shekelsFromIlsRounded(wallet?.lifetime_earned_ils ?? 0)} | מומש: ₪
            {(wallet?.lifetime_redeemed_ils ?? 0).toLocaleString('he-IL')}
          </p>
          <ul className="mt-3 space-y-1.5 border-t border-black/5 pt-3 text-xs">
            {(walletTx ?? []).map((tx) => (
              <li key={tx.id} className="flex justify-between gap-2">
                <span className="text-black/60">
                  {tx.type === 'earn' ? 'זיכוי' : tx.type === 'redeem' ? 'מימוש' : tx.type}
                </span>
                <span>{shekelsFromIlsRounded(tx.amount_ils)}</span>
                <span className="text-black/40">
                  {new Date(tx.created_at).toLocaleDateString('he-IL')}
                </span>
              </li>
            ))}
            {!walletTx?.length && <li className="text-black/40">אין תנועות ארנק</li>}
          </ul>
        </section>

        <section className="rounded-xl border border-black/10 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-gray-800">קופונים אחרונים</h2>
          <ul className="space-y-1.5 text-xs">
            {(coupons ?? []).map((coupon) => (
              <li key={coupon.id} className="flex justify-between gap-2">
                <span className="font-mono">{coupon.code}</span>
                <span>{labelFor(COUPON_STATUS_LABELS, coupon.status)}</span>
                <span className="text-black/40">
                  {coupon.expires_at ? new Date(coupon.expires_at).toLocaleDateString('he-IL') : ''}
                </span>
              </li>
            ))}
            {!coupons?.length && <li className="text-black/40">אין קופונים</li>}
          </ul>
        </section>
      </div>

      <section className="rounded-xl border border-black/10 bg-white">
        <h2 className="border-b border-black/5 px-5 py-3 text-sm font-semibold text-gray-800">
          הזמנות אחרונות
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-black/10 bg-black/[0.02] text-end text-xs text-black/50">
              <th className="px-5 py-2.5 font-medium">מס׳ הזמנה</th>
              <th className="px-5 py-2.5 font-medium">סכום</th>
              <th className="px-5 py-2.5 font-medium">סטטוס</th>
              <th className="px-5 py-2.5 font-medium">תאריך</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {(orders ?? []).map((order) => {
              const badge = orderStatusBadge(order.status)
              return (
                <tr key={order.id} className="transition-colors hover:bg-brand-primary/15">
                  <td className="px-5 py-2.5">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="font-mono text-xs text-brand hover:underline"
                    >
                      {order.invoice_number ?? order.id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="px-5 py-2.5">{shekelsFromIlsRounded(order.total_ils)}</td>
                  <td className="px-5 py-2.5">
                    <StatusBadge label={badge.label} variant={badge.variant} />
                  </td>
                  <td className="px-5 py-2.5 text-xs text-black/50">
                    {new Date(order.created_at).toLocaleDateString('he-IL')}
                  </td>
                </tr>
              )
            })}
            {!orders?.length && (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-sm text-black/40">
                  אין הזמנות
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}
