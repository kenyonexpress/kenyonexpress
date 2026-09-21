'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { canAssignRole } from '@/lib/admin/permissions'
import {
  type AdminSessionInfo,
  isAdminRole,
  requireAdminSession,
  requireSection,
} from '@/lib/admin/rbac'
import { authorizeRoleChange } from '@/lib/admin/role-change'
import { BAN_INDEFINITE, authorizeBan, readBanReason } from '@/lib/admin/user-ban'
import { withActionContext } from '@/lib/observability/action-context'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { UserRole } from '@/types/database'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const updateRoleSchema = z.object({
  user_id: z.string().uuid({ message: 'מזהה משתמש לא תקין' }),
  role: z.enum([
    'customer',
    'vendor',
    'content_uploader',
    'support',
    'read_only',
    'admin',
    'super_admin',
  ]),
})

export type UserActionState = { error: string } | { success: string } | null

async function runUpdateUserRole(_: UserActionState, formData: FormData): Promise<UserActionState> {
  let session: AdminSessionInfo
  try {
    session = await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const parsed = updateRoleSchema.safeParse({
    user_id: formData.get('user_id'),
    role: formData.get('role'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'קלט לא תקין' }
  const { user_id: targetUserId, role: newRole } = parsed.data

  // Both guard layers run: the QA-hardened rule set (self-lock, enumeration)
  // and the section matrix (admin assigns up to content_uploader/support/
  // read_only; only super_admin grants admin tier, re-enforced in the DB by
  // the trigger hardened in 181).
  const authz = authorizeRoleChange({
    callerId: session.userId,
    callerRole: session.role,
    targetUserId,
    newRole,
  })
  if (!authz.ok) return { error: authz.error }
  if (!canAssignRole(session.role, newRole)) {
    return { error: 'רק מנהל-על יכול להעניק הרשאות מנהל' }
  }

  if (targetUserId === session.userId) {
    return { error: 'אי אפשר לשנות את התפקיד של עצמך' }
  }

  const supabase = await createClient()
  const { data: target } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', targetUserId)
    .single()
  if (!target) return { error: 'משתמש לא נמצא' }

  // Demoting an admin-tier user is a super_admin-only operation too.
  if (isAdminRole(target.role) && session.role !== 'super_admin') {
    return { error: 'רק מנהל-על יכול לשנות תפקיד של מנהל' }
  }

  // The cast covers 'read_only' until 181 is applied and the types
  // regenerated (see AppRole in lib/admin/roles.ts). Before apply-day,
  // assigning it fails loudly here with Postgres "invalid input value for
  // enum user_role", which is the honest pre-migration behavior.
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ role: newRole as UserRole })
    .eq('id', targetUserId)

  if (profileError) return { error: profileError.message }

  // Sync role to app_metadata so the JWT reflects the change on next refresh.
  const adminClient = createAdminClient()
  await adminClient.auth.admin.updateUserById(targetUserId, {
    app_metadata: { role: newRole },
  })

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'permission_change',
    entityType: 'profiles',
    entityId: targetUserId,
    changes: { role: { from: target.role, to: newRole } },
  })

  revalidatePath('/admin/users')
  revalidatePath(`/admin/users/${targetUserId}`)
  return { success: 'תפקיד עודכן בהצלחה' }
}

export async function updateUserRole(
  _: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  return withActionContext('admin.user.update_role', () => runUpdateUserRole(_, formData))
}

/**
 * Ban and unban, through the Auth admin API. See `lib/admin/user-ban.ts` for
 * why `auth.users.banned_until` and not a column on `profiles`.
 *
 * The audit row is a `status_change` on `profiles`, with the reason in
 * `changes` and the ban window in `before`/`after`, so the log's diff column
 * shows exactly what moved.
 */
async function runSetUserBan(
  mode: 'ban' | 'unban',
  _: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  let session: AdminSessionInfo
  try {
    session = await requireSection('users', 'write')
  } catch {
    return { error: 'אין הרשאה' }
  }

  const targetUserId = z.string().uuid().safeParse(formData.get('user_id'))
  if (!targetUserId.success) return { error: 'מזהה משתמש לא תקין' }
  const reason = readBanReason(formData.get('reason'))
  if (!reason)
    return { error: mode === 'ban' ? 'חובה לציין סיבה לחסימה' : 'חובה לציין סיבה לביטול החסימה' }

  const supabase = await createClient()
  const { data: target, error: targetError } = await supabase
    .from('profiles')
    .select('role, email')
    .eq('id', targetUserId.data)
    .maybeSingle()
  if (targetError) return { error: 'שגיאה בקריאת המשתמש' }
  if (!target) return { error: 'משתמש לא נמצא' }

  const authz = authorizeBan({
    callerId: session.userId,
    callerRole: session.role,
    targetUserId: targetUserId.data,
    targetRole: target.role,
  })
  if (!authz.ok) return { error: authz.error }

  const adminClient = createAdminClient()
  const { data: found, error: findError } = await adminClient.auth.admin.getUserById(
    targetUserId.data,
  )
  if (findError || !found.user) return { error: 'חשבון ההתחברות לא נמצא' }
  const bannedBefore = (found.user as { banned_until?: string | null }).banned_until ?? null

  const { error } = await adminClient.auth.admin.updateUserById(targetUserId.data, {
    ban_duration: mode === 'ban' ? BAN_INDEFINITE : 'none',
  })
  if (error) return { error: `החסימה לא נשמרה: ${error.message}` }

  const { data: after } = await adminClient.auth.admin.getUserById(targetUserId.data)
  const bannedAfter =
    (after?.user as { banned_until?: string | null } | undefined)?.banned_until ?? null

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'status_change',
    entityType: 'profiles',
    entityId: targetUserId.data,
    changes: { ban: mode, reason, email: target.email },
    before: { banned_until: bannedBefore },
    after: { banned_until: bannedAfter },
  })

  revalidatePath(`/admin/users/${targetUserId.data}`)
  return { success: mode === 'ban' ? 'המשתמש נחסם' : 'החסימה בוטלה' }
}

export async function banUser(_: UserActionState, formData: FormData): Promise<UserActionState> {
  return withActionContext('admin.user.ban', () => runSetUserBan('ban', _, formData))
}

export async function unbanUser(_: UserActionState, formData: FormData): Promise<UserActionState> {
  return withActionContext('admin.user.unban', () => runSetUserBan('unban', _, formData))
}
