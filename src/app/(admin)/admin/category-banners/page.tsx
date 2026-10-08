import CategoryBannerRowActions from '@/components/admin/CategoryBannerRowActions'
import { canWriteSection } from '@/lib/admin/permissions'
import { requireSection } from '@/lib/admin/rbac'
import {
  type AdminCategoryBanner,
  STATS_WINDOW_DAYS,
  listCategoryBannersForAdmin,
} from '@/lib/category-banners/admin-read'
import { bannerPhase } from '@/lib/category-banners/rules'
import Link from 'next/link'

export const metadata = { title: 'באנרים לקטגוריות' }

const when = (iso: string | null) =>
  iso === null
    ? null
    : new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short' }).format(
        new Date(iso),
      )

function stateOf(banner: AdminCategoryBanner): {
  label: string
  tone: 'live' | 'pending' | 'off'
} {
  const phase = bannerPhase(banner, new Date())
  if (phase === 'off') return { label: 'כבוי', tone: 'off' }
  if (phase === 'scheduled') return { label: 'מתוזמן', tone: 'pending' }
  if (phase === 'ended') return { label: 'הסתיים', tone: 'off' }
  return { label: 'מוצג', tone: 'live' }
}

const TONE = {
  live: 'rounded bg-green-100 px-2 py-1 text-xs text-green-800',
  pending: 'rounded bg-amber-100 px-2 py-1 text-xs text-amber-900',
  off: 'rounded bg-gray-100 px-2 py-1 text-xs text-gray-700',
} as const

function windowText(banner: AdminCategoryBanner): string {
  const start = when(banner.starts_at)
  const end = when(banner.ends_at)
  if (start === null && end === null) return 'תמיד'
  if (start === null) return `עד ${end}`
  if (end === null) return `מ-${start}`
  return `${start} — ${end}`
}

/**
 * Every category banner (STEP 62) with its phase, its window, and the
 * counters over the last month. The content role composes; the list lives
 * under the catalogue permission because a banner is catalogue copy.
 */
export default async function CategoryBannersPage() {
  const session = await requireSection('catalog', 'read')
  const canWrite = canWriteSection(session.role, 'catalog')
  const { banners, tableExists, error } = await listCategoryBannersForAdmin()

  return (
    <div dir="rtl" className="space-y-6 p-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">באנרים לקטגוריות</h1>
          <p className="mt-1 text-sm text-gray-600">
            באנר בראש עמוד קטגוריה: כותרת, תמונה וכפתור, עם חלון הצגה ועדיפות. כשיש כמה באנרים
            פעילים לאותה קטגוריה מוצג בעל העדיפות הגבוהה. הספירות הן ל-{STATS_WINDOW_DAYS} הימים
            האחרונים.
          </p>
        </div>
        {canWrite && tableExists && (
          <Link
            href="/admin/category-banners/new"
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white"
          >
            באנר חדש
          </Link>
        )}
      </header>

      {!tableExists && (
        <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
          טבלת הבאנרים עוד לא הוחלה (מיגרציה 267). עד אז עמודי הקטגוריות מוצגים בלי באנר.
        </p>
      )}
      {error && (
        <p className="rounded-lg bg-red-50 p-4 text-sm text-red-800">
          טעינת הבאנרים נכשלה: {error}
        </p>
      )}

      {tableExists && banners.length === 0 && !error ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-gray-500">
          אין עדיין באנרים.
        </p>
      ) : (
        banners.length > 0 && (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-right">
                <tr>
                  <th className="px-4 py-3 font-medium">כותרת</th>
                  <th className="px-4 py-3 font-medium">מצב</th>
                  <th className="px-4 py-3 font-medium">קטגוריה</th>
                  <th className="px-4 py-3 font-medium">חלון</th>
                  <th className="px-4 py-3 font-medium">עדיפות</th>
                  <th className="px-4 py-3 font-medium">חשיפות</th>
                  <th className="px-4 py-3 font-medium">קליקים</th>
                  <th className="px-4 py-3 font-medium">יחס</th>
                  {canWrite && <th className="px-4 py-3 font-medium">פעולות</th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {banners.map((banner) => {
                  const state = stateOf(banner)
                  return (
                    <tr key={banner.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/category-banners/${banner.id}`}
                          className="font-medium underline"
                        >
                          {banner.title_he}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className={TONE[state.tone]}>{state.label}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {banner.category_slug ? (
                          <Link
                            href={`/category/${banner.category_slug}`}
                            className="underline"
                            prefetch={false}
                          >
                            {banner.category_name_he ?? banner.category_slug}
                          </Link>
                        ) : (
                          (banner.category_name_he ?? banner.category_id)
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        <bdi>{windowText(banner)}</bdi>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-gray-700">{banner.priority}</td>
                      <td className="px-4 py-3 tabular-nums text-gray-700">{banner.impressions}</td>
                      <td className="px-4 py-3 tabular-nums text-gray-700">{banner.clicks}</td>
                      <td className="px-4 py-3 tabular-nums text-gray-700">
                        {banner.ctr === null ? '—' : <bdi>{banner.ctr}%</bdi>}
                      </td>
                      {canWrite && (
                        <td className="px-4 py-3">
                          <CategoryBannerRowActions
                            id={banner.id}
                            isActive={banner.is_active}
                            title={banner.title_he}
                          />
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}
