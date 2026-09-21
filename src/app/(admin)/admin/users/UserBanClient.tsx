'use client'

import { type UserActionState, banUser, unbanUser } from '@/server/actions/admin/users'
import { useActionState } from 'react'

interface Props {
  userId: string
  banned: boolean
}

const INITIAL: UserActionState = null

/**
 * One form, two actions: which one is bound depends on the current state, so
 * the button can never send "ban" to someone already banned and read it as a
 * success.
 */
export default function UserBanClient({ userId, banned }: Props) {
  const [state, action, pending] = useActionState(banned ? unbanUser : banUser, INITIAL)

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="user_id" value={userId} />
      <input
        name="reason"
        required
        minLength={5}
        maxLength={300}
        placeholder={banned ? 'סיבת ביטול החסימה' : 'סיבת החסימה'}
        aria-label={banned ? 'סיבת ביטול החסימה' : 'סיבת החסימה'}
        className="w-56 rounded-lg border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand"
      />
      <button
        type="submit"
        disabled={pending}
        className={
          banned
            ? 'rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60'
            : 'rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60'
        }
      >
        {pending ? '...' : banned ? 'ביטול חסימה' : 'חסימת משתמש'}
      </button>
      {state && 'error' in state && <span className="text-xs text-red-600">{state.error}</span>}
      {state && 'success' in state && (
        <span className="text-xs text-green-600">{state.success}</span>
      )}
    </form>
  )
}
