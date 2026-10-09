import { formatDate, formatIls } from '@/lib/account/format'
import { agorot, sumAgorot } from '@/lib/money'
import { requireSupplierMember } from '@/lib/supplier/rbac'
import { formatVoucherCode } from '@/server/domain/vouchers/code'
import { getSupplierRedemptions } from '@/server/queries/supplier'

export const metadata = { title: 'מימושים' }

export default async function SupplierRedemptionsPage() {
  const session = await requireSupplierMember('/supplier/redemptions')
  const rows = await getSupplierRedemptions(session.supplierId)

  // The two windows the counter actually asks about: "מה נסרק היום" and the
  // last month. Fold in agorot (the only money type) and count; the shekel
  // string is formatting, at the edge, like everywhere else.
  const now = Date.now()
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const DAYS_30 = 30 * 24 * 60 * 60 * 1000
  const todayRows = rows.filter(
    (row) => row.redeemedAt && new Date(row.redeemedAt).getTime() >= startOfToday.getTime(),
  )
  const monthRows = rows.filter(
    (row) => row.redeemedAt && now - new Date(row.redeemedAt).getTime() <= DAYS_30,
  )
  const todayDue = sumAgorot(todayRows.map((row) => agorot(row.remainingAmountDueAgorot)))
  const monthDue = sumAgorot(monthRows.map((row) => agorot(row.remainingAmountDueAgorot)))

  return (
    <div className="space-y-5">
      <section>
        <h1 className="text-2xl font-bold text-heading">מימושי קופונים</h1>
        <p className="mt-1 text-sm text-gray-500">
          היסטוריית סריקות לבית העסק. יתרת הגבייה נגבית מהלקוח בקופה.
        </p>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">היום</p>
          <p className="text-2xl font-extrabold text-heading">{todayRows.length}</p>
          <p className="text-xs text-gray-500">
            לגבייה <span dir="ltr">{formatIls(todayDue)}</span>
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">30 הימים האחרונים</p>
          <p className="text-2xl font-extrabold text-heading">{monthRows.length}</p>
          <p className="text-xs text-gray-500">
            לגבייה <span dir="ltr">{formatIls(monthDue)}</span>
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-300 bg-white px-4 py-10 text-center text-sm text-gray-500">
          אין מימושים עדיין.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.voucherId}
              className="rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-heading">{row.productName}</p>
                  <p className="mt-0.5 font-mono text-sm tracking-wider text-gray-700" dir="ltr">
                    {formatVoucherCode(row.code)}
                  </p>
                  {row.customerName ? (
                    <p className="mt-1 text-xs text-gray-500">לקוח: {row.customerName}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-gray-400">{formatDate(row.redeemedAt)}</p>
                </div>
                <div className="shrink-0 text-end">
                  <p className="text-xs text-gray-500">לגבייה בעסק</p>
                  <p className="text-lg font-extrabold text-heading" dir="ltr">
                    {formatIls(agorot(row.remainingAmountDueAgorot))}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    עמלה {row.platformPercent}% · שולם באתר{' '}
                    <span dir="ltr">{formatIls(agorot(row.couponPriceAgorot))}</span>
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
