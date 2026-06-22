'use client'

import { ROLE_LABELS, ROLE_ORDER } from '@/lib/admin/rbac'
import { type UserActionState, updateUserRole } from '@/server/actions/admin/users'
import type { UserRole } from '@/types/database'
import { useActionState } from 'react'

interface Props {
  userId: string
  currentRole: UserRole
  callerRole: UserRole
}

const INITIAL: UserActionState = null

// Roles a caller with a given role is allowed to assign
function assignableRoles(callerRole: UserRole): UserRole[] {
  if (callerRole === 'super_admin') return ROLE_ORDER
  if (callerRole === 'admin') return ROLE_ORDER.filter((r) => r !== 'admin' && r !== 'super_admin')
  return []
}

export default function UserRoleClient({ userId, currentRole, callerRole }: Props) {
  const [state, action, pending] = useActionState(updateUserRole, INITIAL)
  const available = assignableRoles(callerRole)

  if (!available.length) {
    return <span className="text-xs text-gray-400">—</span>
  }

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="user_id" value={userId} />
      <select
        name="role"
        defaultValue={currentRole}
        className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand"
      >
        {available.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="px-2 py-1 bg-brand hover:bg-[#fedd26] disabled:opacity-60 text-brand-dark text-xs rounded-lg transition-colors"
      >
        {pending ? '...' : 'שמירה'}
      </button>
      {state && 'error' in state && <span className="text-xs text-red-600">{state.error}</span>}
      {state && 'success' in state && <span className="text-xs text-green-600">✓</span>}
    </form>
  )
}
