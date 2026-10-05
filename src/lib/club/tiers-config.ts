import { log } from '@/lib/observability/log'
import { TABLE_MISSING } from '@/lib/supabase/error-codes'
import { CLUB_TIERS, type ClubTier, type ClubTierRow, tiersFromRows } from './tiers'

/**
 * The club thresholds as the database holds them, or the compiled defaults.
 *
 * `club_tiers` is pending 251 and is not in `src/types/database.ts`, so the
 * read is `from('club_tiers' as never)` on a structural client and the rows
 * are validated by `tiersFromRows` before anyone computes a tier from them.
 *
 * THREE OUTCOMES, ALL OF THEM USABLE. The table answers four good rows: those
 * are the thresholds. The table does not exist (PGRST205): the defaults, and
 * one `club.tiers_table_missing` warning per process naming 251, so the gap is
 * in the logs and not in the customer's badge. Any other failure or a row set
 * `tiersFromRows` rejects: the defaults and a warning every time, because that
 * is an operator edit or an outage worth seeing on each request.
 *
 * NO PROCESS CACHE. An admin edit must show on the next /account render; the
 * read is four rows by primary key and the account page already makes a
 * dozen round trips.
 */

export type ClubTiersClient = {
  from(table: never): {
    select(columns: string): PromiseLike<{
      data: unknown
      error: { code?: string; message?: string } | null
    }>
  }
}

export interface ClubTiersRead {
  tiers: readonly ClubTier[]
  source: 'table' | 'defaults'
  /** Set when `source` is `defaults`. */
  reason?: string
  /** True when the read answered PGRST205: 251 is not applied. */
  tableMissing: boolean
}

let warnedMissing = false

export async function readClubTiers(client: ClubTiersClient): Promise<ClubTiersRead> {
  let result: { data: unknown; error: { code?: string; message?: string } | null }
  try {
    result = await client.from('club_tiers' as never).select('id, min_agorot')
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    log.warn('club.tiers_read_threw', { message })
    return { tiers: CLUB_TIERS, source: 'defaults', reason: message, tableMissing: false }
  }

  if (result.error) {
    if (result.error.code === TABLE_MISSING) {
      if (!warnedMissing) {
        warnedMissing = true
        log.warn('club.tiers_table_missing', {
          detail:
            'club_tiers absent: apply migrations/pending/251_club_tiers.sql. Compiled defaults in use.',
        })
      }
      return { tiers: CLUB_TIERS, source: 'defaults', reason: 'table missing', tableMissing: true }
    }
    const reason = result.error.message ?? result.error.code ?? 'read failed'
    log.warn('club.tiers_read_failed', { reason })
    return { tiers: CLUB_TIERS, source: 'defaults', reason, tableMissing: false }
  }

  const parsed = tiersFromRows(result.data as ClubTierRow[] | null)
  if (!parsed.ok) {
    log.warn('club.tiers_rows_rejected', { reason: parsed.reason })
    return { tiers: CLUB_TIERS, source: 'defaults', reason: parsed.reason, tableMissing: false }
  }
  return { tiers: parsed.tiers, source: 'table', tableMissing: false }
}

/** Test seam. Never called by application code. */
export function __resetClubTiersWarning(): void {
  warnedMissing = false
}
