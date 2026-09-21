'use client'

import { type FlagActionState, setFeatureFlag } from '@/server/actions/admin/feature-flags'
import { useActionState } from 'react'

const EMPTY: FlagActionState = null

export default function FeatureFlagToggle({
  flagKey,
  enabled,
  lockedByEnv,
}: {
  flagKey: string
  enabled: boolean
  lockedByEnv: boolean
}) {
  const [state, action, pending] = useActionState(setFeatureFlag, EMPTY)
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="key" value={flagKey} />
      <input type="hidden" name="enabled" value={enabled ? 'false' : 'true'} />
      <button
        type="submit"
        disabled={pending || lockedByEnv}
        title={
          lockedByEnv ? 'הסביבה מגדירה ערך לדגל הזה; השורה בטבלה לא תשפיע עד שיוסר' : undefined
        }
        className="min-h-11 rounded-lg border border-gray-300 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        {enabled ? 'כיבוי' : 'הדלקה'}
      </button>
      {state && 'error' in state ? (
        <output className="text-xs text-red-700">{state.error}</output>
      ) : null}
      {state && 'success' in state ? (
        <output className="text-xs text-green-700">{state.success}</output>
      ) : null}
    </form>
  )
}
