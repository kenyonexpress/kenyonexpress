'use client'

import { type DeadLetterState, retryDeadLetter } from '@/server/actions/admin/dead-letters'
import { useActionState } from 'react'

/**
 * One requeue button, with its own action state.
 *
 * PER ROW, NOT PER PAGE. A single shared `useActionState` would show "requeued"
 * next to every row on the screen the moment one of them succeeded, and an
 * operator working through a list of forty would have no idea which one they
 * had actually pressed.
 */
export default function RetryButton({ queue, id }: { queue: string; id: string }) {
  const [state, action, pending] = useActionState<DeadLetterState, FormData>(retryDeadLetter, null)

  if (state && 'success' in state) {
    return <span className="shrink-0 text-xs font-medium text-green-700">{state.success}</span>
  }

  return (
    <form action={action} className="shrink-0">
      <input type="hidden" name="queue" value={queue} />
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 disabled:opacity-60"
      >
        {pending ? 'מחזיר...' : 'נסה שוב'}
      </button>
      {state && 'error' in state && <p className="mt-1 text-xs text-red-600">{state.error}</p>}
    </form>
  )
}
