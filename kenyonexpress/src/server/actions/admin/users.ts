'use server'

import { requireAdminSession } from '@/lib/admin/rbac'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { UserRole } from '@/types/database'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const roleSchema = z.enum([
  'customer',
  'vendor',
  'content_uploader',
  'admin',
  'super_admin',
] as const)

export type UserActionState = { error: string } | { success: string } | null

export async function updateUserRole(
  _: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const { role: callerRole } = await requireAdminSession()

  const targetUserId = formData.get('user_id') as string
  const parsed = roleSchema.safeParse(formData.get('role'))
  if (!parsed.success) return { error: 'תפקיד לא תקין' }

  const newRole = parsed.data as UserRole

  // Only super_admin can assign admin or super_admin roles.
  if ((newRole === 'admin' || newRole === 'super_admin') && callerRole !== 'super_admin') {
    return { error: 'רק מנהל-על יכול להעניק הרשאות מנהל' }
  }

  const supabase = await createClient()
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

  revalidatePath('/admin/users')
  return { success: 'תפקיד עודכן בהצלחה' }
}
