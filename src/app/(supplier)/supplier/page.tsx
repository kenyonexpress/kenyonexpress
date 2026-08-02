import { formatDate, formatIls, formatVoucherCode } from '@/lib/account/format'
import { aggregateDashboard } from '@/lib/supplier/dashboard'
import { requireSupplierMember } from '@/lib/supplier/rbac'
import { hasMinRole } from '@/lib/supplier/roles'
import { getSupplierRedemptions, getSupplierSales } from '@/server/queries/supplier'
import Link from 'next/link'

export const metadata = { title: 'לוח בקרה' }

function StatCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-extrabold text-heading" dir="ltr">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-gray-400">{hint}</p> : null}
    </div>
  )
}

export default async function SupplierHomePage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>
}) {
  const session = await requireSupplierMember('/supplier')
  const sp = await searchParams
  const [sales, redemptions] = await Promise.all([
    getSupplierSales(session.supplierId),
    getSupplierRedemptions(session.supplierId),
  ])
  const stats = aggregateDashboard({ sales, redemptions })
  const recent = redemptions.slice(0, 5)

  return (
    <div className="space-y-6">
      {sp.denied === 'role' ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          אין לכם הרשאה למסך המבוקש. פנו לבעל העסק להרחבת הרשאות.
        </p>
      ) : null}

      <section>
        <h1 className="text-2xl font-bold text-heading">לוח בקרה</h1>
        <p className="mt-1 text-sm text-gray-500">
          סיכום מכירות ומימושים לפי אחוז עמלת הפלטפורמה שהוגדר בכל מוצר.
        </p>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="מימושים היום"
          value={String(stats.redemptionsToday)}
          hint="סריקות שהצליחו"
        />
        <StatCard
          label="לגבייה בקופה היום"
          value={formatIls(stats.tillCollectedTodayAgorot)}
          hint="יתרת לקוח בעסק"
        />
        <StatCard
          label="עמלת פלטפורמה"
          value={formatIls(stats.platformFeeAgorot)}
          hint="מתוך הזמנות ששולמו"
        />
        <StatCard
          label="מגיע לספק"
          value={formatIls(stats.supplierDueAgorot)}
          hint="מיידי + מוחזק לשחרור"
        />
        <StatCard
          label="מוחזק (אסקראו)"
          value={formatIls(stats.escrowHeldAgorot)}
          hint="ממתין למימוש קופון"
        />
        <StatCard
          label="שוחרר לתשלום"
          value={formatIls(stats.escrowReleasedAgorot)}
          hint="אחרי סריקה מוצלחת"
        />
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-heading">פעולות מהירות</h2>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Link
            href="/supplier/scan"
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-heading px-4 text-sm font-bold text-white"
          >
            סריקת שובר
          </Link>
          {hasMinRole(session.memberRole, 'owner') ? (
            <Link
              href="/supplier/payouts"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-gray-300 px-4 text-sm font-semibold text-gray-800"
            >
              פירוט תשלומים לפי עמלה
            </Link>
          ) : (
            <Link
              href="/supplier/redemptions"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-gray-300 px-4 text-sm font-semibold text-gray-800"
            >
              היסטוריית מימושים
            </Link>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-heading">מימושים אחרונים</h2>
          <Link href="/supplier/redemptions" className="text-sm font-semibold text-brand">
            לכל המימושים
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-500">
            עדיין אין מימושים. התחילו מסריקת שובר.
          </p>
        ) : (
          <ul className="space-y-2">
            {recent.map((row) => (
              <li
                key={row.voucherId}
                className="rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-heading">{row.productName}</p>
                    <p className="mt-0.5 font-mono text-sm tracking-wider text-gray-600" dir="ltr">
                      {formatVoucherCode(row.code)}
                    </p>
                    <p className="mt-1 text-xs text-gray-400">{formatDate(row.redeemedAt)}</p>
                  </div>
                  <div className="text-end">
                    <p className="text-xs text-gray-500">לגבייה</p>
                    <p className="text-lg font-extrabold text-heading" dir="ltr">
                      {formatIls(row.remainingAmountDueAgorot)}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
