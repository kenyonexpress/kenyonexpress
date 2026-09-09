import StatusBadge, { orderStatusBadge } from '@/components/admin/StatusBadge'
import { COUPON_STATUS_LABELS, labelFor } from '@/lib/admin/labels'
import { canWriteSection } from '@/lib/admin/permissions'
import { ROLE_LABELS, requireSection } from '@/lib/admin/rbac'
import { agorot } from '@/lib/commerce/money'
import { shekels, shekelsFromIlsRounded } from '@/lib/money-format'
import { createClient } from '@/lib/supabase/server'
import { ADMIN_WALLET_LEDGER_CAP } from '@/lib/wallet/admin-view'
import { walletReasonLabel } from '@/server/queries/account'
import { getAdminWalletView } from '@/server/queries/admin-wallet'
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

  // The wallet is read through getAdminWalletView, which goes to
  // wallet_accounts and v_wallet_ledger. This page used to read
  // wallet_balances and wallet_transactions: both hold zero rows in production
  // (measured 2026-09-10) while the money sits in the other pair, so the one
  // customer who has a balance was shown 0.00 and "no wallet movements".
  const [{ data: orders }, walletView, { data: coupons }] = await Promise.all([
    supabase
      .from('orders')
      .select('id, invoice_number, status, total_ils, created_at')
      .eq('user_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(10),
    getAdminWalletView(id),
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
            {shekels(agorot(walletView.balanceAgorot))}
          </p>

          {walletView.totals.complete ? (
            <p className="mt-1 text-xs text-black/50">
              נצבר: {shekels(agorot(walletView.totals.earnedAgorot))} | מומש:{' '}
              {shekels(agorot(walletView.totals.redeemedAgorot))}
            </p>
          ) : (
            <p className="mt-1 text-xs text-black/50">
              יש יותר מ-{ADMIN_WALLET_LEDGER_CAP} תנועות בארנק הזה, ולכן הסכומים המצטברים אינם
              נספרים כאן.
            </p>
          )}

          {/* Drift is the one thing on this card that is an accusation and not
              a number: the cached column and the append-only ledger disagree,
              and only one of them could have been edited. */}
          {walletView.totals.complete && walletView.totals.driftAgorot !== 0 && (
            <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
              היתרה השמורה אינה מסתדרת עם היומן: היומן אומר{' '}
              {shekels(agorot(walletView.totals.ledgerBalanceAgorot))}, הפרש{' '}
              {shekels(agorot(walletView.totals.driftAgorot))}.
            </p>
          )}

          <ul className="mt-3 space-y-1.5 border-t border-black/5 pt-3 text-xs">
            {walletView.entries.slice(0, 5).map((entry) => (
              <li key={entry.id} className="flex justify-between gap-2">
                <span className="text-black/60">{walletReasonLabel(entry.reason)}</span>
                <span>
                  {entry.direction === 'credit' ? '+' : '-'}
                  {shekels(agorot(entry.amountAgorot))}
                </span>
                <span className="text-black/40">
                  {new Date(entry.createdAt).toLocaleDateString('he-IL')}
                </span>
              </li>
            ))}
            {walletView.entries.length === 0 && <li className="text-black/40">אין תנועות ארנק</li>}
            {walletView.entries.length > 5 && (
              <li className="text-black/40">ועוד {walletView.entries.length - 5} תנועות</li>
            )}
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
