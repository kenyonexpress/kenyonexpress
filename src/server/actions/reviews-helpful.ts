'use server'

import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp } from '@/lib/utils/rate-limit'
import { updateTag } from 'next/cache'

/**
 * "Was this review helpful?", toggled.
 *
 * WHY THE VOTE IS A ROW AND NOT AN INCREMENT. A counter anyone can add to is a
 * number anyone can invent. `review_helpful_votes` is keyed
 * `(review_id, user_id)`, so a second vote from the same person is refused by
 * the PRIMARY KEY rather than by anything written here. The rate limit below
 * addresses a different shape entirely -- one account voting once on a thousand
 * reviews -- and could not stop the first one.
 *
 * SIGNED-IN ONLY, AND THAT IS NOT A CONVENIENCE. An anonymous vote can only be
 * keyed by something the voter controls: a cookie, an IP. That makes it
 * one-per-thing-they-can-discard rather than one-per-person, and a sort order
 * built on it is worse than no sort at all, because it looks like a signal.
 *
 * THE TOGGLE IS DELETE-THEN-INSERT-SHAPED, NOT READ-THEN-DECIDE. The caller
 * tells us which way it wants to go; we do not read the current state and
 * infer. Two clicks racing would both read "not voted" and both try to insert,
 * and the second would take a 23505 -- which is exactly the outcome we want and
 * is reported as success, because the end state the user asked for is true.
 */

export type HelpfulState = { ok: boolean; helpful?: boolean; error?: string }

async function runToggleHelpful(reviewId: string, helpful: boolean): Promise<HelpfulState> {
  if (!/^[0-9a-f-]{36}$/i.test(reviewId)) return { ok: false, error: 'ביקורת לא תקינה.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'יש להתחבר כדי לסמן ביקורת כמועילה.' }

  const ip = await getClientIp()
  if (!(await checkRateLimit(`review_helpful:${ip}`, 60, 3600))) {
    return { ok: false, error: 'יותר מדי סימונים. נסו שוב מאוחר יותר.' }
  }

  const { error } = helpful
    ? await supabase.from('review_helpful_votes' as never).insert({
        review_id: reviewId,
        // From the session, never from the client. The INSERT policy would
        // refuse a foreign uid anyway; relying on that would make this correct
        // because the policy is right rather than because the value is right.
        user_id: user.id,
      } as never)
    : await supabase
        .from('review_helpful_votes' as never)
        .delete()
        .eq('review_id', reviewId)
        .eq('user_id', user.id)

  if (error) {
    // 23505 means the vote this call was asked to create already exists, which
    // is the state the caller wanted. 23503 means the review is gone. Both end
    // with the user seeing what they asked for or a row that cannot exist, and
    // neither is worth a failure message.
    //
    // 42P01/PGRST205 is 222 being unapplied, which is the state today.
    const expected = ['23505', '23503', '42P01', 'PGRST205'].includes(error.code ?? '')
    if (!expected) {
      log.warn('reviews.helpful_failed', { code: error.code ?? null })
      return { ok: false, error: 'הפעולה נכשלה. נסו שוב.' }
    }
    if (error.code === '23503') return { ok: false, error: 'הביקורת לא נמצאה.' }
  }

  // The count is rendered inside the cached catalogue tree, so the vote has to
  // invalidate it or the number stays stale until the next hour boundary.
  updateTag(CATALOGUE_TAG)
  return { ok: true, helpful }
}

export async function toggleReviewHelpful(
  reviewId: string,
  helpful: boolean,
): Promise<HelpfulState> {
  return withActionContext('reviews.helpful', () => runToggleHelpful(reviewId, helpful))
}
