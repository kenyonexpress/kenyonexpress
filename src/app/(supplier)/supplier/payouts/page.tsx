import { formatDate, formatIls } from '@/lib/account/format'
import { agorot } from '@/lib/money'
import {
  SETTLEMENT_LABEL_HE,
  sumPayoutBreakdown,
  toPayoutBreakdown,
} from '@/lib/supplier/dashboard'
import { requireSupplierRole } from '@/lib/supplier/rbac'
import { getSupplierSales } from '@/server/queries/supplier'

export const metadata = { title: 'תשלומים' }

export default async function SupplierPayoutsPage() {
  const session = await requireSupplierRole('owner', '/supplier/payouts')
  const sales = await getSupplierSales(session.supplierId)
  const lines = toPayoutBreakdown(sales)
  const totals = sumPayoutBreakdown(lines)

  return (
    <div className="space-y-5">
      <section>
        <h1 className="text-2xl font-bold text-heading">תשלומים לפי עמלה</h1>
        <p className="mt-1 text-sm text-gray-500">
          כל שורה מציגה את החלוקה לפי אחוז עמלת הפלטפורמה של המוצר: חלק הפלטפורמה מול החלק שמגיע
          לספק (מיידי בפיזי, מוחזק עד מימוש בקופון).
        </p>
      </section>

      <div className="grid grid-cols-3 gap-2">
        <Summary label="ברוטו לחישוב" value={formatIls(agorot(totals.grossAgorot))} />
        <Summary label="עמלת פלטפורמה" value={formatIls(agorot(totals.platformFeeAgorot))} />
        <Summary label="מגיע לספק" value={formatIls(agorot(totals.supplierPayoutAgorot))} />
      </div>

      {lines.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-300 bg-white px-4 py-10 text-center text-sm text-gray-500">
          אין הזמנות ששולמו עדיין.
        </p>
      ) : (
        <ul className="space-y-2">
          {lines.map((line) => (
            <li
              key={line.orderItemId}
              className="rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-heading">{line.productName}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {line.productType === 'coupon'
                      ? 'קופון'
                      : line.productType === 'physical'
                        ? 'מוצר פיזי'
                        : 'מוצר'}
                    {' · '}
                    {formatDate(line.paidAt)}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    סטטוס:{' '}
                    {SETTLEMENT_LABEL_HE[line.settlementStatus ?? ''] ??
                      line.settlementStatus ??
                      '—'}
                  </p>
                </div>
                <div className="shrink-0 text-end text-sm">
                  <p className="text-xs text-gray-500">
                    עמלה {line.platformPercent != null ? `${line.platformPercent}%` : 'לא הוגדר'}
                  </p>
                  <p className="mt-1 text-gray-600" dir="ltr">
                    ברוטו {formatIls(agorot(line.grossAgorot))}
                  </p>
                  <p className="text-gray-600" dir="ltr">
                    פלטפורמה {formatIls(agorot(line.platformFeeAgorot))}
                  </p>
                  <p className="font-extrabold text-heading" dir="ltr">
                    ספק {formatIls(agorot(line.supplierPayoutAgorot))}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs leading-relaxed text-gray-400">
        הערה: דוחות תשלום מרוכזים (T+3, מינימום 100 ₪) יופיעו כאן אחרי החלת טבלאות הדוחות. כרגע
        התצוגה נבנית ישירות משורות ההזמנה והפיצול.
      </p>
    </div>
  )
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-3 text-center shadow-sm">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className="mt-1 text-base font-extrabold text-heading" dir="ltr">
        {value}
      </p>
    </div>
  )
}
