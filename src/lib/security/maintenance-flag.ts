/**
 * The database maintenance switch (feature_flags.maintenance_mode, migration
 * 286), read by the proxy on every request and therefore cached per instance
 * for 30 seconds. A flip from the admin panel reaches every instance within
 * that window.
 *
 * FAILS OPEN. A read that errors or times out keeps the last known value, and
 * with none known it reads as OFF: a Supabase hiccup must never take the whole
 * storefront down behind a maintenance page. The MAINTENANCE_MODE env switch
 * remains the hard override for when the database itself is the problem.
 */
const TTL_MS = 30_000
let cached: { value: boolean; at: number } | null = null

export function __resetMaintenanceFlagCache(): void {
  cached = null
}

export async function maintenanceFlagOn(
  now = Date.now(),
  env: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  // Hard override: MAINTENANCE_MODE env takes precedence over DB
  const envOverride = env.MAINTENANCE_MODE?.trim().toLowerCase()
  if (
    envOverride === '1' ||
    envOverride === 'true' ||
    envOverride === 'on' ||
    envOverride === 'yes'
  ) {
    return true
  }

  if (cached && now - cached.at < TTL_MS) return cached.value
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return false
  try {
    const res = await fetcher(
      `${url}/rest/v1/feature_flags?key=eq.maintenance_mode&select=bool_value`,
      {
        headers: { apikey: key, authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(1500),
        cache: 'no-store',
      },
    )
    if (!res.ok) throw new Error(String(res.status))
    const rows = (await res.json()) as { bool_value: boolean | null }[]
    cached = { value: rows[0]?.bool_value === true, at: now }
  } catch {
    cached = { value: cached?.value ?? false, at: now }
  }
  return cached.value
}
