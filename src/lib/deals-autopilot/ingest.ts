import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ParsedCandidate } from './types'

export type IngestOutcome = {
  inserted: number
  updated: number
  skippedDecided: number
  failed: number
}

const TABLE_ABSENT = new Set(['42P01', 'PGRST205'])

/**
 * Write a batch of parsed candidates for one supplier into
 * `deal_candidates`, and the rule that keeps a re-fetch from undoing a
 * decision an admin already made.
 *
 * A candidate is looked up by (supplier_id, external_ref) -- the unique
 * constraint 237 creates:
 *
 * - no existing row: INSERT as 'pending_review'.
 * - existing row still 'pending_review': UPDATE the fields (a price or
 *   discount the supplier changed since the last fetch) and refresh
 *   `fetched_at`.
 * - existing row 'approved' or 'rejected': left untouched. An admin decided
 *   on the data that was there at review time; a supplier's feed changing
 *   six hours later does not get to silently reopen or re-litigate that,
 *   and the alternative -- overwriting an approved row's price out from
 *   under a product that may already have been created from it -- is worse
 *   than a stale queue entry nobody looks at again.
 *
 * One row at a time, not a bulk upsert: `deal_candidates` has no column an
 * UPSERT could safely use to skip decided rows in one statement (an ON
 * CONFLICT clause cannot see the row's OTHER columns to decide whether to
 * apply), and a supplier feed is at most a few hundred rows (parse.ts caps
 * it), so the round trips are not the cost fetching itself already is.
 */
export async function ingestCandidates(
  supplierId: string,
  candidates: ParsedCandidate[],
): Promise<IngestOutcome> {
  const admin = createAdminClient()
  const outcome: IngestOutcome = { inserted: 0, updated: 0, skippedDecided: 0, failed: 0 }

  for (const c of candidates) {
    const { data: existing, error: readError } = await admin
      .from('deal_candidates' as never)
      .select('id, status')
      .eq('supplier_id', supplierId)
      .eq('external_ref', c.externalRef)
      .maybeSingle()

    if (readError) {
      if (TABLE_ABSENT.has(readError.code ?? '')) {
        log.warn('deals_autopilot.table_absent', { supplierId })
        return outcome
      }
      log.error('deals_autopilot.read_failed', { supplierId, reason: readError.message })
      outcome.failed++
      continue
    }

    const row = existing as { id: string; status: string } | null

    if (row && row.status !== 'pending_review') {
      outcome.skippedDecided++
      continue
    }

    const fields = {
      supplier_id: supplierId,
      source: 'feed',
      external_ref: c.externalRef,
      name_he: c.nameHe,
      price_agorot: c.priceAgorot,
      full_price_agorot: c.fullPriceAgorot,
      discount_percent: c.discountPercent,
      category_text: c.categoryText,
      link_url: c.linkUrl,
      image_url: c.imageUrl,
      raw_payload: c.rawPayload,
      fetched_at: new Date().toISOString(),
    }

    if (row) {
      const { error } = await admin
        .from('deal_candidates' as never)
        .update(fields as never)
        .eq('id', row.id)
      if (error) {
        log.error('deals_autopilot.update_failed', { supplierId, reason: error.message })
        outcome.failed++
      } else {
        outcome.updated++
      }
    } else {
      const { error } = await admin.from('deal_candidates' as never).insert(fields as never)
      if (error) {
        log.error('deals_autopilot.insert_failed', { supplierId, reason: error.message })
        outcome.failed++
      } else {
        outcome.inserted++
      }
    }
  }

  return outcome
}
