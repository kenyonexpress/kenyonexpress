import { timeoutFetch } from '@/lib/supabase/timeout-fetch'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: timeoutFetch },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        // NO `headers` PARAMETER HERE, DELIBERATELY, AND NOT AN OVERSIGHT.
        // @supabase/ssr 0.12 offers a second argument carrying the no-store
        // headers that keep a rotated session cookie out of a CDN. Applying it
        // needs the RESPONSE, and this client is built on `next/headers`, which
        // owns cookies and not the response object - there is nowhere to put
        // them. The write itself is already a no-op in a server component, as
        // the catch below records. The proxy holds the response and applies
        // them there, on the same request, which is where the rotation happens.
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet)
              cookieStore.set(name, value, options)
          } catch {
            // Server component — cookie writes are no-ops, proxy handles refresh
          }
        },
      },
    },
  )
}
