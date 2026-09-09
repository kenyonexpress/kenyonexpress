'use client'

import { replyToReview } from '@/server/actions/supplier/reviews'
import { useState, useTransition } from 'react'

/**
 * The reply box, prefilled with the existing reply when there is one.
 *
 * EDITING REPLACES, and that is the honest behaviour rather than a limitation.
 * `supplier_reply` is one column; there is no thread and no version history, so
 * a supplier who rewrites their answer has rewritten it. Showing the current
 * text in the box says so — a blank box beside a published reply would suggest
 * the next thing typed is added rather than substituted.
 *
 * The 1000-character bound matches 199's CHECK exactly. A form that accepts
 * what the database refuses produces a 23514 the supplier reads as "the site is
 * broken".
 */
export default function ReplyForm({
  reviewId,
  existing,
}: {
  reviewId: string
  existing: string | null
}) {
  const [text, setText] = useState(existing ?? '')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  return (
    <div className="mt-3 border-gray-100 border-t pt-3">
      <label className="block text-xs font-semibold text-heading" htmlFor={`reply-${reviewId}`}>
        {existing ? 'עריכת התגובה' : 'תגובה'}
      </label>
      <textarea
        id={`reply-${reviewId}`}
        value={text}
        maxLength={1000}
        rows={3}
        onChange={(e) => {
          setText(e.target.value)
          setSaved(false)
        }}
        className="mt-1 w-full rounded-lg border border-black/15 p-2 text-sm"
        placeholder="תשובה שתופיע מתחת לביקורת"
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          disabled={pending || text.trim().length < 2}
          onClick={() =>
            start(async () => {
              setError(null)
              const result = await replyToReview(reviewId, text)
              if (result.ok) setSaved(true)
              else setError(result.error ?? 'השמירה נכשלה.')
            })
          }
          className="h-11 rounded-lg bg-brand-primary px-4 text-sm font-bold text-brand-dark disabled:opacity-60"
        >
          {pending ? 'שומר…' : 'פרסום תגובה'}
        </button>
        {saved && <span className="text-xs font-semibold text-emerald-700">נשמר.</span>}
        <span className="text-xs text-gray-400">{text.length}/1000</span>
      </div>
      {error && (
        <p className="mt-1 text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
