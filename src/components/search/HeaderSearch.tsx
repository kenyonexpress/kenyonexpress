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
  price: number | null
}

interface QuickLinks {
  popular: { term: string; target_url: string | null }[]
  recent: string[]
}

/** Live prints ₪399, not ₪399.00. Agorot only when a price actually has them. */
function shekelsFromIls(value: number): string {
  return `₪${value.toLocaleString('he-IL', { maximumFractionDigits: 2 })}`
}

export default function HeaderSearch() {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [quick, setQuick] = useState<QuickLinks | null>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)

  /**
   * The promoted terms and the shopper's own recent ones, fetched ONCE on mount
   * rather than every time the box is focused. Neither list changes between
   * focuses within a page view, and re-fetching would make the dropdown appear
   * empty for a beat each time it opens - the one moment it must not.
   */
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/search/quick-links', { signal: controller.signal })
      .then((r) => r.json())
      .then((data: QuickLinks) => setQuick(data))
      .catch(() => {
        // No quick links is a smaller failure than a search box that errors.
      })
    return () => controller.abort()
  }, [])

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

  /** A promoted or recent term re-runs as a search rather than opening a product. */
  function goTerm(term: string, targetUrl?: string | null) {
    setOpen(false)
    setQ(term)
    router.push(targetUrl ? targetUrl : `/search?q=${encodeURIComponent(term)}`)
  }

  const hasQuick = (quick?.popular.length ?? 0) > 0 || (quick?.recent.length ?? 0) > 0
  // Below the two-character floor there are no suggestions, so the dropdown
  // shows the quick links instead of nothing at all - which is the difference
  // between a box that helps and a box that waits.
  const showQuick = open && q.trim().length < 2 && hasQuick

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
      <div className="relative w-full max-w-[534px]">
        {/* Live (refs, 1440): the whole control is 534x41, a 22px-radius pill
            with the yellow button at the inline end. h-11 (44) and rounded-lg
            were ours; 41px and the pill are the measurement. */}
        <div className="flex h-[41px] w-full items-stretch overflow-hidden rounded-[22px] border-2 border-brand-primary bg-white">
          <label htmlFor="masthead-search" className="sr-only">
            חיפוש מוצרים
          </label>
          <input
            id="masthead-search"
            type="search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => setOpen(suggestions.length > 0 || hasQuick)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            autoComplete="off"
            role="combobox"
            aria-expanded={open}
            /*
              THE ARROW KEYS MOVED A HIGHLIGHT NOBODY WAS TOLD ABOUT.
              `active` painted `bg-brand-accent` on a suggestion and Enter went
              to it, while focus never left this input and nothing carried the
              selection into the accessibility tree. A screen reader announced
              "combobox, expanded", then silence through every ArrowDown, and
              then a navigation to a product it had never named. axe reports
              zero violations here -- MEASURED, not assumed -- because the
              popup was a bare `ul` it has no rule about; this is WCAG 4.1.2
              and it needed reading the widget rather than scanning it.
            */
            aria-autocomplete="list"
            aria-controls={showQuick ? 'masthead-search-quick' : 'masthead-search-suggestions'}
            aria-activedescendant={
              open && active >= 0 && suggestions[active]
                ? `masthead-search-option-${active}`
                : undefined
            }
            placeholder="חפש מוצרים"
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

        {showQuick && (
          <div
            id="masthead-search-quick"
            dir="rtl"
            className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-black/10 bg-white p-3 text-start shadow-lg"
          >
            {quick && quick.recent.length > 0 && (
              <div className="mb-3">
                <p className="mb-1 text-xs font-semibold text-muted">חיפושים אחרונים שלך</p>
                <div className="flex flex-wrap gap-1.5">
                  {quick.recent.map((term) => (
                    <button
                      key={`recent-${term}`}
                      type="button"
                      onMouseDown={() => goTerm(term)}
                      className="rounded-full border border-border px-3 py-1 text-xs text-heading transition-colors hover:bg-brand-accent"
                    >
                      {term}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {quick && quick.popular.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold text-muted">חיפושים פופולריים</p>
                <div className="flex flex-wrap gap-1.5">
                  {quick.popular.map((item) => (
                    <button
                      key={`popular-${item.term}`}
                      type="button"
                      onMouseDown={() => goTerm(item.term, item.target_url)}
                      className="rounded-full bg-brand-accent px-3 py-1 text-xs font-medium text-heading transition-colors hover:bg-brand-primary"
                    >
                      {item.term}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {open && suggestions.length > 0 && (
          /*
            The popup `aria-controls` has always pointed at, finally saying what
            it is. Without the role a combobox announces an expanded
            something-or-other with no options in it.

            THE FOUR SUPPRESSIONS BELOW ARE THE SAME DISAGREEMENT, NOT FOUR.
            Biome's generic a11y rules read `<ul role="listbox">` and
            `<li role="option">` as "you gave a static element an interactive
            role, now make it focusable and give it key handlers". That is right
            for a lone widget and wrong for a COMPOSITE one: in the ARIA
            combobox pattern the input keeps focus and the options must NOT be
            focusable, because the selection travels through
            `aria-activedescendant` instead. Making them tabbable is the bug
            this change removes, not a fix. The keyboard lives in `onKeyDown` on
            the input, twenty lines up.
          */
          // biome-ignore lint/a11y/useFocusableInteractive: the combobox input holds focus; the listbox must not take it.
          <ul
            id="masthead-search-suggestions"
            // biome-ignore lint/a11y/useSemanticElements: there is no native listbox that can hold a thumbnail, a name and a price.
            // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: ul as listbox is the pattern's own markup.
            role="listbox"
            aria-label="הצעות חיפוש"
            dir="rtl"
            className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-black/10 bg-white text-start shadow-lg"
          >
            {suggestions.map((s, i) => (
              /*
                THE OPTION IS THE `li` AND IT IS NO LONGER A BUTTON, WHICH FIXES
                A SECOND BUG. Options in this pattern are not tabbable: the
                input keeps focus and drives them. The buttons that used to be
                here were, and Tab into one blurred the input -- which schedules
                `setOpen(false)` 120ms later, so tabbing into the list closed
                the list out from under the focused control. An `option` also
                may not contain interactive descendants, so the two problems had
                one shape.
              */
              // biome-ignore lint/a11y/useFocusableInteractive: an option under aria-activedescendant is deliberately not focusable.
              // biome-ignore lint/a11y/useKeyWithMouseEvents: the input owns the keyboard; see onKeyDown.
              <li
                key={s.slug}
                id={`masthead-search-option-${i}`}
                // biome-ignore lint/a11y/useSemanticElements: see the note on the listbox above.
                // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: li as option is the pattern's own markup.
                role="option"
                aria-selected={i === active}
                // onMouseDown, not onClick: blur fires first on click and would
                // close the list before the handler ever runs.
                onMouseDown={() => go(s.slug)}
                className={`flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-start text-sm text-heading transition-colors ${
                  i === active ? 'bg-brand-accent' : 'hover:bg-brand-accent'
                }`}
              >
                {/*
                    A plain <img>, not next/image: the URL comes from the search
                    index and can point at any host the catalogue has ever used,
                    while next/image only serves hosts listed in
                    `remotePatterns` and 500s on the rest. A 40px thumbnail in a
                    dropdown is not worth a broken suggestion list.
                    `alt=""` because the product name is right next to it, and
                    reading it twice is noise to a screen reader.
                  */}
                {s.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={s.image}
                    alt=""
                    width={40}
                    height={40}
                    loading="lazy"
                    className="h-10 w-10 shrink-0 rounded object-cover"
                  />
                ) : (
                  <span className="h-10 w-10 shrink-0 rounded bg-brand-accent" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1 truncate">{s.name_he}</span>
                {s.price != null && (
                  <span className="shrink-0 text-xs font-semibold text-price">
                    {shekelsFromIls(s.price)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </form>
  )
}
