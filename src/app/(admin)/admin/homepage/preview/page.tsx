import CmsHero from '@/components/home/CmsHero'
import HomepageSections from '@/components/home/HomepageSections'
import { requireAdminPage } from '@/lib/admin/rbac'
import Link from 'next/link'

export const metadata = { title: 'תצוגה מקדימה של עמוד הבית' }

/**
 * The home page as it will be, schedule ignored.
 *
 * `preview` READS THE BASE TABLES AND NOT THE LIVE VIEWS. That is the whole
 * difference, and 127 built it that way on purpose: the views apply the window
 * against the database's clock, so a campaign configured for next Tuesday is
 * invisible in them. Here it renders. A "preview" that showed only what is
 * already live would be a screenshot of the site.
 *
 * IT IS NOT A DRAFT COPY OF THE PAGE. There is one set of rows; preview differs
 * from live only in which query reads them. A second, draft version of every
 * section would be a page that drifts from the one being edited, and the
 * operator would be approving something other than what publishes.
 *
 * WHAT THIS DOES NOT SHOW: the header, the footer and the storefront chrome,
 * because they belong to the `(store)` layout and this page is inside
 * `(admin)`. Rendering the sections alone is the honest half - it is the part
 * the console controls - and the chrome is identical on every page anyway.
 */
export default async function HomepagePreviewPage() {
  await requireAdminPage()

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">תצוגה מקדימה</h1>
          <p className="mt-1 text-sm text-gray-600">
            כולל סעיפים שעדיין לא התחילו או שכבר הסתיימו. סעיף כבוי אינו מוצג גם כאן.
          </p>
        </div>
        <Link
          href="/admin/homepage"
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
        >
          חזרה לרשימה
        </Link>
      </header>

      <div dir="rtl" className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <CmsHero preview />
        <HomepageSections preview />
      </div>
    </div>
  )
}
