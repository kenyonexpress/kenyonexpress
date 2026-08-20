import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The three things every `notify-*` function does before it does its own job:
 * check who is calling, get a service-role client, and know its own site URL.
 *
 * AUTHORISATION IS A SHARED SECRET, NOT A JWT. These functions are deployed
 * with `--no-verify-jwt` because their callers are cron schedulers and the
 * database, neither of which holds a user session. `CRON_SECRET` is the same
 * secret the Vercel crons and `notifications-worker` already use, so there is
 * one credential to rotate rather than four.
 *
 * THE COMPARISON IS CONSTANT TIME. `a === b` on a secret leaks its length and
 * then its prefix to anybody willing to time a few thousand requests, and the
 * project already treats this as non-optional: `src/lib/security/constant-time.ts`
 * exists for the Next routes for exactly this reason. This is its Deno twin.
 *
 * A MISSING SECRET REFUSES EVERYTHING. The dangerous shape is
 * `if (secret && auth !== secret)`, which turns an unset environment variable
 * into an open endpoint that drains the queue for anyone who finds the URL.
 */

export function constantTimeEquals(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a)
  const right = new TextEncoder().encode(b)
  // Length is compared as data, not as a branch: returning early on a mismatch
  // is what leaks it.
  let diff = left.length ^ right.length
  const max = Math.max(left.length, right.length)
  for (let i = 0; i < max; i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0)
  }
  return diff === 0
}

export function authorize(request: Request): Response | null {
  const secret = Deno.env.get('CRON_SECRET') ?? ''
  if (secret.length === 0) {
    console.error('notify: CRON_SECRET is not set; refusing every request')
    return json({ ok: false, error: 'not_configured' }, 503)
  }

  const header = request.headers.get('authorization') ?? ''
  const prefix = 'Bearer '
  const presented = header.startsWith(prefix) ? header.slice(prefix.length) : ''
  if (!constantTimeEquals(presented, secret)) {
    return json({ ok: false }, 401)
  }
  return null
}

/**
 * Service role. These functions read other people's addresses and write the
 * outbox, so they run above RLS by design; nothing they touch is reachable
 * with an anon key, which is the point of the policies in `088`.
 */
export function adminClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const key =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY') ?? ''
  if (!url || !key) {
    throw new Error('SUPABASE_URL and a service-role key are required')
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Where links in the mail point.
 *
 * There is no localhost fallback. A coupon link that says `http://localhost`
 * is worse than a mail that never sent: it is delivered, it looks right, and it
 * is dead in the reader's hand forever.
 */
export function siteUrl(): string {
  const configured =
    Deno.env.get('NEXT_PUBLIC_APP_URL') ?? Deno.env.get('APP_URL') ?? 'https://kenyonexpress.co.il'
  return configured.replace(/\/+$/, '')
}

export function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

/** How many rows one invocation will take. A backlog drains over runs. */
export function batchSize(fallback = 25): number {
  const raw = Number(Deno.env.get('NOTIFY_BATCH_SIZE') ?? '')
  return Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), 100) : fallback
}
