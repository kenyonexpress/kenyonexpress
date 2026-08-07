// Tells you that the service key is unusable, before it costs you an afternoon.
//
// WHY THIS EXISTS
//
// `.env.local` carried `SUPABASE_SECRET_KEY` set to the key that ships with a
// local `supabase start`: a JWT whose payload is
// `{"iss":"supabase-demo","role":"service_role"}`. It is a perfectly well-formed
// key. It is simply not this project's, and the hosted project answers
// `Invalid API key` to every request made with it.
//
// Nothing said so. `createAdminClient()` only checked that the variable was
// non-empty, so it handed back a client that failed on use rather than on
// construction, and the failures surfaced as a guest add-to-cart that returned
// HTTP 200, set a session cookie, wrote no row and showed no error. The cost of
// finding that was hours; the cost of this check is a string comparison.
//
// This is a shape check and not a liveness check on purpose. It runs on a hot
// path and must not make a network call. It catches the one mistake that has
// actually happened here — the demo key — and says what to do about it.

export type AdminKeyVerdict =
  | { ok: true }
  | { ok: false; reason: 'missing' | 'demo-key' | 'not-service-role'; message: string }

/** Decodes a JWT payload without verifying it. Null for anything unparseable. */
function decodePayload(key: string): Record<string, unknown> | null {
  const parts = key.split('.')
  if (parts.length !== 3 || !parts[1]) return null
  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = Buffer.from(normalized, 'base64').toString('utf8')
    const parsed: unknown = JSON.parse(json)
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

const FIX = 'Supabase Dashboard -> Project Settings -> API Keys -> copy the secret key.'

export function checkAdminKey(key: string | undefined): AdminKeyVerdict {
  if (!key) {
    return {
      ok: false,
      reason: 'missing',
      message: `Missing SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY. ${FIX}`,
    }
  }

  // The new-format keys (`sb_secret_...`) are opaque. Nothing to inspect, and
  // nothing has gone wrong with one yet.
  if (!key.includes('.')) return { ok: true }

  const payload = decodePayload(key)
  if (!payload) return { ok: true }

  if (payload.iss === 'supabase-demo') {
    return {
      ok: false,
      reason: 'demo-key',
      message: `SUPABASE_SECRET_KEY is the stock local-development demo key (iss=supabase-demo), which the hosted project rejects as an invalid API key. Every admin-client path — the guest cart, the checkout address write, the wallet balance — fails with it. ${FIX}`,
    }
  }

  if (payload.role !== undefined && payload.role !== 'service_role') {
    return {
      ok: false,
      reason: 'not-service-role',
      message:
        `SUPABASE_SECRET_KEY carries role="${String(payload.role)}", not service_role. ` +
        `An anon key here bypasses nothing and every admin write fails RLS. ${FIX}`,
    }
  }

  return { ok: true }
}
