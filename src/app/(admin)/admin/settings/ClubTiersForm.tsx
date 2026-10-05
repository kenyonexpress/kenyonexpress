'use client'

import {
  CLUB_TIER_LABELS,
  EDITABLE_CLUB_TIERS,
  type EditableClubTierId,
} from '@/lib/admin/club-tiers-settings'
import { type ClubTiersActionState, updateClubTiers } from '@/server/actions/admin/club-tiers'
import { useActionState } from 'react'

interface Props {
  /** Shekel strings per editable tier, already formatted from agorot. */
  values: Record<EditableClubTierId, string>
  readOnly: boolean
}

const INITIAL: ClubTiersActionState = null

const input =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand disabled:bg-gray-50'

/**
 * Three shekel fields, one per paid tier. `member` is shown as a fixed line:
 * it is the floor and the table pins it to zero.
 */
export default function ClubTiersForm({ values, readOnly }: Props) {
  const [state, action, pending] = useActionState(updateClubTiers, INITIAL)

  return (
    <form action={action} className="space-y-4" data-testid="club-tiers-form">
      <p className="text-xs text-gray-600">{CLUB_TIER_LABELS.member}</p>
      <fieldset disabled={readOnly || pending} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {EDITABLE_CLUB_TIERS.map((id) => (
          <label key={id} className="block text-sm">
            <span className="mb-1 block text-xs text-gray-600">{CLUB_TIER_LABELS[id]}</span>
            <input name={id} inputMode="decimal" defaultValue={values[id]} className={input} />
          </label>
        ))}
      </fieldset>
      <p className="text-xs text-gray-500">
        הדרגה מחושבת מסכום הרכישות ששולמו באתר ב-365 הימים האחרונים. הספים חייבים לעלות: כסף &lt;
        זהב &lt; פלטינה. תצוגה בלבד, אין עדיין הטבות או הנחות לפי דרגה.
      </p>
      {state && 'error' in state ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
      {state && 'success' in state ? (
        <output className="block text-sm text-green-700">{state.success}</output>
      ) : null}
      {readOnly ? null : (
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-gray-900 disabled:opacity-60"
        >
          {pending ? 'שומר...' : 'שמירת ספים'}
        </button>
      )}
    </form>
  )
}
