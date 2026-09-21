import { log } from '@/lib/observability/log'
import { type FeatureFlagKey, type FlagSource, resolveFlag } from '@/lib/resilience/feature-flags'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * The database half of feature flags: one read of `feature_flags` (235),
 * cached in the instance for 30 seconds, resolved against the environment by
 * the pure module. A missing table (235 not applied) reads as "no row", so
 * every flag falls through to its environment value or its default and the
 * shop behaves exactly as it did before the table existed.
 */

const TTL_MS = 30_000
const MISSING_TABLE = new Set(['42P01', 'PGRST205', 'PGRST106'])

let cache: { rows: Map<string, boolean>; loadedAt: number } | null = null

async function loadRows(): Promise<Map<string, boolean>> {
  if (cache && Date.now() - cache.loadedAt < TTL_MS) return cache.rows
  const admin = createAdminClient()
  const { data, error } = await admin.from('feature_flags' as never).select('key, enabled')
  const rows = new Map<string, boolean>()
  if (error) {
    if (!MISSING_TABLE.has(error.code ?? '')) {
      log.warn('feature_flags.read_failed', { reason: error.message })
    }
  } else {
    for (const row of (data ?? []) as unknown as { key: string; enabled: boolean }[]) {
      rows.set(row.key, row.enabled)
    }
  }
  cache = { rows, loadedAt: Date.now() }
  return rows
}

/** Drop the instance cache; the admin toggle calls this after a write. */
export function forgetFeatureFlags(): void {
  cache = null
}

export async function readFeatureFlag(
  key: FeatureFlagKey,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ enabled: boolean; source: FlagSource }> {
  const rows = await loadRows()
  return resolveFlag(key, env[key], rows.has(key) ? (rows.get(key) as boolean) : null)
}

export async function isFeatureEnabled(key: FeatureFlagKey): Promise<boolean> {
  return (await readFeatureFlag(key)).enabled
}

export type FeatureFlagRow = {
  key: FeatureFlagKey
  enabled: boolean
  source: FlagSource
  tableValue: boolean | null
  envValue: string | undefined
}

/** Every flag with where its current answer comes from, for the admin page. */
export async function listFeatureFlagRows(
  keys: readonly FeatureFlagKey[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ rows: FeatureFlagRow[]; tableMissing: boolean }> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('feature_flags' as never).select('key, enabled')
  const tableMissing = Boolean(error) && MISSING_TABLE.has(error?.code ?? '')
  if (error && !tableMissing) log.warn('feature_flags.list_failed', { reason: error.message })
  const table = new Map<string, boolean>()
  for (const row of (data ?? []) as unknown as { key: string; enabled: boolean }[]) {
    table.set(row.key, row.enabled)
  }
  return {
    tableMissing,
    rows: keys.map((key) => {
      const tableValue = table.has(key) ? (table.get(key) as boolean) : null
      const resolved = resolveFlag(key, env[key], tableValue)
      return {
        key,
        enabled: resolved.enabled,
        source: resolved.source,
        tableValue,
        envValue: env[key],
      }
    }),
  }
}
