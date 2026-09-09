'use client'

import type { AdminSectionRow } from '@/lib/admin/homepage'
import { SECTION_KIND_LABELS } from '@/lib/homepage/sections'
import {
  type HomepageActionState,
  reorderHomepageSection,
  toggleHomepageSection,
} from '@/server/actions/admin/homepage'
import { useActionState } from 'react'

/**
 * One row of the homepage section list, with its toggle and its two move
 * buttons.
 *
 * A ROW WHOSE CONFIG DOES NOT PARSE SAYS SO HERE. `parseSectionConfig`
 * returning null means the page skips that section silently, which is the right
 * behaviour on a page every visitor lands on and an unexplained disappearance
 * in the console. This is where it gets explained.
 */

const INITIAL: HomepageActionState = null
const BUTTON =
  'rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 disabled:opacity-40'

export default function HomepageSectionRow({
  section,
  isFirst,
  isLast,
}: {
  section: AdminSectionRow
  isFirst: boolean
  isLast: boolean
}) {
  const [toggleState, toggle, togglePending] = useActionState(toggleHomepageSection, INITIAL)
  const [moveState, move, movePending] = useActionState(reorderHomepageSection, INITIAL)

  const error =
    (toggleState && 'error' in toggleState ? toggleState.error : null) ??
    (moveState && 'error' in moveState ? moveState.error : null)

  const window =
    section.startsAt || section.endsAt
      ? `${section.startsAt ? new Date(section.startsAt).toLocaleDateString('he-IL') : '—'} ← ${section.endsAt ? new Date(section.endsAt).toLocaleDateString('he-IL') : '—'}`
      : 'תמיד'

  return (
    <tr className={section.isActive ? '' : 'bg-gray-50'}>
      <td className="px-4 py-3">
        <span className="font-medium text-gray-900">{SECTION_KIND_LABELS[section.kind]}</span>
        {section.titleHe && <span className="ms-2 text-sm text-gray-600">{section.titleHe}</span>}
        {!section.configValid && (
          <p className="mt-1 text-xs text-red-700">
            ההגדרות אינן תקינות, ולכן הסעיף הזה אינו מרונדר בעמוד כלל.
          </p>
        )}
        {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
      </td>
      <td className="px-4 py-3 text-gray-600">{section.position}</td>
      <td className="px-4 py-3 text-gray-600">{window}</td>
      <td className="px-4 py-3">
        <span
          className={
            section.isActive
              ? 'rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800'
              : 'rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-700'
          }
        >
          {section.isActive ? 'פעיל' : 'כבוי'}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <form action={move}>
            <input type="hidden" name="id" value={section.id} />
            <input type="hidden" name="direction" value="up" />
            <button type="submit" disabled={movePending || isFirst} className={BUTTON}>
              למעלה
            </button>
          </form>
          <form action={move}>
            <input type="hidden" name="id" value={section.id} />
            <input type="hidden" name="direction" value="down" />
            <button type="submit" disabled={movePending || isLast} className={BUTTON}>
              למטה
            </button>
          </form>
          <form action={toggle}>
            <input type="hidden" name="id" value={section.id} />
            <input type="hidden" name="isActive" value={section.isActive ? 'false' : 'true'} />
            <button type="submit" disabled={togglePending} className={BUTTON}>
              {section.isActive ? 'כיבוי' : 'הפעלה'}
            </button>
          </form>
        </div>
      </td>
    </tr>
  )
}
