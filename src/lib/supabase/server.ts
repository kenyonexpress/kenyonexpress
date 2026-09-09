import { requireAnonKey } from '@/lib/supabase/anon-key'
import { supabaseAuthCookieOptions } from '@/lib/supabase/cookie-options'
import { rlsReportFetch } from '@/lib/supabase/rls-report-fetch'
import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  // Route handlers and server actions are the other place the session cookie is
  // rewritten, so `secure` has to be decided here too. `headers()` costs nothing
  // extra: `cookies()` above already made this call dynamic.
  const proto = (await headers()).get('x-forwarded-proto')

  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, requireAnonKey(), {
    cookieOptions: supabaseAuthCookieOptions(proto),
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
