import { requestIdFetch } from '@/lib/supabase/request-id-fetch'
import type { Database } from '@/types/database'
import { createClient } from '@supabase/supabase-js'

/**
 * Cookie-free anon client for public ISR pages.
 *
 * `createClient()` from `@/lib/supabase/server` reads cookies, which forces the
 * route dynamic and defeats `export const revalidate`. Catalogue HTML that is
 * identical for every visitor must not touch the session.
 */
export function createPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: requestIdFetch },
  })
}
