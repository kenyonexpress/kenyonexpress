'use client'

import { t } from '@/lib/i18n/messages'
import { toggleReviewHelpful } from '@/server/actions/reviews-helpful'
import { useState, useTransition } from 'react'

/**
 * "Was this helpful?" for one review.
 *
 * OPTIMISTIC, AND IT ROLLS BACK. The count moves on click and returns if the
 * server refuses. A vote is a low-stakes, high-frequency action: waiting a
 * round trip to see a number change reads as a broken button, and people click
 * it again.
 *
 * `useOptimistic` is deliberately not used, for the same reason as
 * `WishlistProvider`: this owns the value outright rather than deriving it from
 * a parent's server state, so a plain `useState` pair IS the optimistic update,
 * and the hook would only add a transition boundary to reason about.
 *
 * NOT HIDDEN FROM SIGNED-OUT READERS. The control renders for everybody and the
 * action answers "sign in to mark a review as helpful". Hiding it would make
 * the page silently different for signed-out visitors, and the count is public
 * either way -- the thing that requires an account is casting a vote, not
 * knowing that voting exists.
 *
 * `aria-pressed` rather than a checkbox: this is a toggle button, and a
 * screen reader should hear a state on a button rather than an unlabelled
 * checkbox in a list of reviews.
 */
export default function HelpfulVote({
  reviewId,
  initialCount,
}: {
  reviewId: string
  initialCount: number
}) {
  const [count, setCount] = useState(initialCount)
  const [voted, setVoted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function toggle() {
    const next = !voted
    const previousCount = count
    setVoted(next)
    setCount((c) => Math.max(0, c + (next ? 1 : -1)))
    setError(null)
    start(async () => {
      const result = await toggleReviewHelpful(reviewId, next)
      if (!result.ok) {
        setVoted(!next)
        setCount(previousCount)
        setError(result.error ?? t('reviews.helpfulFailed'))
      }
    })
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={voted}
        className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-700 disabled:opacity-60"
      >
        {voted ? t('reviews.helpfulDone') : t('reviews.helpfulAsk')}
        {count > 0 ? <span className="ms-1 text-gray-500">({count})</span> : null}
      </button>
      {/* `<output>` and not a span with role=status: biome's useSemanticElements
          is right that the element already carries the live-region semantics,
          and it saves an explicit role. */}
      {error ? <output className="text-xs text-red-600">{error}</output> : null}
    </div>
  )
}
