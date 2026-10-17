import { createClient } from '@/lib/supabase/client'

/**
 * Validate that the request is from an authenticated admin user.
 * Returns the user object if valid, null otherwise.
 */
export async function validateAdminRequest(
  _request: Request,
): Promise<{ id: string; email: string } | null> {
  try {
    const db = createClient()
    const { data: authData } = await db.auth.getUser()

    if (!authData.user) {
      return null
    }

    // Check if user is admin via admin_users table
    const { data: adminUser } = await db
      .from('admin_users')
      .select('user_id')
      .eq('user_id', authData.user.id)
      .maybeSingle()

    if (!adminUser) {
      return null
    }

    return {
      id: authData.user.id,
      email: authData.user.email || '',
    }
  } catch {
    return null
  }
}
