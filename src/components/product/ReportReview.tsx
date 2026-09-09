'use client'

import { reportReview } from '@/server/actions/reviews-report'
import { useState, useTransition } from 'react'

/**
 * "Report this review", collapsed until asked for.
 *
 * BEHIND A `<details>` AND NOT A VISIBLE BUTTON. A report control sitting open
 * under every review invites reports; a shopper reading about a massage is not
 * looking for a moderation tool, and putting one in their eyeline changes what
 * the page is about. Somebody who has a reason to object will look for it.
 *
 * THE ANSWER IS ONE SENTENCE, WHATEVER HAPPENED. Filed, already filed, unknown
 * review, table not applied — the action returns the same thing, so this
 * renders whatever it is handed. Anything more specific would let the control
 * be used to ask whether a particular account had already objected to a
 * particular review.
 *
 * The reasons are a fixed list because free text is a field nobody reads, and
 * each value is one an admin would act on differently.
 */

const REASONS = [
  { value: 'spam', labelHe: 'ספאם או פרסומת' },
  { value: 'offensive', labelHe: 'תוכן פוגעני' },
  { value: 'personal_details', labelHe: 'פרטים אישיים של מישהו' },
  { value: 'off_topic', labelHe: 'לא קשור למוצר' },
  { value: 'other', labelHe: 'אחר' },
] as const

export default function ReportReview({ reviewId }: { reviewId: string }) {
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  if (done) {
    return <p className="mt-2 text-xs text-gray-600">{done}</p>
  }

  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs text-gray-500">דיווח על הביקורת</summary>
      <div className="mt-2 flex flex-wrap gap-2">
        {REASONS.map((reason) => (
          <button
            key={reason.value}
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null)
                const result = await reportReview(reviewId, reason.value)
                if (result.ok) setDone(result.message ?? 'תודה.')
                else setError(result.error ?? 'הדיווח נכשל.')
              })
            }
            className="rounded-lg border border-black/15 px-2 py-1 text-xs disabled:opacity-60"
          >
            {reason.labelHe}
          </button>
        ))}
        {error && (
          <p className="w-full text-xs text-red-600" role="alert">
            {error}
          </p>
        )}
      </div>
    </details>
  )
}
