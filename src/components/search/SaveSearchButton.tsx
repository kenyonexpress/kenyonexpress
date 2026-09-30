'use client'

import { deleteSavedSearch, saveSearch } from '@/server/actions/saved-searches'
import { Bookmark, BookmarkCheck } from 'lucide-react'
import { useState, useTransition } from 'react'

/**
 * The "save this search" toggle on the results page. Optimistic, rolls back
 * on failure, and says why in a line under the button rather than a toast the
 * shopper may have scrolled away from. A signed-out shopper gets a link to
 * sign in and come back to this exact URL, not a disabled button.
 */
export default function SaveSearchButton({
  href,
  initialSavedId,
  signedIn,
}: {
  /** The canonical search href the server computed. */
  href: string
  initialSavedId: string | null
  signedIn: boolean
}) {
  const [savedId, setSavedId] = useState<string | null>(initialSavedId)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (!signedIn) {
    return (
      <a
        href={`/login?next=${encodeURIComponent(href)}`}
        className="search-save search-save--link"
        data-testid="save-search-login"
      >
        <Bookmark size={16} aria-hidden="true" />
        התחברו כדי לשמור את החיפוש
      </a>
    )
  }

  const toggle = () => {
    setMessage(null)
    const previous = savedId
    startTransition(async () => {
      if (previous) {
        setSavedId(null)
        const result = await deleteSavedSearch(previous)
        if (!result.ok) {
          setSavedId(previous)
          setMessage(result.error)
        }
        return
      }
      setSavedId('pending')
      const result = await saveSearch({ href })
      if (result.ok) {
        setSavedId(result.id)
        setMessage(`נשמר בשם "${result.name}"`)
      } else {
        setSavedId(null)
        setMessage(result.error)
      }
    })
  }

  const saved = savedId !== null
  return (
    <div className="search-save__wrap">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={saved}
        className={`search-save${saved ? ' is-saved' : ''}`}
        data-testid="save-search"
      >
        {saved ? (
          <BookmarkCheck size={16} aria-hidden="true" />
        ) : (
          <Bookmark size={16} aria-hidden="true" />
        )}
        {saved ? 'החיפוש שמור' : 'שמירת החיפוש'}
      </button>
      {message ? (
        <p className="search-save__note" data-testid="save-search-note">
          {message}
        </p>
      ) : null}
    </div>
  )
}
