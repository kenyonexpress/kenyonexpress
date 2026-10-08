import { canWriteSection } from '@/lib/admin/permissions'
import { requireSection } from '@/lib/admin/rbac'
import type { LandingPage } from '@/lib/landing/blocks'
import { listLandingPages } from '@/lib/landing/read'
import { landingPath } from '@/lib/landing/slug'
import { LANDING_PREVIEW_PARAM } from '@/lib/landing/variant'
import Link from 'next/link'

export const metadata = { title: 'דפי נחיתה' }

const date = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat('he-IL', { dateStyle: 'short' }).format(new Date(iso)) : '—'

function statusView(page: LandingPage): { label: string; tone: 'live' | 'pending' | 'off' } {
  if (page.status === 'draft') return { label: 'טיוטה', tone: 'pending' }
  if (page.status === 'archived') return { label: 'בארכיון', tone: 'off' }
  const now = Date.now()
  if (page.startsAt && new Date(page.startsAt).getTime() > now) {
    return { label: 'מתוזמן', tone: 'pending' }
  }
  if (page.endsAt && new Date(page.endsAt).getTime() <= now) return { label: 'הסתיים', tone: 'off' }
  return { label: 'מפורסם', tone: 'live' }
}

const TONE = {
  live: 'border-green-200 bg-green-50 text-green-800',
  pending: 'border-amber-200 bg-amber-50 text-amber-900',
  off: 'border-gray-200 bg-gray-50 text-gray-600',
} as const

/**
 * Every campaign landing page, with its state, its arms and a preview link.
 * The content role sees and edits; the observer tier sees only.
 */
export default async function LandingPagesAdminPage() {
  const session = await requireSection('catalog', 'read')
  const canWrite = canWriteSection(session.role, 'catalog')
  const { pages, problems, tableExists } = await listLandingPages()

  return (
    <div dir="rtl" className="space-y-6 p-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">דפי נחיתה</h1>
          <p className="mt-1 text-sm text-gray-600">
            דפי קמפיין בכתובת <span dir="ltr">/lp/&lt;slug&gt;</span>. כל קישור בדף נושא את פרמטרי
            הקמפיין, וכל דף עם שתי גרסאות ומעלה מופיע בדוח ניסויי A/B.
          </p>
        </div>
        {canWrite && (
          <Link
            href="/admin/landing-pages/new"
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white"
          >
            דף חדש
          </Link>
        )}
      </header>

      {!tableExists && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          מיגרציה 262 עוד לא הוחלה: הרשימה מציגה את הדפים המובנים בקוד, ושמירה תיכשל עד שהטבלה תהיה
          קיימת.
        </p>
      )}

      {problems.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-medium">שורות שלא עוברות את הסכמה ולא מוצגות לגולשים:</p>
          <ul className="mt-1 list-disc ps-5">
            {problems.map((problem) => (
              <li key={problem.slug}>
                <span dir="ltr" className="font-mono">
                  {problem.slug}
                </span>
                : {problem.errors.slice(0, 3).join('; ')}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-start text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">כותרת</th>
              <th className="px-4 py-3 font-medium">כתובת</th>
              <th className="px-4 py-3 font-medium">מצב</th>
              <th className="px-4 py-3 font-medium">חלון</th>
              <th className="px-4 py-3 font-medium">גרסאות</th>
              <th className="px-4 py-3 font-medium">אינדוקס</th>
              <th className="px-4 py-3 font-medium">עודכן</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {pages.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                  עוד אין דפי נחיתה.
                </td>
              </tr>
            )}
            {pages.map((page) => {
              const view = statusView(page)
              return (
                <tr key={page.id}>
                  <td className="px-4 py-3 font-medium text-gray-900">{page.titleHe}</td>
                  <td className="px-4 py-3 font-mono text-xs" dir="ltr">
                    {landingPath(page.slug)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-lg border px-2 py-0.5 text-xs font-medium ${TONE[view.tone]}`}
                    >
                      {view.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {date(page.startsAt)} – {date(page.endsAt)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs" dir="ltr">
                    {page.variants.length > 0
                      ? page.variants.map((variant) => `${variant.key}:${variant.weight}`).join(' ')
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{page.indexable ? 'כן' : 'לא'}</td>
                  <td className="px-4 py-3 text-gray-600">{date(page.updatedAt)}</td>
                  <td className="px-4 py-3 text-end">
                    <a
                      href={`${landingPath(page.slug)}?${LANDING_PREVIEW_PARAM}=1`}
                      target="_blank"
                      rel="noreferrer"
                      className="me-3 text-blue-700 underline"
                    >
                      תצוגה
                    </a>
                    {canWrite && (
                      <Link
                        href={`/admin/landing-pages/${page.id}`}
                        className="text-blue-700 underline"
                      >
                        עריכה
                      </Link>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
