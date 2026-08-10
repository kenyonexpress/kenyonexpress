import { requireSection } from '@/lib/admin/rbac'
import { createClient } from '@/lib/supabase/server'
import PopularSearchesEditor from './PopularSearchesEditor'

export const metadata = { title: 'חיפוש' }

/**
 * What shoppers looked for, and what the site offers them before they type.
 *
 * TWO TABLES ON ONE PAGE BECAUSE ONE FEEDS THE OTHER. The empty-result list is
 * the raw material and the promoted list is the decision; splitting them across
 * two pages would mean copying a term between tabs.
 *
 * THE EMPTY LIST IS THE MORE VALUABLE HALF. A query that returned nothing is a
 * customer saying, in their own words, what this catalogue does not sell. It is
 * the only feedback channel that costs them nothing and reaches us anyway.
 *
 * `search_events` carries no user and no IP, deliberately - see 118. Everything
 * on this page is about terms, never about people.
 */

const EMPTY_LIMIT = 40
const TOP_LIMIT = 25

type SearchEvent = {
  term: string
  raw_term: string
  searches: number
  empty_results: number
  last_hits: number | null
  last_seen_at: string
}

function when(iso: string): string {
  return new Date(iso).toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default async function AdminSearchPage() {
  await requireSection('analytics')
  const supabase = await createClient()

  const [emptyResult, topResult, popularResult] = await Promise.all([
    supabase
      .from('search_events')
      .select('term, raw_term, searches, empty_results, last_hits, last_seen_at')
      .gt('empty_results', 0)
      .order('empty_results', { ascending: false })
      .order('last_seen_at', { ascending: false })
      .limit(EMPTY_LIMIT),
    supabase
      .from('search_events')
      .select('term, raw_term, searches, empty_results, last_hits, last_seen_at')
      .order('searches', { ascending: false })
      .limit(TOP_LIMIT),
    supabase
      .from('popular_searches')
      .select('id, term, target_url, position, is_active')
      .order('position', { ascending: true })
      .order('term', { ascending: true }),
  ])

  // A deployment without 118 shows empty tables rather than a 500. Same rule
  // the invoice queue applies to a database without 107.
  const empty = (emptyResult.data ?? []) as unknown as SearchEvent[]
  const top = (topResult.data ?? []) as unknown as SearchEvent[]
  const popular = (popularResult.data ?? []) as unknown as {
    id: string
    term: string
    target_url: string | null
    position: number
    is_active: boolean
  }[]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">חיפוש</h1>
        <p className="mt-1 text-sm text-gray-500">
          מה חיפשו ולא מצאו, ומה מוצג בתיבת החיפוש לפני שמקלידים.
        </p>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold">חיפושים ללא תוצאות</h2>
        <p className="mt-1 mb-4 text-sm text-gray-500">
          כל שורה כאן היא לקוח שאמר במילים שלו מה חסר בקטלוג.
        </p>

        {empty.length === 0 ? (
          <p className="text-sm text-gray-500">אין עדיין חיפושים ריקים.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-right text-xs text-gray-500">
                  <th className="py-2 font-medium">מונח</th>
                  <th className="py-2 font-medium">חיפושים</th>
                  <th className="py-2 font-medium">מתוכם ריקים</th>
                  <th className="py-2 font-medium">תוצאות אחרונות</th>
                  <th className="py-2 font-medium">נראה לאחרונה</th>
                </tr>
              </thead>
              <tbody>
                {empty.map((row) => (
                  <tr key={row.term} className="border-b border-gray-100">
                    <td className="py-2 font-medium">{row.raw_term}</td>
                    <td className="py-2">{row.searches}</td>
                    <td className="py-2 font-semibold text-red-600">{row.empty_results}</td>
                    <td className="py-2">{row.last_hits ?? 0}</td>
                    <td className="py-2 text-gray-500">{when(row.last_seen_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold">החיפושים הנפוצים ביותר</h2>
        <p className="mt-1 mb-4 text-sm text-gray-500">
          נמדד, לא מנוהל. זו הרשימה שממנה בוחרים מה לקדם למטה.
        </p>
        {top.length === 0 ? (
          <p className="text-sm text-gray-500">אין עדיין נתוני חיפוש.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {top.map((row) => (
              <span
                key={row.term}
                className="rounded-full bg-gray-100 px-3 py-1 text-sm"
                title={`${row.searches} חיפושים`}
              >
                {row.raw_term}
                <span className="mr-1.5 text-xs text-gray-500">{row.searches}</span>
              </span>
            ))}
          </div>
        )}
      </section>

      <PopularSearchesEditor initial={popular} />
    </div>
  )
}
