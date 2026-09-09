import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Recording what was searched for.
 *
 * TWO WRITES, TWO DIFFERENT PRIVACY CONTRACTS, and they are deliberately not
 * one call:
 *
 *   `recordSearchTerm`   the anonymous aggregate. No user, no IP - only the
 *                        term and whether it found anything. This is the thing
 *                        that tells an operator what the catalogue fails to
 *                        answer, and it needs the words, not the person.
 *
 *   `recordRecentSearch` one shopper's own history, written through THEIR
 *                        session so the owner-only RLS on the table is what
 *                        enforces ownership rather than this file.
 *
 * A logged-out search produces the first and not the second. A logged-in search
 * produces both, and the two rows cannot be joined: `search_events` has no user
 * column at all, by design.
 *
 * NEITHER CAN FAIL A SEARCH. These run after the results are in hand; a
 * shopper's query must not 500 because an analytics insert did.
 *
 * ONLY THE SUBMITTED QUERY IS RECORDED, NEVER THE TYPE-AHEAD. The suggest route
 * fires on every keystroke, so recording there would fill the table with "מ",
 * "מס", "מסע" and drown the real query in its own prefixes. The database
 * normalises and aggregates, but it cannot tell a prefix from a search.
 */

export async function recordSearchTerm(term: string, hits: number): Promise<void> {
  try {
    const admin = createAdminClient()
    const { error } = await admin.rpc('fn_record_search', { p_term: term, p_hits: hits })
    if (error) log.warn('search.record_failed', { reason: error.message })
  } catch (error) {
    log.warn('search.record_threw', {
      reason: error instanceof Error ? error.message : 'unknown',
    })
  }
}

/**
 * Takes the caller's own client rather than making one, so the owner-only RLS
 * on `user_recent_searches` is what enforces ownership.
 *
 * IT BRANCHES ON THE SESSION, AND THE COMMENT THAT SAID IT NEED NOT WAS WRONG.
 * It read: "the function reads `auth.uid()` and writes nothing when there is no
 * session, so a logged-out caller is a silent no-op". The function does do
 * that -- `IF v_user IS NULL THEN RETURN` is its first statement -- but the
 * caller never reaches it. EXECUTE on `fn_record_recent_search` is granted to
 * `postgres` and `service_role` only, so PostgREST refuses an `anon` call at
 * the grant, before any of the body runs.
 *
 * Measured in Sentry on 2026-09-10: `RLS denied: POST rpc:fn_record_recent_search`,
 * 39 events in eight hours, one per anonymous search, and the newest issue in
 * the project. Not a customer-visible failure -- the search page renders and
 * the error is swallowed here -- which is exactly why it ran for as long as it
 * did while filling the error stream that real failures have to be found in.
 *
 * `authenticated` has no grant either, which is the other half:
 * `user_recent_searches` held ZERO rows on the same day, so the recent-search
 * list in the search header could never have had anything in it.
 * `migrations/pending/224_grant_recent_search_execute.sql` is that half, and
 * this branch is the half that needs no migration.
 */
export async function recordRecentSearch(client: SupabaseClient, term: string): Promise<void> {
  try {
    const {
      data: { user },
    } = await client.auth.getUser()
    // No session, nothing to record against. Returning here costs nothing: with
    // no auth cookie this resolves locally, without a round trip -- which is
    // strictly cheaper than the RPC it replaces, since that one made a request
    // in order to be refused.
    if (!user) return

    const { error } = await client.rpc('fn_record_recent_search', { p_term: term })
    if (error) log.warn('search.recent_record_failed', { reason: error.message })
  } catch (error) {
    log.warn('search.recent_record_threw', {
      reason: error instanceof Error ? error.message : 'unknown',
    })
  }
}
