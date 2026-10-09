import { requireAnonKey } from '@/lib/supabase/anon-key'
import { rlsReportFetch } from '@/lib/supabase/rls-report-fetch'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, requireAnonKey(), {
    global: { fetch: rlsReportFetch },
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options)
        } catch {
          // Server component — cookie writes are no-ops, proxy handles refresh
        }
      },
    },
  })
}
