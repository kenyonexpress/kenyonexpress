'use client'

import { moderateReview } from '@/server/actions/admin/reviews'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

export default function ReviewActionsClient({ reviewId }: { reviewId: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function decide(decision: 'approved' | 'rejected') {
    setError(null)
    startTransition(async () => {
      const result = await moderateReview(reviewId, decision)
      if (result.ok) router.refresh()
      else setError(result.error ?? 'העדכון נכשל.')
    })
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => decide('approved')}
        disabled={isPending}
        className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        אישור
      </button>
      <button
        type="button"
        onClick={() => decide('rejected')}
        disabled={isPending}
        className="rounded-lg bg-price px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        דחייה
      </button>
      {error ? (
        <span role="alert" className="text-xs text-price">
          {error}
        </span>
      ) : null}
    </div>
  )
}
