'use client'

import {
  deleteCategoryBanner,
  setCategoryBannerActive,
} from '@/server/actions/admin/category-banners'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

/**
 * The two one-click writes on a category-banner row (STEP 62): the kill
 * switch and delete. Delete asks once, inline. The counters cascade with the
 * banner, which is the one thing delete loses; the list says so.
 */
export default function CategoryBannerRowActions({
  id,
  isActive,
  title,
}: {
  id: string
  isActive: boolean
  title: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null)
      const result = await fn()
      if (!result.ok) setError(result.error ?? 'הפעולה נכשלה')
      else router.refresh()
    })

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => setCategoryBannerActive(id, !isActive))}
        className="rounded border px-2 py-1 disabled:opacity-50"
      >
        {isActive ? 'כיבוי' : 'הפעלה'}
      </button>
      {confirming ? (
        <>
          <span>למחוק את &quot;{title}&quot; יחד עם הספירות שלו?</span>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => deleteCategoryBanner(id))}
            className="rounded bg-red-700 px-2 py-1 text-white disabled:opacity-50"
          >
            כן, למחוק
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirming(false)}
            className="rounded border px-2 py-1"
          >
            ביטול
          </button>
        </>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => setConfirming(true)}
          className="rounded border border-red-200 px-2 py-1 text-red-700 disabled:opacity-50"
        >
          מחיקה
        </button>
      )}
      {error && (
        <span role="alert" className="text-red-700">
          {error}
        </span>
      )}
    </div>
  )
}
