'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { canAssignRole } from '@/lib/admin/permissions'
import { type AdminSessionInfo, isAdminRole, requireAdminSession } from '@/lib/admin/rbac'
import { authorizeRoleChange } from '@/lib/admin/role-change'
import {
  BAN_DURATION_INDEFINITE,
  BAN_DURATION_NONE,
  BAN_REASON_MAX,
  authorizeBan,
  normalizeBanReason,
} from '@/lib/admin/user-ban'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
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

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ role: newRole })
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

// ---------------------------------------------------------------- ban / unban
//
// The lock is `auth.users.banned_until`, set through the Auth admin API.
// GoTrue refuses a banned user's token refresh and its /user endpoint, and
// proxy.ts calls auth.getUser() on every request, so a live session ends on
// its next page load. `profiles.banned_at` and friends (migration 237) are
// the panel's record of the fact; until 237 is applied the record write
// fails with 42703 and is logged, while the lock itself still holds.

const banSchema = z.object({
  user_id: z.string().uuid({ message: 'מזהה משתמש לא תקין' }),
  reason: z.string().max(BAN_REASON_MAX, 'הסיבה ארוכה מדי').optional(),
})

async function runSetUserBan(
  action: 'ban' | 'unban',
  formData: FormData,
): Promise<UserActionState> {
  let session: AdminSessionInfo
  try {
    session = await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const parsed = banSchema.safeParse({
    user_id: formData.get('user_id'),
    reason: formData.get('reason') ?? undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'קלט לא תקין' }
  const targetUserId = parsed.data.user_id
  const reason = normalizeBanReason(parsed.data.reason)

  const supabase = await createClient()
  const { data: target } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', targetUserId)
    .single()
  if (!target) return { error: 'משתמש לא נמצא' }

  const authz = authorizeBan({
    callerId: session.userId,
    callerRole: session.role,
    targetUserId,
    targetRole: target.role,
    action,
  })
  if (!authz.ok) return { error: authz.error }

  // 1. The lock. This is the write that matters; everything after it is
  //    bookkeeping, so it goes first and a failure here stops the action.
  const adminClient = createAdminClient()
  const { error: authError } = await adminClient.auth.admin.updateUserById(targetUserId, {
    ban_duration: action === 'ban' ? BAN_DURATION_INDEFINITE : BAN_DURATION_NONE,
  })
  if (authError) {
    log.error('admin.user_ban.auth_update_failed', { action, reason: authError.message })
    return { error: `עדכון החסימה נכשל: ${authError.message}` }
  }

  // 2. The record. Service role, because the request client would be
  //    stopped by profiles_update_unified (owner-only) before the trigger
  //    ever saw the admin. Tolerates the column not existing yet.
  const record =
    action === 'ban'
      ? { banned_at: new Date().toISOString(), ban_reason: reason, banned_by: session.userId }
      : { banned_at: null, ban_reason: null, banned_by: null }
  const { error: recordError } = await adminClient
    .from('profiles')
    .update(record as never)
    .eq('id', targetUserId)
  if (recordError) {
    log.warn('admin.user_ban.record_not_written', {
      action,
      reason: recordError.message,
      code: recordError.code,
    })
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'status_change',
    entityType: 'profiles',
    entityId: targetUserId,
    changes: {
      banned: { from: action !== 'ban', to: action === 'ban' },
      reason,
      record_written: !recordError,
    },
  })

  revalidatePath('/admin/users')
  revalidatePath(`/admin/users/${targetUserId}`)
  return {
    success:
      action === 'ban'
        ? recordError
          ? 'המשתמש נחסם. הרישום בפרופיל ממתין למיגרציה 237.'
          : 'המשתמש נחסם'
        : 'החסימה הוסרה',
  }
}

export async function banUser(_: UserActionState, formData: FormData): Promise<UserActionState> {
  return withActionContext('admin.user.ban', () => runSetUserBan('ban', formData))
}

export async function unbanUser(_: UserActionState, formData: FormData): Promise<UserActionState> {
  return withActionContext('admin.user.unban', () => runSetUserBan('unban', formData))
}
