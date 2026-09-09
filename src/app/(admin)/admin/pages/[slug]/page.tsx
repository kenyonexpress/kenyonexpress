import ContentPageForm from '@/components/admin/ContentPageForm'
import ContentRevisionList from '@/components/admin/ContentRevisionList'
import { getAdminContentPage, listContentRevisions } from '@/lib/admin/content-pages'
import { requireAdminPage } from '@/lib/admin/rbac'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const metadata = { title: 'עריכת עמוד תוכן' }

type Props = { params: Promise<{ slug: string }> }

/**
 * One page's editor, preview and history.
 *
 * The history is read here rather than inside the form, because a page with no
 * row has no history to read and the form should not have to know that. A
 * built-in page shows the sentence explaining why the list is empty instead of
 * an empty list, which are different facts.
 */
export default async function AdminContentPageEditor({ params }: Props) {
  await requireAdminPage()
  const { slug } = await params
  const page = await getAdminContentPage(slug)
  if (!page) notFound()

  const revisions = page.id ? await listContentRevisions(page.id) : []

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-baseline gap-3">
        <Link href="/admin/pages" className="text-sm text-gray-600 underline underline-offset-2">
          עמודי תוכן
        </Link>
        <span className="text-gray-400">/</span>
        <h1 className="text-2xl font-bold text-gray-900">{page.title}</h1>
        <a
          href={page.href}
          className="text-sm text-gray-600 underline underline-offset-2"
          dir="ltr"
        >
          {page.href}
        </a>
      </header>

      <ContentPageForm page={page} />

      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-1 text-lg font-semibold text-gray-900">היסטוריית שינויים</h2>
        <p className="mb-4 text-sm text-gray-600">
          כל שמירה נשמרת כגרסה מלאה. שחזור אינו מוחק כלום: הוא כותב את הגרסה הישנה קדימה כגרסה חדשה,
          כך שגם מה ששוחזר ממנו נשאר ברשימה.
        </p>
        {page.id ? (
          <ContentRevisionList pageId={page.id} slug={page.slug} revisions={revisions} />
        ) : (
          <p className="text-sm text-gray-500">
            העמוד הזה עדיין מגיע מהקוד ואין לו שורה במסד הנתונים, ולכן אין לו היסטוריה. השמירה
            הראשונה תיצור את השורה ואת גרסה 1.
          </p>
        )}
      </section>
    </div>
  )
}
