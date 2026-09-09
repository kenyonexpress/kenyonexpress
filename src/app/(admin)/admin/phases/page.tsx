import PhaseToggle from '@/components/admin/PhaseToggle'
import { readPhaseCounts } from '@/lib/admin/phases'
import { requireAdminPage } from '@/lib/admin/rbac'
import { readPhaseConfigForAdmin } from '@/lib/commerce/phases'

export const metadata = { title: 'שלבי מוצר' }

/**
 * Which product types the shop is selling.
 *
 * THE NUMBERS ARE THE POINT OF THIS SCREEN. [89] assigns coupons to phase 1 and
 * physical products to phase 2, and describes phase 2 as something the admin
 * turns on after ten sales. Measured on production, every one of the 44 active
 * products is `physical` and there are 2 sales - so the section's own
 * arrangement, applied literally, would empty the shop while the condition for
 * refilling it is five times away.
 *
 * That is not an argument against the feature. It is an argument for putting
 * the count next to the switch, so an operator flipping one can see what it
 * does before it does it.
 */
export default async function AdminPhasesPage() {
  await requireAdminPage()
  const [rows, counts] = await Promise.all([readPhaseConfigForAdmin(), readPhaseCounts()])

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">שלבי מוצר</h1>
        <p className="mt-1 text-sm text-gray-600">
          אילו סוגי מוצר החנות מוכרת כרגע. סוג שכבוי אינו מופיע בקטלוג, אינו נמכר, ודף המוצר שלו
          מחזיר 404.
        </p>
      </header>

      <div className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-900">
        <p>
          מכירות עד כה: <strong>{counts.ordersSold}</strong> מתוך{' '}
          <strong>{counts.ordersThreshold}</strong> שהסעיף מציין כתנאי להדלקת שלב 2.
        </p>
        <p className="mt-1">
          שימו לב: כל המוצרים הפעילים באתר הם מסוג <strong>physical</strong>, שהסעיף מסווג כשלב 2.
          כיבוי שלב 2 מרוקן את החנות.
        </p>
      </div>

      {rows === null ? (
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          לא ניתן לקרוא את טבלת השלבים. ייתכן ש-
          <span dir="ltr">migrations/pending/210_product_phases.sql</span> עדיין לא הוחלה. כל סוגי
          המוצר נחשבים פעילים עד שתוחל.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3 text-start">סוג</th>
                <th className="px-4 py-3 text-start">שלב</th>
                <th className="px-4 py-3 text-start">מצב</th>
                <th className="px-4 py-3 text-start">פעילים</th>
                <th className="px-4 py-3 text-start">סה״כ</th>
                <th className="px-4 py-3 text-start">הערה</th>
                <th className="px-4 py-3 text-end" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {rows.map((row) => (
                <tr key={row.productType} className={row.isEnabled ? '' : 'bg-gray-50'}>
                  <td className="px-4 py-3 font-medium text-gray-900" dir="ltr">
                    {row.productType}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{row.phase}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        row.isEnabled
                          ? 'rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800'
                          : 'rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-700'
                      }
                    >
                      {row.isEnabled ? 'נמכר' : 'כבוי'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-900">
                    {counts.activeByType[row.productType] ?? 0}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {counts.totalByType[row.productType] ?? 0}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{row.note ?? '—'}</td>
                  <td className="px-4 py-3 text-end">
                    <PhaseToggle
                      productType={row.productType}
                      enabled={row.isEnabled}
                      activeCount={counts.activeByType[row.productType] ?? 0}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
