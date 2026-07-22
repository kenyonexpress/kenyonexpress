'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { canAssignRole } from '@/lib/admin/permissions'
import { type AdminSessionInfo, isAdminRole, requireAdminSession } from '@/lib/admin/rbac'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const updateRoleSchema = z.object({
  user_id: z.string().uuid({ message: 'מזהה משתמש לא תקין' }),
  role: z.enum(['customer', 'vendor', 'content_uploader', 'support', 'admin', 'super_admin']),
})

export type UserActionState = { error: string } | { success: string } | null

export async function updateUserRole(
  _: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
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

  // Matrix rule: admin assigns up to content_uploader/support; only
  // super_admin grants admin tier (re-enforced by DB trigger from 035).
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
