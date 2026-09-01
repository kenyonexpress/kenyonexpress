import { log } from '@/lib/observability/log'
import { checkAdminKey } from '@/lib/supabase/admin-key'
import { timeoutFetch } from '@/lib/supabase/timeout-fetch'
import { createClient } from '@supabase/supabase-js'

let warned = false

/** One line per process. This is a misconfiguration, not a per-request event. */
function warnOnce(message: string): void {
  if (warned) return
  warned = true
  log.error('supabase.admin_key_invalid', { detail: message })
}

// Server-only admin client — bypasses RLS. Never import in client components.
// SUPABASE_SECRET_KEY is the new-format Supabase secret key name; the legacy
// SUPABASE_SERVICE_ROLE_KEY is still honored when present.
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY
  const verdict = checkAdminKey(key)

  // A missing key still throws, as it always has: there is no client to build.
  if (!verdict.ok && verdict.reason === 'missing') throw new Error(verdict.message)

  // A key that is present but wrong does NOT throw, and the distinction is
  // deliberate. It used to produce a client that failed with "Invalid API key"
  // deep inside a server action, surfacing as a cart that accepted an item and
  // stored nothing — so the problem is that nobody was told, not that the
  // process kept running. Throwing here instead fails `next build` while
  // prerendering /sitemap.xml, which turns one broken feature into no deploy at
  // all. So: say it once, loudly, and let the request fail where it fails.
  if (!verdict.ok) warnOnce(verdict.message)

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key as string, {
    global: { fetch: timeoutFetch },
  })
}
