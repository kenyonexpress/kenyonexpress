'use client'

import { type ReportsActionState, refreshReports } from '@/server/actions/admin/reports'
import { RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

/**
 * "Rebuild now" for the nightly report tables.
 *
 * NOT `useActionState`, and the reason is the action's signature: it is
 * `refreshReports()` with no parameters, pinned by four tests, and
 * `useActionState` requires `(previousState, payload)`. Reshaping a tested
 * server action to fit a hook is the wrong way round, so this calls it
 * directly inside a transition and keeps the result in local state.
 *
 * `router.refresh()` and not a reliance on `revalidatePath` alone: the page is
 * dynamic (it reads cookies through the admin guard), so there is no cache
 * entry for a revalidate to invalidate, and without this the operator would
 * press the button, see "rebuilt", and read the same stale numbers.
 */
export default function RefreshReportsButton() {
  const [pending, startTransition] = useTransition()
  const [state, setState] = useState<ReportsActionState>(null)
  const router = useRouter()

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await refreshReports()
            setState(result)
            if (result && 'success' in result) router.refresh()
          })
        }
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-black/[0.04] disabled:opacity-60"
      >
        <RefreshCw size={14} aria-hidden="true" className={pending ? 'animate-spin' : undefined} />
        {pending ? 'בונה מחדש...' : 'רענן עכשיו'}
      </button>

      {/* `<output>` and not `<p role="status">`: it carries the same implicit
          live region and is the element the linter and the spec both want. */}
      {state && (
        <output
          className={
            'error' in state ? 'text-sm text-red-700' : 'text-sm font-medium text-emerald-700'
          }
        >
          {'error' in state ? state.error : state.success}
        </output>
      )}
    </div>
  )
}
