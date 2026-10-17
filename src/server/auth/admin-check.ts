import { createClient } from '@/lib/supabase/server'
import type { User } from '@supabase/supabase-js'

/**
 * Validate that the incoming request is from an authenticated admin user.
 * Returns the user object if authorized, null if not.
 */
export async function validateAdminRequest(_request: Request): Promise<User | null> {
  try {
    const client = await createClient()

    // Get the authenticated user
    const {
      data: { user },
      error,
    } = await client.auth.getUser()

    if (error || !user) {
      return null
    }

    // Check if user is in admin_users table
    const { data: adminUser, error: adminError } = await client
      .from('admin_users')
      .select('user_id')
      .eq('user_id', user.id)
      .limit(1)
      .single()

    if (adminError || !adminUser) {
      return null
    }

    return user
  } catch {
    return null
  }
}
