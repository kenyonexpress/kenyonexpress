import HomepageSectionForm from '@/components/admin/HomepageSectionForm'
import HomepageSectionRow from '@/components/admin/HomepageSectionRow'
import { listHomepageBanners, listHomepageSections, railRuleCounts } from '@/lib/admin/homepage'
import { requireAdminPage } from '@/lib/admin/rbac'
import Link from 'next/link'

export const metadata = { title: 'עמוד הבית' }

/**
 * The homepage merchandising console.
 *
 * WHAT THE OPERATOR NEEDS TO BE TOLD BEFORE THEY TOUCH ANYTHING, and what the
 * banner at the top says: with NO rows, the home page renders its authored
 * default, which is what is on the site today. The first section saved and
 * activated is the moment the page starts being configured, and from then on
 * the list here IS the page. That is not obvious from a list that starts empty,
 * and an operator who adds one rail and finds the rest of the page unchanged
 * would be right to be confused - it is not unchanged, it is being rendered
 * from the same list they just joined.
 */
export default async function AdminHomepagePage() {
  await requireAdminPage()
  const [{ sections, applied }, banners, ruleCounts] = await Promise.all([
    listHomepageSections(),
    listHomepageBanners(),
    railRuleCounts(),
  ])

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">עמוד הבית</h1>
          <p className="mt-1 text-sm text-gray-600">סעיפי עמוד הבית, לפי הסדר שבו הם מרונדרים.</p>
        </div>
        <Link
          href="/admin/homepage/preview"
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
        >
          תצוגה מקדימה
        </Link>
      </header>

      {!applied && (
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          לא ניתן לקרוא את טבלאות עמוד הבית. ייתכן ש-127 לא הוחלה על מסד הנתונים הזה.
        </div>
      )}

      {applied && sections.length === 0 && (
        <div className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-900">
          אין עדיין אף סעיף, ולכן עמוד הבית מרנדר את ברירת המחדל שבקוד - וזה בדיוק מה שמופיע באתר
          עכשיו. הסעיף הראשון שיישמר ויופעל הוא הרגע שבו הרשימה הזאת הופכת להיות העמוד. שימו לב:
          מרגע זה גם רצועת היתרונות ורשת המוצרים צריכות להופיע ברשימה, אחרת הן ייעלמו.
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3 text-start">סעיף</th>
              <th className="px-4 py-3 text-start">מיקום</th>
              <th className="px-4 py-3 text-start">חלון</th>
              <th className="px-4 py-3 text-start">מצב</th>
              <th className="px-4 py-3 text-end">פעולות</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {sections.map((section, index) => (
              <HomepageSectionRow
                key={section.id}
                section={section}
                isFirst={index === 0}
                isLast={index === sections.length - 1}
              />
            ))}
            {sections.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                  אין סעיפים
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">הוספת סעיף</h2>
        <HomepageSectionForm ruleCounts={ruleCounts} />
      </section>

      <section>
        <h2 className="mb-1 text-lg font-semibold text-gray-900">שקופיות ובאנרים</h2>
        <p className="mb-3 text-sm text-gray-600">
          {banners.length === 0
            ? 'אין שקופיות במסד הנתונים, ולכן הקרוסלה מרנדרת את השקופיות שבקוד. גאומטריה של שקופית נקבעת בקוד ולא כאן - ראו lib/homepage/cms.ts.'
            : `${banners.length} שורות. גאומטריה נקבעת בקוד ולא כאן.`}
        </p>
        {banners.length > 0 && (
          <ul className="divide-y divide-gray-200 rounded-xl border border-gray-200 bg-white">
            {banners.map((banner) => (
              <li key={banner.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <span className="font-medium text-gray-900">{banner.placement}</span>
                <span className="text-gray-600">{banner.titleHe ?? banner.altHe}</span>
                <span className="text-gray-500">#{banner.position}</span>
                <span className={banner.isActive ? 'text-green-700' : 'text-gray-500'}>
                  {banner.isActive ? 'פעיל' : 'כבוי'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
