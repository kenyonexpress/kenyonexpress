import { requireAnonKey } from '@/lib/supabase/anon-key'
import { browserAuthCookieOptions } from '@/lib/supabase/cookie-options'
import { rlsReportFetch } from '@/lib/supabase/rls-report-fetch'
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  // The browser gets the same deadline as the server. The stakes are lower here
  // -- a hung request costs a spinner rather than a serverless function's whole
  // execution ceiling -- but "every Supabase call has a timeout" is only true
  // if this one does too, and `AbortController` and `fetch` are both native
  // here. `log` writes through `console`, so it is safe in this runtime.
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, requireAnonKey(), {
    // The browser writes the session cookie too, through `document.cookie`,
    // after an OAuth return or an OTP verify. It gets the same flag from the
    // page's own protocol.
    cookieOptions: browserAuthCookieOptions(),
    global: { fetch: rlsReportFetch },
  })
}
