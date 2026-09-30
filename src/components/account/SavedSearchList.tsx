'use client'

import { deleteSavedSearch } from '@/server/actions/saved-searches'
import type { SavedSearch } from '@/server/queries/saved-searches'
import Link from 'next/link'
import { useState, useTransition } from 'react'

/**
 * The account list of saved searches, with a remove button per row. Removal
 * is optimistic and restores the row on failure, the same rule the results
 * page's toggle follows.
 */
export default function SavedSearchList({ initial }: { initial: SavedSearch[] }) {
  const [items, setItems] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const remove = (id: string) => {
    const previous = items
    setItems(previous.filter((item) => item.id !== id))
    setError(null)
    startTransition(async () => {
      const result = await deleteSavedSearch(id)
      if (!result.ok) {
        setItems(previous)
        setError(result.error)
      }
    })
  }

  if (items.length === 0) {
    return (
      <p className="text-muted">
        עוד לא שמרת חיפושים. בדף תוצאות החיפוש, לחיצה על "שמירת החיפוש" שומרת אותו כאן.{' '}
        <Link href="/search" className="font-semibold text-price underline">
          לחיפוש
        </Link>
      </p>
    )
  }

  return (
    <>
      {error ? <p className="account-alert account-alert--error">{error}</p> : null}
      <ul className="account-list" data-testid="saved-search-list">
        {items.map((item) => (
          <li key={item.id} className="account-row">
            <div className="account-row__main">
              <Link href={item.href} className="account-row__title">
                {item.name}
              </Link>
              <p className="account-row__meta">חיפוש: {item.query}</p>
            </div>
            <div className="account-row__actions">
              <button
                type="button"
                className="account-btn account-btn--danger"
                onClick={() => remove(item.id)}
                aria-label={`הסרת החיפוש השמור ${item.name}`}
              >
                הסרה
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
