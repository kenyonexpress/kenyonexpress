import type { UserRole } from '@/types/database'
import { isAdminRole } from './roles'

export type RoleChangeResult = { ok: true } | { ok: false; error: string }

// Authorizes a role change. Pure so it can be unit-tested and reused by both the
// server action and the UI.
export function authorizeRoleChange(params: {
  callerId: string
  callerRole: UserRole
  targetUserId: string
  newRole: UserRole
}): RoleChangeResult {
  const { callerId, callerRole, targetUserId, newRole } = params

  // No one may change their own role. This prevents accidental self-lockout,
  // e.g. a super_admin demoting themselves and losing all admin access.
  if (callerId === targetUserId) {
    return { ok: false, error: 'לא ניתן לשנות את התפקיד של עצמך' }
  }

  // Only super_admin may grant admin-level roles.
  if (isAdminRole(newRole) && callerRole !== 'super_admin') {
    return { ok: false, error: 'רק מנהל-על יכול להעניק הרשאות מנהל' }
  }

  return { ok: true }
}
