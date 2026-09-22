'use client'

import { approveReview, rejectReview } from '@/server/actions/admin/reviews'
import { useState, useTransition } from 'react'

export default function ReviewModerationActions({ reviewId }: { reviewId: string }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function run(kind: 'approve' | 'reject') {
    setError(null)
    startTransition(async () => {
      const result =
        kind === 'approve' ? await approveReview(reviewId) : await rejectReview(reviewId)
      if (result && 'error' in result && result.error) setError(result.error)
    })
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => run('approve')}
        disabled={pending}
        className="min-h-11 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-60"
      >
        אישור
      </button>
      <button
        type="button"
        onClick={() => run('reject')}
        disabled={pending}
        className="min-h-11 rounded-lg border border-gray-300 px-4 text-sm font-semibold disabled:opacity-60"
      >
        דחייה
      </button>
      {error ? (
        <output className="text-sm text-red-700" aria-live="polite">
          {error}
        </output>
      ) : null}
    </div>
  )
}
