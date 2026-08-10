'use client'

import { Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

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
interface Suggestion {
  slug: string
  name_he: string
  image: string | null
}

export default function HeaderSearch() {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)

  /**
   * Suggestions come from /api/search/suggest, not from the engine directly:
   * the Meilisearch key is a server secret, so the browser cannot query it and
   * the CSP connect-src stays closed to our own origin.
   *
   * Debounced, and every in-flight request is abandoned when a newer keystroke
   * arrives. Without the abort an earlier, slower response can land after a
   * later one and repopulate the list with results for a prefix the user has
   * already typed past.
   */
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) {
      setSuggestions([])
      setOpen(false)
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      fetch(`/api/search/suggest?q=${encodeURIComponent(term)}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((data: { results?: Suggestion[] }) => {
          setSuggestions(data.results ?? [])
          setOpen((data.results ?? []).length > 0)
          setActive(-1)
        })
        .catch(() => {
          // An aborted or failed suggestion must never interrupt typing.
        })
    }, 180)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [q])

  function go(slug: string) {
    setOpen(false)
    router.push(`/product/${encodeURIComponent(slug)}`)
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (!open || suggestions.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((i) => (i + 1) % suggestions.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
    } else if (event.key === 'Escape') {
      setOpen(false)
    } else if (event.key === 'Enter' && active >= 0) {
      const hit = suggestions[active]
      if (hit) {
        event.preventDefault()
        go(hit.slug)
      }
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setOpen(false)
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
      className="relative hidden min-w-0 flex-1 justify-center md:flex"
    >
      <div className="relative w-full max-w-md">
        <div className="flex h-11 w-full items-stretch overflow-hidden rounded-lg border-2 border-brand-primary bg-white">
          <label htmlFor="masthead-search" className="sr-only">
            חיפוש מוצרים
          </label>
          <input
            id="masthead-search"
            type="search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => setOpen(suggestions.length > 0)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            autoComplete="off"
            role="combobox"
            aria-expanded={open}
            aria-controls="masthead-search-suggestions"
            placeholder="מה בא לך למצוא היום?"
            className="min-w-0 flex-1 bg-transparent px-4 text-sm text-heading focus:outline-none focus:ring-2 focus:ring-inset focus:ring-black/40"
          />
          <button
            type="submit"
            aria-label="חיפוש"
            className="flex w-12 shrink-0 items-center justify-center bg-brand-primary text-brand-dark transition-colors hover:bg-brand-primary-hover"
          >
            <Search size={18} aria-hidden="true" />
          </button>
        </div>

        {open && suggestions.length > 0 && (
          <ul
            id="masthead-search-suggestions"
            dir="rtl"
            className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-black/10 bg-white text-start shadow-lg"
          >
            {suggestions.map((s, i) => (
              <li key={s.slug}>
                <button
                  type="button"
                  // onMouseDown, not onClick: blur fires first on click and would
                  // close the list before the handler ever runs.
                  onMouseDown={() => go(s.slug)}
                  className={`block w-full px-4 py-2 text-start text-sm text-heading transition-colors ${
                    i === active ? 'bg-brand-accent' : 'hover:bg-brand-accent'
                  }`}
                >
                  {s.name_he}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </form>
  )
}
