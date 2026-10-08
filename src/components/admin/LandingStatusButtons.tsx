'use client'

import { LANDING_PAGE_STATUSES, type LandingPageStatus } from '@/lib/landing/blocks'
import { setLandingPageStatus } from '@/server/actions/admin/landing-pages'
import { useState, useTransition } from 'react'

const LABEL: Record<LandingPageStatus, string> = {
  draft: 'טיוטה',
  published: 'מפורסם',
  archived: 'בארכיון',
}

/** One-click publish / unpublish / archive, beside the full form. */
export default function LandingStatusButtons({
  id,
  status,
}: {
  id: string
  status: LandingPageStatus
}) {
  const [current, setCurrent] = useState(status)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-gray-600">מצב:</span>
      {LANDING_PAGE_STATUSES.map((next) => (
        <button
          key={next}
          type="button"
          disabled={pending || next === current}
          aria-pressed={next === current}
          onClick={() =>
            startTransition(async () => {
              const result = await setLandingPageStatus(id, next)
              if (result.ok) {
                setCurrent(next)
                setError(null)
              } else setError(result.error ?? 'העדכון נכשל.')
            })
          }
          className={`rounded-lg border px-3 py-1 ${
            next === current ? 'border-black bg-black text-white' : 'border-gray-300 bg-white'
          } disabled:opacity-60`}
        >
          {LABEL[next]}
        </button>
      ))}
      {error && (
        <span role="alert" className="text-red-700">
          {error}
        </span>
      )}
    </div>
  )
}
