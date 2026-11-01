import type { Json } from '@/types/database'

/**
 * The `job_dlq` table migration 242 adds, typed here because it is not in
 * `src/types/database.ts` yet.
 *
 * Same pattern and same deletion point as pending-search.ts (171) and
 * pending-outbox.ts: the shape lives HERE, next to the one cast that names
 * the table, instead of leaking `as never` through the call sites.
 *
 * WHEN database.ts IS REGENERATED: delete this file and call
 * `admin.from('job_dlq')` directly. The column names here are the column
 * names in the migration.
 */

export interface JobDlqRow {
  id: string
  job_type: string | null
  /** The envelope as delivered, when it decoded; the DLQ never drops what it cannot parse. */
  job: Json | null
  /** The QStash failure callback, verbatim. */
  callback: Json
  last_error: string | null
  status: 'dead' | 'replayed' | 'exhausted' | 'discarded'
  created_at: string
  replayed_at: string | null
  resolved_at: string | null
}

export type JobDlqInsert = Pick<JobDlqRow, 'job' | 'callback' | 'last_error'> & {
  job_type?: string | null
}

/** Names the table the generated types do not have, for `.from()`. */
export function pendingJobDlqTable(name: 'job_dlq'): never {
  return name as never
}
