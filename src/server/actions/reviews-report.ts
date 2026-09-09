'use server'

import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp } from '@/lib/utils/rate-limit'

/**
 * A reader objecting to a published review.
 *
 * WHY A READER AND NOT ONLY AN ADMIN. A moderation queue that sees only what an
 * admin happens to open is not moderation. The person who notices that a review
 * names a member of staff, or is somebody's phone number, is a reader — and
 * until 199 a reader had no way to say so.
 *
 * THE ANSWER IS THE SAME WHETHER OR NOT THE ROW WAS WRITTEN
 *
 * Filed, already filed by this person, review does not exist, table not there
 * yet: one sentence. A caller that could tell them apart could use this
 * endpoint to enumerate review ids, and could learn whether a particular
 * account had already objected to a particular review — which is somebody
 * else's business.
 *
 * A reporter also cannot READ the queue: `review_reports` grants INSERT and
 * nothing else. Letting somebody read their own report back tells them whether
 * an admin has acted, which turns a moderation decision into a negotiation with
 * whoever objected loudest.
 */

const REASONS = ['spam', 'offensive', 'personal_details', 'off_topic', 'other'] as const
export type ReportReason = (typeof REASONS)[number]

export type ReportState = { ok: boolean; message?: string; error?: string }

const SAME_ANSWER: ReportState = { ok: true, message: 'תודה, נבדוק את הביקורת.' }

async function runReportReview(reviewId: string, reason: string): Promise<ReportState> {
  if (!/^[0-9a-f-]{36}$/i.test(reviewId)) return { ok: false, error: 'ביקורת לא תקינה.' }
  if (!(REASONS as readonly string[]).includes(reason)) {
    return { ok: false, error: 'סיבה לא מוכרת.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  // Signed-in only, and this IS said plainly rather than folded into the
  // same-answer rule: a visitor who cannot act needs to know why, and "sign in
  // to report" is not information about anybody else.
  if (!user) return { ok: false, error: 'יש להתחבר כדי לדווח.' }

  // A ceiling per IP as well as the one-per-reporter unique index. The index
  // stops one person objecting twice to one review; this stops one person
  // objecting once to two hundred reviews, which is the shape that turns the
  // moderation queue into a denial of service against the admin reading it.
  const ip = await getClientIp()
  if (!(await checkRateLimit(`review_report:${ip}`, 20, 3600))) {
    return { ok: false, error: 'יותר מדי דיווחים. נסו שוב מאוחר יותר.' }
  }

  const { error } = await supabase.from('review_reports' as never).insert({
    review_id: reviewId,
    // From the SESSION, never from the form: the INSERT policy's WITH CHECK is
    // `reporter_id = auth.uid()`, so a client-supplied value would be refused
    // anyway -- but relying on that would make the security depend on the
    // policy being right rather than on the value being right.
    reporter_id: user.id,
    reason,
  } as never)

  if (error) {
    // 23505 is "already reported by this person", 42P01/PGRST205 is 199 being
    // unapplied. Neither is worth telling the reader about: the first is
    // already-done and the second is not their problem.
    const expected = ['23505', '42P01', 'PGRST205'].includes(error.code ?? '')
    if (!expected) log.warn('reviews.report_failed', { reason: error.message })
  }

  return SAME_ANSWER
}

export async function reportReview(reviewId: string, reason: string): Promise<ReportState> {
  return withActionContext('reviews.report', () => runReportReview(reviewId, reason))
}
