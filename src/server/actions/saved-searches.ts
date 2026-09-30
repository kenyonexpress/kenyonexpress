'use server'

import { withActionContext } from '@/lib/observability/action-context'
import { TABLE_MISSING } from '@/lib/reviews/reviews'
import {
  clampName,
  defaultSavedSearchName,
  saveSearchInputSchema,
  savedSearchIdSchema,
  toSavedSearchCandidate,
} from '@/lib/search/saved'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * Saved searches, written on the USER client: RLS (245, owner-only policies)
 * is the boundary, and the auth check here only shapes the signed-out answer.
 * The href is never stored as received: `toSavedSearchCandidate` re-parses it
 * with the results page's own parser and writes the canonical form, so the
 * UNIQUE in 245 and the CHECK on `/search?%` both hold on what the page would
 * actually answer.
 *
 * Both actions answer "not available yet" while 245 is unapplied, the same
 * contract wishlist-alerts.ts keeps for 233.
 */

export type SaveSearchResult =
  | { ok: true; id: string; name: string }
  | { ok: false; reason: 'signed_out' | 'invalid' | 'not_applied' | 'error'; error: string }

const SIGNED_OUT = 'צריך להתחבר כדי לשמור חיפוש.'
const NOT_APPLIED = 'שמירת חיפושים עוד לא זמינה. נסו שוב מאוחר יותר.'

async function runSaveSearch(input: unknown): Promise<SaveSearchResult> {
  const parsed = saveSearchInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, reason: 'invalid', error: 'חיפוש לא תקין.' }
  const candidate = toSavedSearchCandidate(parsed.data.href)
  if (!candidate.ok) return { ok: false, reason: 'invalid', error: 'אי אפשר לשמור את החיפוש הזה.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, reason: 'signed_out', error: SIGNED_OUT }

  const name = clampName(parsed.data.name ?? '') || defaultSavedSearchName(candidate.candidate.href)

  const { data, error } = await supabase
    .from('saved_searches' as never)
    .upsert(
      {
        user_id: user.id,
        name,
        query: candidate.candidate.query,
        href: candidate.candidate.href,
      } as never,
      { onConflict: 'user_id,href' } as never,
    )
    .select('id')
    .single()

  if (error) {
    if (error.code === TABLE_MISSING)
      return { ok: false, reason: 'not_applied', error: NOT_APPLIED }
    return { ok: false, reason: 'error', error: 'השמירה נכשלה. נסו שוב.' }
  }
  revalidatePath('/account/saved-searches')
  return { ok: true, id: (data as unknown as { id: string }).id, name }
}

export type DeleteSavedSearchResult = { ok: true } | { ok: false; error: string }

async function runDeleteSavedSearch(id: unknown): Promise<DeleteSavedSearchResult> {
  const parsed = savedSearchIdSchema.safeParse(id)
  if (!parsed.success) return { ok: false, error: 'מזהה לא תקין.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: SIGNED_OUT }

  // No user_id filter on purpose: RLS is the ownership check, and a filter
  // here would let a future edit drop the policy without a test noticing.
  const { error } = await supabase
    .from('saved_searches' as never)
    .delete()
    .eq('id', parsed.data)
  if (error) {
    if (error.code === TABLE_MISSING) return { ok: false, error: NOT_APPLIED }
    return { ok: false, error: 'המחיקה נכשלה. נסו שוב.' }
  }
  revalidatePath('/account/saved-searches')
  return { ok: true }
}

export async function saveSearch(input: {
  href: string
  name?: string
}): Promise<SaveSearchResult> {
  return withActionContext('search.saved.save', () => runSaveSearch(input))
}

export async function deleteSavedSearch(id: string): Promise<DeleteSavedSearchResult> {
  return withActionContext('search.saved.delete', () => runDeleteSavedSearch(id))
}
