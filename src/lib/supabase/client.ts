import { requireAnonKey } from '@/lib/supabase/anon-key'
import { rlsReportFetch } from '@/lib/supabase/rls-report-fetch'
import { createBrowserClient } from '@supabase/ssr'

/**
 * THE BROWSER CLIENT SEES NO SESSION, AND THAT IS THE DESIGN (STEP 18).
 *
 * The session cookies are HttpOnly (lib/auth/session-cookie.ts), so
 * `document.cookie` holds nothing this client can read: `auth.getUser()`
 * answers null, `from()` runs as `anon`, and a realtime channel joins
 * unauthenticated unless `realtime.setAuth(token)` is called with an access
 * token the server handed over (`server/actions/session.ts`). Use it for
 * public reads and public realtime (product-live), and for RLS-filtered
 * realtime after `setAuth`. Anything that needs the customer's identity is a
 * Server Action on `@/lib/supabase/server`.
 */
export function createClient() {
  // The browser gets the same deadline as the server. The stakes are lower here
  // -- a hung request costs a spinner rather than a serverless function's whole
  // execution ceiling -- but "every Supabase call has a timeout" is only true
  // if this one does too, and `AbortController` and `fetch` are both native
  // here. `log` writes through `console`, so it is safe in this runtime.
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, requireAnonKey(), {
    global: { fetch: rlsReportFetch },
  })
}
