'use client'

import { type FlashDealState, cancelFlashDeal } from '@/server/actions/admin/flash-deals'
import { useState, useTransition } from 'react'

/**
 * Cancels one scheduled change that has not been applied yet.
 *
 * The production branch has the action and no control that calls it: a
 * scheduled change could be created from the screen and withdrawn only from
 * the database. This is that control (closeout L10, row 20).
 *
 * The action refuses a row that has already run or already been cancelled,
 * and its sentence is printed here as it comes back. "Cancelled" said about a
 * price that is already live on the site would be the worst answer this
 * button could give, so it never says it on its own authority.
 */
export default function CancelFlashDealButton({ id }: { id: string }) {
  const [state, setState] = useState<FlashDealState | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending || state?.ok === true}
        onClick={() => startTransition(async () => setState(await cancelFlashDeal(id)))}
        className="min-h-11 rounded-lg border border-black/20 px-3 text-xs font-semibold disabled:opacity-60"
      >
        {pending ? 'מבטל...' : 'ביטול'}
      </button>
      <output aria-live="polite" className="text-xs">
        {state && !state.ok && <span className="text-red-600">{state.error}</span>}
        {state?.ok && <span className="text-emerald-700">{state.message}</span>}
      </output>
    </span>
  )
}
