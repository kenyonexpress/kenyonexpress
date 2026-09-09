import { requireAdminPage } from '@/lib/admin/rbac'
import { listSubscriptionsForAdmin } from '@/lib/admin/subscriptions'
import { agorot } from '@/lib/commerce/money'
import { formatDateTime } from '@/lib/i18n/format'
import { shekels } from '@/lib/money-format'

export const metadata = { title: 'מנויים' }

/**
 * The subscription console.
 *
 * WHAT [90] WAS MISSING. 135b is applied, the charge cron is real and the
 * customer page exists - and there was no admin route at all. A recurring
 * billing feature with no operator view means a `past_due` subscription is
 * invisible until the customer complains, which is exactly the case the three
 * dunning attempts exist to catch early.
 *
 * THE ORDER IS `past_due` FIRST. An operator opening this page is almost always
 * here because something failed, and sorting by creation date buries the three
 * rows that need them under fifty that do not.
 *
 * READ ONLY, ON PURPOSE. Cancelling somebody else's subscription is a money
 * decision with a consumer-law consequence - Israeli law gives the CUSTOMER the
 * right to cancel at any time, and the customer's own page is where that
 * happens. What an operator needs first is to see which cards have stopped
 * working, and that is what this is.
 */
export default async function AdminSubscriptionsPage() {
  await requireAdminPage()
  const { rows, applied, counts } = await listSubscriptionsForAdmin()

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">מנויים</h1>
        <p className="mt-1 text-sm text-gray-600">
          חיובים חוזרים. מוצגים לפי דחיפות: כשלי חיוב קודם, אחר כך פעילים.
        </p>
      </header>

      {!applied ? (
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          לא ניתן לקרוא את טבלת המנויים. ייתכן ש-135 לא הוחלה על מסד הנתונים הזה.
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-5">
            {(
              [
                ['פעילים', counts.active],
                ['בכשל חיוב', counts.pastDue],
                ['מושהים', counts.paused],
                ['מבוטלים', counts.canceled],
                ['מיצו ניסיונות', counts.exhausted],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-xs text-gray-500">{label}</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
              </div>
            ))}
          </div>

          {counts.exhausted > 0 && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-900">
              {counts.exhausted} מנויים מיצו את שלושת ניסיונות החיוב. אף ריצה לא תחייב אותם שוב: הם
              ממתינים לכרטיס חדש או להתערבות. הם אינם מבוטלים, וזו החלטה מכוונת - ביטול לקוח משלם
              בגלל כרטיס שפג תוקפו אינו החלטה של cron.
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-start">מצב</th>
                  <th className="px-4 py-3 text-start">סכום</th>
                  <th className="px-4 py-3 text-start">מחזור</th>
                  <th className="px-4 py-3 text-start">חיוב הבא</th>
                  <th className="px-4 py-3 text-start">חיוב אחרון</th>
                  <th className="px-4 py-3 text-start">כשלים</th>
                  <th className="px-4 py-3 text-start">נוצר</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {rows.map((row) => (
                  <tr key={row.id} className={row.exhausted ? 'bg-red-50' : ''}>
                    <td className="px-4 py-3">
                      <span
                        className={
                          row.status === 'past_due'
                            ? 'rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800'
                            : row.status === 'active'
                              ? 'rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800'
                              : 'rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-700'
                        }
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-900">{shekels(agorot(row.amountAgorot))}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {row.billingIntervalCount > 1
                        ? `${row.billingIntervalCount} × ${row.billingInterval}`
                        : row.billingInterval}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {row.nextChargeAt ? formatDateTime(row.nextChargeAt) : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {row.lastChargeAt ? formatDateTime(row.lastChargeAt) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={row.exhausted ? 'font-bold text-red-800' : 'text-gray-600'}>
                        {row.failedAttempts}/3
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDateTime(row.createdAt)}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                      אין מנויים. סוג המוצר <span dir="ltr">recurring</span> כבוי לפי מיגרציה 211.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
