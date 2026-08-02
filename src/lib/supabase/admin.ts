import { createClient } from '@supabase/supabase-js'

// Server-only admin client — bypasses RLS. Never import in client components.
// SUPABASE_SECRET_KEY is the new-format Supabase secret key name; the legacy
// SUPABASE_SERVICE_ROLE_KEY is still honored when present.
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY
  if (!key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY')
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key)
}
