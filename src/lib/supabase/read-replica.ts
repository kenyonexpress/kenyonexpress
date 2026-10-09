import { getAnonKey } from '@/lib/supabase/anon-key'
import { rlsReportFetch } from '@/lib/supabase/rls-report-fetch'
import { createClient } from '@supabase/supabase-js'

/**
 * The read replica, and which reads are allowed to go there.
 *
 * WHAT SUPABASE GIVES US. A project with one or more read replicas exposes a
 * load-balanced REST endpoint, `https://<ref>-all.supabase.co`, that spreads
 * SELECTs across the primary and every replica and routes writes to the
 * primary. Each replica also has its own dedicated endpoint. Either is a valid
 * value for `SUPABASE_READ_REPLICA_URL`; the load balancer is the one to use,
 * because a dedicated endpoint pins every catalogue read to one node and a
 * replica being re-provisioned then reads as an outage.
 *
 * WHICH READS. Only the catalogue: product, category, coupon and supplier
 * storefront pages, the sitemap and the feeds. Every one of those is served
 * from `use cache` or ISR, so it is ALREADY stale by design for minutes at a
 * time, and replication lag (seconds) is invisible underneath it. The client
 * is anon-keyed and cookie-free, so RLS decides what a replica may answer,
 * exactly as on the primary.
 *
 * WHICH READS MUST NOT. Anything that follows its own write. The cart reads
 * the product it just priced; checkout reads the order it just created; auth
 * reads the profile it just wrote. A replica that lags by one second answers
 * those with the row as it was before the write, and the caller has no way to
 * tell. Those paths stay on `createPublicClient()` / `createAdminClient()`
 * against the primary, and `read-replica-callers.test.ts` refuses a file that
 * imports this module and also writes.
 *
 * UNCONFIGURED MEANS PRIMARY. No environment this repo can see sets the
 * variable today. The function below returns the primary URL then, so this
 * module is a pure upgrade to switch on and nothing changes until it is.
 */

/** The endpoint catalogue reads go to: the replica if configured, else the primary. */
export function readReplicaUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const replica = env.SUPABASE_READ_REPLICA_URL?.trim().replace(/\/+$/, '')
  if (!replica) return null
  const primary = env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, '')
  // Pointing the replica variable at the primary is not a configuration, it is
  // a no-op that would report itself as a replica on the health screen.
  if (primary && replica === primary) return null
  if (!/^https:\/\//.test(replica)) return null
  return replica
}

export function isReadReplicaConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return readReplicaUrl(env) !== null
}

export type CatalogueReadTarget = { url: string; replica: boolean }

/** Where a catalogue read is about to go. Exposed for the health check and the tests. */
export function catalogueReadTarget(env: NodeJS.ProcessEnv = process.env): CatalogueReadTarget {
  const replica = readReplicaUrl(env)
  if (replica) return { url: replica, replica: true }
  const primary = env.NEXT_PUBLIC_SUPABASE_URL
  if (!primary) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL')
  return { url: primary, replica: false }
}

/**
 * Cookie-free anon client for catalogue reads, bound to the replica when one
 * is configured. Same options as `createPublicClient()`; only the URL differs.
 */
export function createCatalogueReadClient() {
  const { url } = catalogueReadTarget()
  const key = getAnonKey()
  if (!key) {
    throw new Error('Missing SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)')
  }
  // Untyped on purpose, exactly like `createPublicClient()` in anon.ts: the
  // eight readers were written against that client's loose shape and cast
  // their own rows; a typed client here changed the meaning of those casts.
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: rlsReportFetch },
  })
}
