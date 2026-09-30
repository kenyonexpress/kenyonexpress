import {
  IMPORT_RUN_ENTITY,
  type ImportRunEvent,
  type ImportRunSummary,
  groupImportRuns,
} from '@/lib/admin/product-import/import-history'
import type { createClient } from '@/lib/supabase/server'

/**
 * Reads for the product import history (`/admin/products/import/history`).
 *
 * A run is a handful of `audit_log` rows sharing `entity_type =
 * 'product_import_run'` (see `lib/admin/product-import/import-history.ts`);
 * this module fetches them through the request client, so RLS decides who
 * sees them (`audit_log_admin_select`: admins), and the page guard decides
 * who gets this far. The rollback action reads one run through the same
 * loader so both sides fold the same rows.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>

/** How many audit rows the history page reads; a run is 3 rows plus one per batch. */
export const HISTORY_EVENT_LIMIT = 2000

export type ImportRunEventRow = ImportRunEvent & { id: string }

export async function loadImportRunEvents(
  supabase: Supabase,
  runId?: string,
): Promise<{ events: ImportRunEventRow[]; error?: string }> {
  let query = supabase
    .from('audit_log')
    .select('id, entity_id, action, created_at, actor_id, changes, before')
    .eq('entity_type', IMPORT_RUN_ENTITY)
    .order('created_at', { ascending: false })
    .limit(HISTORY_EVENT_LIMIT)
  if (runId) query = query.eq('entity_id', runId)
  const { data, error } = await query
  if (error) return { events: [], error: error.message }
  return { events: (data ?? []) as ImportRunEventRow[] }
}

export interface ImportHistoryResult {
  error?: string
  runs?: ImportRunSummary[]
  /** True when the page of events was cut at the limit, so older runs are missing. */
  truncated?: boolean
}

export async function listProductImportRuns(supabase: Supabase): Promise<ImportHistoryResult> {
  const { events, error } = await loadImportRunEvents(supabase)
  if (error) return { error }
  return { runs: groupImportRuns(events), truncated: events.length >= HISTORY_EVENT_LIMIT }
}
