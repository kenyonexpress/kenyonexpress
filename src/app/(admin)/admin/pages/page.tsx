import ContentPageStatusButton from '@/components/admin/ContentPageStatusButton'
import { listContentPages } from '@/lib/admin/content-pages'
import { requireAdminPage } from '@/lib/admin/rbac'
import Link from 'next/link'

export const metadata = { title: 'עמודי תוכן' }

/**
 * The content-page console.
 *
 * IT LISTS THE BUILT-IN PAGES TOO, before they have a row. Four of the five
 * live on the site today with their text compiled in, and a console that showed
 * only database rows would be EMPTY on the day this ships - giving an operator
 * who came to edit `/about` no way to reach it and no explanation.
 *
 * `requireAdminPage` and not `requireSection('catalog', ...)`: these pages are
 * what the business says about itself, including how refunds and cancellations
 * work, and under Israeli consumer law that is a binding claim. The
 * `content_uploader` role exists to load catalogue copy and stops here.
 */
export default async function AdminContentPagesPage() {
  await requireAdminPage()
  const { pages, applied } = await listContentPages()

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">עמודי תוכן</h1>
        <p className="mt-1 text-sm text-gray-600">
          הטקסט של עמודי המידע באתר. שינוי כאן מתפרסם בלי לפרוס גרסה חדשה.
        </p>
      </header>

      {!applied && (
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          מיגרציה 205 עדיין לא הוחלה, ולכן אי אפשר לשמור. העמודים למטה הם הטקסט שמגיע מהקוד והוא מה
          שמוצג באתר כרגע. הקובץ: <span dir="ltr">migrations/pending/205_content_pages.sql</span>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3 text-start">עמוד</th>
              <th className="px-4 py-3 text-start">כתובת</th>
              <th className="px-4 py-3 text-start">מצב</th>
              <th className="px-4 py-3 text-start">עודכן</th>
              <th className="px-4 py-3 text-start" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {pages.map((page) => (
              <tr key={page.slug}>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/pages/${page.slug}`}
                    className="font-medium text-gray-900 underline underline-offset-2"
                  >
                    {page.title}
                  </Link>
                  <span className="ms-2 text-xs text-gray-500" dir="ltr">
                    {page.slug}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600" dir="ltr">
                  {page.href}
                </td>
                <td className="px-4 py-3">
                  {page.builtIn ? (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                      מהקוד
                    </span>
                  ) : (
                    <span
                      className={
                        page.status === 'published'
                          ? 'rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800'
                          : 'rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800'
                      }
                    >
                      {page.status === 'published' ? 'מפורסם' : 'טיוטה'}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {page.updatedAt ? new Date(page.updatedAt).toLocaleDateString('he-IL') : '—'}
                </td>
                <td className="px-4 py-3 text-end">
                  {page.id && (
                    <ContentPageStatusButton
                      pageId={page.id}
                      slug={page.slug}
                      status={page.status}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
