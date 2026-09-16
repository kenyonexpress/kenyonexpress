import type { BanRecord } from '@/lib/admin/user-ban'
import { log } from '@/lib/observability/log'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Reads of the ban record (profiles.banned_at / ban_reason / banned_by,
 * migration 237) that survive the migration not being applied yet.
 *
 * Both readers name columns the generated types do not know, so a SELECT
 * that listed them alongside `email, role, ...` would fail the WHOLE profile
 * read with 42703 and turn every user page into a 404 until 237 lands. They
 * are separate queries instead, and a failure here is "no record", logged
 * once per call so the missing migration is visible in the logs and not in
 * the page.
 */

// biome-ignore lint/suspicious/noExplicitAny: columns are outside the generated types until 237 is applied
type LooseClient = SupabaseClient<any, any, any>

export async function loadBanRecord(
  client: LooseClient,
  userId: string,
): Promise<{ record: BanRecord | null; available: boolean }> {
  const { data, error } = await client
    .from('profiles')
    .select('banned_at, ban_reason, banned_by')
    .eq('id', userId)
    .maybeSingle()
  if (error) {
    log.warn('admin.user_ban.record_unavailable', { reason: error.message, code: error.code })
    return { record: null, available: false }
  }
  return { record: (data as BanRecord | null) ?? null, available: true }
}

/** Which of these ids are banned. Empty set on any error, never a throw. */
export async function loadBannedIds(client: LooseClient, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const { data, error } = await client
    .from('profiles')
    .select('id')
    .in('id', ids)
    .not('banned_at', 'is', null)
  if (error) {
    log.warn('admin.user_ban.list_unavailable', { reason: error.message, code: error.code })
    return new Set()
  }
  return new Set(((data ?? []) as { id: string }[]).map((row) => row.id))
}
