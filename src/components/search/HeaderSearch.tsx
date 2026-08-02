'use client'

import { Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

/**
 * Search entry point in the masthead.
 *
 * It lives here rather than in `layout/Header.tsx` because that file is on the
 * LOCKED_COMPONENTS list: it is measured against the live masthead and must not
 * be edited. `MastheadNav` renders inside the same header row and is not
 * locked, so mounting the box there puts search in the header without touching
 * the locked geometry.
 *
 * The masthead has a fixed height (`h-header-masthead`), so the control is
 * capped well below it and the measured 126px is unaffected. It is hidden below
 * `md` because the mobile masthead has no room for it; the /search page keeps
 * its own full-width box for that case.
 *
 * Submitting navigates to /search, which runs Meilisearch when it is configured
 * and falls back to Postgres ILIKE otherwise (see lib/search-server.ts). Hebrew
 * typo tolerance is engine-side configuration, not a query-time flag, so there
 * is nothing to pass from here: lib/search/meili-settings.ts lowers the typo
 * thresholds to 4 and 7 characters because Hebrew words are systematically
 * shorter than the defaults assume.
 */
export default function HeaderSearch() {
  const router = useRouter()
  const [q, setQ] = useState('')

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const term = q.trim()
    // An empty submit still goes to /search rather than doing nothing, so the
    // control never looks broken; the page prompts for a term.
    router.push(term ? `/search?q=${encodeURIComponent(term)}` : '/search')
  }

  return (
    // No role="search": biome's useSemanticElements rejects it here, and the
    // existing /search box settled on a labelled form for the same reason.
    <form
      onSubmit={submit}
      aria-label="חיפוש מוצרים באתר"
      className="hidden min-w-0 flex-1 justify-center md:flex"
    >
      <div className="flex h-11 w-full max-w-md items-stretch overflow-hidden rounded-lg border-2 border-brand-primary bg-white">
        <label htmlFor="masthead-search" className="sr-only">
          חיפוש מוצרים
        </label>
        <input
          id="masthead-search"
          type="search"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="מה בא לך למצוא היום?"
          className="min-w-0 flex-1 bg-transparent px-4 text-sm text-heading focus:outline-none"
        />
        <button
          type="submit"
          aria-label="חיפוש"
          className="flex w-12 shrink-0 items-center justify-center bg-brand-primary text-brand-dark transition-colors hover:bg-brand-primary-hover"
        >
          <Search size={18} aria-hidden="true" />
        </button>
      </div>
    </form>
  )
}
