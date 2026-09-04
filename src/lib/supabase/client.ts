import { requestIdFetch } from '@/lib/supabase/request-id-fetch'
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  // The browser gets the same deadline as the server. The stakes are lower here
  // -- a hung request costs a spinner rather than a serverless function's whole
  // execution ceiling -- but "every Supabase call has a timeout" is only true
  // if this one does too, and `AbortController` and `fetch` are both native
  // here. `log` writes through `console`, so it is safe in this runtime.
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { fetch: requestIdFetch } },
  )
}
