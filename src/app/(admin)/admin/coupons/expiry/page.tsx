import { requireSection } from '@/lib/admin/rbac'
import { agorot } from '@/lib/money'
import { shekels } from '@/lib/money-format'
import {
  type SupplierExpiryCounts,
  byExpiryRateDesc,
  formatRateBp,
  supplierExpiryMetric,
  totalExpiryMetric,
} from '@/lib/vouchers/expiry-metrics'
import { getSupplierExpiryMetrics } from '@/server/queries/expiry'

/**
 * How often coupons die unused, per supplier.
 *
 * =========================================================================
 * WHAT AN OPERATOR IS SUPPOSED TO DO WITH THIS
 * =========================================================================
 *
 * A high expiry rate is not automatically bad and the page does not pretend it
 * is. It means one of three things and they need different responses: the offer
 * window is too short for what it sells, the business is hard to reach or to
 * book, or the coupon was bought as a gift and forgotten. What the number is
 * for is deciding WHICH supplier to go and ask.
 *
 * The uncredited column is different: it is not a business signal at all, it is
 * an operational alarm. It is money owed to customers for lapsed coupons that
 * `credit_expired_vouchers()` has not moved yet. On a healthy night it is zero
 * by morning. A figure that persists means the credit job is failing or is
 * behind its 500-per-run cap, and the route's 500 on that failure goes into a
 * log nobody is watching.
 *
 * =========================================================================
 * `—` IS NOT `0.0%`
 * =========================================================================
 *
 * A supplier whose coupons are all still live has no rate: nothing has settled,
 * so there is no outcome to take a share of. Printing 0.0% would put them at the
 * top of a "best performing" reading of this table on no evidence at all, which
 * is why `supplierExpiryMetric` returns null and `byExpiryRateDesc` sorts those
 * rows last rather than treating null as zero.
 */

export const metadata = { title: 'תפוגת שוברים' }

/** A window, so a supplier is not judged forever on their first month. */
const WINDOW_DAYS = 365

export default async function AdminExpiryMetricsPage() {
  await requireSection('catalog', 'read')

  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const read = await getSupplierExpiryMetrics({ since })

  return (
    <div className="space-y-6" dir="rtl">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">תפוגת שוברים לפי ספק</h1>
        <p className="mt-1 text-sm text-gray-600">
          מתוך השוברים שכבר הוכרעו (מומשו או פגו), איזה חלק פג בלי שמומש. שוברים שעדיין בתוקף אינם
          נספרים, כי טרם הוכרעו. חלון של {WINDOW_DAYS} ימים אחרונים.
        </p>
      </header>

      {!read.available ? (
        // Never an empty table with zeros. A table of 0.0% is read as "nothing
        // expires here", which is a claim this page cannot make while the
        // function it reads is not installed.
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {read.missing
            ? 'המדד עדיין לא זמין: migrations/pending/227_voucher_expiry_engine.sql לא הוחלה.'
            : 'לא ניתן לקרוא את הנתונים כרגע.'}
        </p>
      ) : read.rows.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white px-4 py-6 text-sm text-gray-600">
          אין שוברים בחלון הזמן הזה.
        </p>
      ) : (
        <ExpiryTable rows={read.rows} />
      )}
    </div>
  )
}

function ExpiryTable({ rows }: { rows: SupplierExpiryCounts[] }) {
  const metrics = rows.map(supplierExpiryMetric).sort(byExpiryRateDesc)
  const total = totalExpiryMetric(rows)

  return (
    <section className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-start text-sm">
        <thead className="border-b border-gray-200 bg-gray-50 text-xs text-gray-600">
          <tr>
            <th className="px-4 py-3 font-medium">ספק</th>
            <th className="px-4 py-3 font-medium">שיעור תפוגה</th>
            <th className="px-4 py-3 font-medium">פג</th>
            <th className="px-4 py-3 font-medium">מומש</th>
            <th className="px-4 py-3 font-medium">בתוקף</th>
            <th className="px-4 py-3 font-medium">שווי שפג</th>
            <th className="px-4 py-3 font-medium">טרם הוחזר</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((row) => (
            <tr key={row.supplierId} className="border-b border-gray-100 last:border-0">
              <td className="px-4 py-3 font-medium text-gray-900">{row.supplierName ?? '—'}</td>
              <td className="px-4 py-3 font-bold text-gray-900" dir="ltr">
                {formatRateBp(row.rateBp)}
              </td>
              <td className="px-4 py-3 text-gray-700" dir="ltr">
                {row.expiredCount}
              </td>
              <td className="px-4 py-3 text-gray-700" dir="ltr">
                {row.redeemedCount}
              </td>
              <td className="px-4 py-3 text-gray-500" dir="ltr">
                {row.liveCount}
              </td>
              <td className="px-4 py-3 text-gray-700" dir="ltr">
                {shekels(agorot(row.expiredValueAgorot))}
              </td>
              {/*
                Amber only when there is something to chase. A zero here is the
                healthy state and colouring it would train the eye to ignore the
                column on the night it is not zero.
              */}
              <td
                className={`px-4 py-3 ${row.uncreditedAgorot > 0 ? 'font-bold text-amber-700' : 'text-gray-400'}`}
                dir="ltr"
              >
                {shekels(agorot(row.uncreditedAgorot))}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-gray-200 bg-gray-50 text-gray-900">
          <tr>
            <th className="px-4 py-3 text-start font-semibold">כל הפלטפורמה</th>
            <td className="px-4 py-3 font-bold" dir="ltr">
              {formatRateBp(total.rateBp)}
            </td>
            <td className="px-4 py-3" dir="ltr">
              {total.expiredCount}
            </td>
            <td className="px-4 py-3" dir="ltr">
              {total.redeemedCount}
            </td>
            <td className="px-4 py-3" dir="ltr">
              {total.liveCount}
            </td>
            <td className="px-4 py-3" dir="ltr">
              {shekels(agorot(total.expiredValueAgorot))}
            </td>
            <td className="px-4 py-3" dir="ltr">
              {shekels(agorot(total.uncreditedAgorot))}
            </td>
          </tr>
        </tfoot>
      </table>
      <p className="border-t border-gray-100 px-4 py-3 text-xs text-gray-500">
        שיעור התפוגה מחושב מתוך שוברים שהוכרעו בלבד: פג חלקי (פג + מומש). ספק בלי שוברים שהוכרעו
        מוצג כ-— ולא כ-0.0%, ומופיע בסוף הטבלה. עמודת &quot;טרם הוחזר&quot; היא כסף שמגיע ללקוחות על
        שוברים שפגו ועדיין לא עבר לארנק שלהם; בלילה תקין היא אפס.
      </p>
    </section>
  )
}
