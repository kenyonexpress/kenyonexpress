'use client'

import {
  type PopularSearchState,
  removePopularSearch,
  savePopularSearch,
} from '@/server/actions/admin/popular-searches'
import { useActionState } from 'react'

interface Row {
  id: string
  term: string
  target_url: string | null
  position: number
  is_active: boolean
}

function message(state: PopularSearchState): { text: string; ok: boolean } | null {
  if (!state) return null
  return 'error' in state ? { text: state.error, ok: false } : { text: state.success, ok: true }
}

/**
 * The promoted-terms editor.
 *
 * CURATED, NOT COMPUTED, and the page above it explains why: ranking
 * `search_events` by count and publishing the top of it means putting whatever
 * a handful of visitors typed - including typos and competitor names - into the
 * header of every page. The measured list is right there for an operator to
 * pick from; this is where they decide.
 *
 * Two separate forms and two separate actions rather than one with a hidden
 * intent field: a delete that arrives because a submit button was mislabelled
 * is not recoverable from this screen.
 */
export default function PopularSearchesEditor({ initial }: { initial: Row[] }) {
  const [saveState, saveAction, savePending] = useActionState<PopularSearchState, FormData>(
    savePopularSearch,
    null,
  )
  const [removeState, removeAction] = useActionState<PopularSearchState, FormData>(
    removePopularSearch,
    null,
  )

  const feedback = message(saveState) ?? message(removeState)

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="text-lg font-semibold">חיפושים פופולריים (מנוהל)</h2>
      <p className="mt-1 mb-4 text-sm text-gray-500">
        מוצג בתיבת החיפוש לפני שמקלידים. אלה המונחים שאתם בוחרים לקדם, לא מה שנמדד.
      </p>

      {feedback && (
        <p
          className={`mb-4 rounded-lg px-3 py-2 text-sm ${
            feedback.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
          }`}
        >
          {feedback.text}
        </p>
      )}

      <form action={saveAction} className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="ps-term" className="mb-1 block text-xs font-medium text-gray-600">
            מונח
          </label>
          <input
            id="ps-term"
            name="term"
            required
            maxLength={60}
            placeholder="ספא זוגי"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="ps-url" className="mb-1 block text-xs font-medium text-gray-600">
            קישור (אופציונלי, נתיב פנימי)
          </label>
          <input
            id="ps-url"
            name="target_url"
            maxLength={300}
            dir="ltr"
            placeholder="/category/spa"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="ps-position" className="mb-1 block text-xs font-medium text-gray-600">
            סדר
          </label>
          <input
            id="ps-position"
            name="position"
            type="number"
            min={0}
            max={999}
            defaultValue={0}
            className="w-20 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="is_active" defaultChecked />
          פעיל
        </label>
        <button
          type="submit"
          disabled={savePending}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-heading disabled:opacity-60"
        >
          {savePending ? 'שומר...' : 'הוספה'}
        </button>
      </form>

      {initial.length === 0 ? (
        <p className="text-sm text-gray-500">עדיין לא הוגדרו חיפושים פופולריים.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {initial.map((row) => (
            <li key={row.id} className="flex items-center gap-3 py-2.5">
              <span className="w-10 text-xs text-gray-400">{row.position}</span>
              <span className="flex-1 text-sm font-medium">{row.term}</span>
              {row.target_url && (
                <span dir="ltr" className="text-xs text-gray-500">
                  {row.target_url}
                </span>
              )}
              {!row.is_active && (
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">כבוי</span>
              )}
              <form action={removeAction}>
                <input type="hidden" name="id" value={row.id} />
                <button type="submit" className="text-xs text-red-600 hover:underline">
                  מחיקה
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
