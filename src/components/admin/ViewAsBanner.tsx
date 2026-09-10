'use client'

import { formatTime } from '@/lib/i18n/format'
import { type ViewAsState, endCustomerViewAs } from '@/server/actions/admin/customer'
import { useActionState } from 'react'

const INITIAL: ViewAsState = null

/**
 * The banner, and the reason it is fixed to the top of the viewport.
 *
 * A notice that scrolls away is a notice that is true only while somebody is
 * looking at it. The whole failure mode this guards against is an operator who
 * has forgotten which screen they are on, and that operator is by definition
 * not at the top of the page. It is `sticky top-0` with a `z` above the panel
 * chrome, and the page below is padded so nothing hides under it.
 *
 * IT SAYS "READ ONLY" IN THE SAME BREATH AS THE NAME. "Viewing as Dana Cohen"
 * on its own is the sentence that produces the mistake it is meant to prevent:
 * an operator reads it as a session they can act in and goes looking for the
 * button. Naming the limitation next to the name is what makes the absence of
 * the buttons legible rather than confusing.
 */
export default function ViewAsBanner({
  userId,
  displayName,
  expiresAt,
}: {
  userId: string
  displayName: string
  expiresAt: string
}) {
  const [state, action, pending] = useActionState(endCustomerViewAs, INITIAL)

  const until = formatTime(expiresAt)

  return (
    <div className="sticky top-0 z-50 border-b-2 border-amber-500 bg-amber-100">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
        <span className="rounded-md bg-amber-500 px-2 py-0.5 text-xs font-bold text-amber-950">
          צפייה כלקוח · קריאה בלבד
        </span>
        <span className="text-sm font-semibold text-amber-950">{displayName}</span>
        <span className="text-xs text-amber-900">ההרשאה פגה ב-{until}</span>

        {state && 'error' in state && (
          <span className="text-xs font-medium text-red-700">{state.error}</span>
        )}

        <form action={action} className="ms-auto">
          <input type="hidden" name="user_id" value={userId} />
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-amber-950 px-3 py-1.5 text-xs font-semibold text-amber-50 hover:bg-amber-900 disabled:opacity-60"
          >
            {pending ? 'סוגר...' : 'סיום צפייה'}
          </button>
        </form>
      </div>
    </div>
  )
}
