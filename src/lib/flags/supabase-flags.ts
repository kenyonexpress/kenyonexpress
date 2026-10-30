/**
 * Read Phase 2 feature flags from Supabase feature_flags table (migration 293).
 * Cached for 30 seconds per instance, same model as maintenance-flag.ts.
 *
 * FAILS OPEN. A read that errors or times out keeps the last known value, and
 * with none known it reads from env vars (the FLAGS map). A Supabase hiccup
 * must never gate features unexpectedly. The env var remains the hard override.
 */
const TTL_MS = 30_000
let cached: { value: Record<string, boolean>; at: number } | null = null

export function __resetFlagCache(): void {
  cached = null
}

/**
 * Maps feature flag names to their database keys.
 * Database uses snake_case (physical_products), code uses kebab-case (physical-products).
 */
const FLAG_DB_KEYS: Record<string, string> = {
  'physical-products': 'physical_products',
  'courses-monthly': 'courses_monthly',
  'tzimmer-calendar': 'tzimmer_calendar',
  'monthly-billing': 'monthly_billing',
  payment_production: 'payment_production',
  wa_otp_enabled: 'wa_otp_enabled',
  card_verify_enabled: 'card_verify_enabled',
}

/**
 * Reads all Phase 2 flags from Supabase in one query.
 * Returns a map of flag names to boolean values.
 * Falls back to env vars if the read fails or times out.
 */
export async function getSupabaseFlags(
  now = Date.now(),
  env: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch,
): Promise<Record<string, boolean>> {
  if (cached && now - cached.at < TTL_MS) return cached.value

  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return buildFallbackMap(env)

  try {
    const dbKeys = Object.values(FLAG_DB_KEYS)
    const res = await fetcher(
      `${url}/rest/v1/feature_flags?key=in.(${dbKeys.join(',')})&select=key,bool_value`,
      {
        headers: { apikey: key, authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(1500),
        cache: 'no-store',
      },
    )
    if (!res.ok) throw new Error(String(res.status))
    const rows = (await res.json()) as { key: string; bool_value: boolean | null }[]

    // Build map from DB rows, fall back to env for any missing keys
    const value: Record<string, boolean> = {}
    for (const [flagName, dbKey] of Object.entries(FLAG_DB_KEYS)) {
      const row = rows.find((r) => r.key === dbKey)
      if (row && row.bool_value !== null) {
        value[flagName] = row.bool_value
      } else {
        // Flag not in DB or null, check env var
        value[flagName] = readEnvFlag(flagName, env)
      }
    }
    cached = { value, at: now }
  } catch {
    // On error, keep last known value or fall back to env
    const fallback = buildFallbackMap(env)
    cached = { value: cached?.value ?? fallback, at: now }
  }
  return cached.value
}

/**
 * Reads a single flag from env var using the same logic as the original FLAGS map.
 */
function readEnvFlag(flagName: string, env: NodeJS.ProcessEnv): boolean {
  const envMap: Record<string, string> = {
    'physical-products': 'FLAG_PHYSICAL_PRODUCTS',
    'courses-monthly': 'FLAG_COURSES_MONTHLY',
    'tzimmer-calendar': 'FLAG_TZIMMER_CALENDAR',
    'monthly-billing': 'FLAG_MONTHLY_BILLING',
    payment_production: 'FLAG_PAYMENT_PRODUCTION',
    wa_otp_enabled: 'FLAG_WA_OTP_ENABLED',
    card_verify_enabled: 'FLAG_CARD_VERIFY_ENABLED',
  }
  const envName = envMap[flagName]
  if (!envName) return false
  const raw = env[envName]?.trim().toLowerCase()
  return raw === '1' || raw === 'true'
}

/**
 * Builds a complete map from env vars only (fallback).
 */
function buildFallbackMap(env: NodeJS.ProcessEnv): Record<string, boolean> {
  return {
    'physical-products': readEnvFlag('physical-products', env),
    'courses-monthly': readEnvFlag('courses-monthly', env),
    'tzimmer-calendar': readEnvFlag('tzimmer-calendar', env),
    'monthly-billing': readEnvFlag('monthly-billing', env),
    payment_production: readEnvFlag('payment_production', env),
    wa_otp_enabled: readEnvFlag('wa_otp_enabled', env),
    card_verify_enabled: readEnvFlag('card_verify_enabled', env),
  }
}
