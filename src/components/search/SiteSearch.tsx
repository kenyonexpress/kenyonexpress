'use client'

import { shekelsFromIlsRounded } from '@/lib/money-format'
import { Search } from 'lucide-react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * THE SITE SEARCH BOX: one component, three mounts.
 *
 * Live carries a 534x41 search pill in the 1440 masthead and a search icon in
 * the handheld header (MEASURED-LIVE.md rows 23-36). Until STEP 08 this project
 * shipped no search field at all, by a rule Ofir set on 04.09 when the deployed
 * field was broken; STEP 08 (30.09) asked for the instant-results dropdown
 * back, so the rule flipped and `layout/search-ui.test.ts` now pins the shape
 * of the field instead of its absence. The pixel history is in STATE.md.
 *
 *   masthead   MastheadNav.tsx, xl and up, `id="masthead-search"`
 *   handheld   HandheldSearch.tsx, below xl, behind an icon, `id="handheld-search"`
 *   page       (store)/search/page.tsx, full width, `id="page-search"`
 *
 * The ids are fixed rather than `useId()` because `e2e/a11y.spec.ts` walks the
 * masthead combobox by id, and a generated id would make that test depend on
 * React's tree order.
 *
 * WHERE THE RESULTS COME FROM. `/api/search/suggest`, which is
 * `searchProductsCached` behind a rate limit: Meilisearch first (typo budget
 * 4/7 for Hebrew, `heb` tokenizer, prefix and cross-language synonyms from
 * lib/search/hebrew-synonyms.ts), then the Postgres FTS RPC, then ILIKE. The
 * browser never talks to the engine: the key is a server secret and the CSP's
 * connect-src is closed to our origin. The same call feeds the results page, so
 * the dropdown cannot promise a product /search then fails to show.
 *
 * WHAT THE DROPDOWN SHOWS, in order of what the shopper has typed:
 *
 *   nothing yet        the shopper's recent searches, then the promoted terms
 *                      (`/api/search/quick-links`, fetched on first focus)
 *   two or more chars  product suggestions, then "all results for ..."
 *   ...and no hits     a "nothing found" line, the promoted terms as a way out,
 *                      and a link to the whole catalogue
 *
 * Every row is a real navigation: a product opens the product, a term re-runs
 * as a search (or opens the operator's chosen target), the catalogue link is
 * /products. Enter with nothing highlighted submits the query to /search.
 *
 * KEYBOARD. The WAI-ARIA combobox pattern, list-autocomplete flavour, with the
 * optional keys included: ArrowDown/ArrowUp move and wrap, Home/End jump to the
 * ends, Enter chooses, Escape closes the list and a second Escape clears the
 * field, Tab leaves without choosing. Focus never leaves the input;
 * `aria-activedescendant` carries the highlight into the accessibility tree,
 * which is the wiring the old widget lacked (see the note in a11y.spec.ts).
 *
 * LATE ANSWERS ARE DROPPED. Every request carries a sequence number and an
 * AbortController; a response that lands after a newer keystroke is ignored,
 * and an aborted one is not an error. Without this an earlier, slower response
 * repopulates the list with results for a prefix already typed past.
 */

export type Suggestion = {
  slug: string
  name_he: string
  image: string | null
  price: number | null
}

export type QuickLinks = {
  popular: { term: string; target_url: string | null }[]
  recent: string[]
}

/** One row the keyboard can land on. */
export type SearchRow =
  | {
      kind: 'product'
      key: string
      href: string
      label: string
      image: string | null
      price: number | null
    }
  | { kind: 'term'; key: string; href: string; label: string; section: 'recent' | 'popular' }
  | { kind: 'link'; key: string; href: string; label: string }

export type SiteSearchVariant = 'masthead' | 'handheld' | 'page'

type Props = {
  /** Fixed id; the listbox is `${id}-suggestions` and options `${id}-option-N`. */
  id: string
  variant: SiteSearchVariant
  /** The results page seeds the field with the query it was opened for. */
  initialQuery?: string
  autoFocus?: boolean
  /** Handheld: Escape on a closed list collapses the row that holds the field. */
  onClose?: () => void
}

/** Keystrokes settle for this long before a request is sent. */
export const SUGGEST_DEBOUNCE_MS = 150
/** Mirrors MIN_QUERY in the suggest route; below it the route answers empty. */
export const MIN_QUERY = 2
/** Promoted terms shown in the empty state; the quick-links route caps at 8. */
export const MAX_EMPTY_TERMS = 6

const EMPTY_QUICK: QuickLinks = { popular: [], recent: [] }

export function searchHref(term: string): string {
  return `/search?q=${encodeURIComponent(term)}`
}

/**
 * The rows for the current state, pure so the test can pin the ordering. The
 * empty state deliberately leaves out a promoted term equal to the query: a
 * shopper who just searched for it does not need it suggested back.
 */
export function buildRows(
  query: string,
  suggestions: Suggestion[],
  answered: boolean,
  quick: QuickLinks,
): SearchRow[] {
  if (query.length < MIN_QUERY) {
    const recent = quick.recent.map<SearchRow>((term) => ({
      kind: 'term',
      key: `recent:${term}`,
      href: searchHref(term),
      label: term,
      section: 'recent',
    }))
    const popular = quick.popular.map<SearchRow>((p) => ({
      kind: 'term',
      key: `popular:${p.term}`,
      href: p.target_url ?? searchHref(p.term),
      label: p.term,
      section: 'popular',
    }))
    return [...recent, ...popular]
  }
  if (suggestions.length > 0) {
    const products = suggestions.map<SearchRow>((s) => ({
      kind: 'product',
      key: `product:${s.slug}`,
      href: `/product/${encodeURIComponent(s.slug)}`,
      label: s.name_he,
      image: s.image,
      price: s.price,
    }))
    return [
      ...products,
      { kind: 'link', key: 'all', href: searchHref(query), label: `כל התוצאות עבור ״${query}״` },
    ]
  }
  if (!answered) return []
  const normalised = query.toLowerCase()
  const terms = quick.popular
    .filter((p) => p.term.trim().toLowerCase() !== normalised)
    .slice(0, MAX_EMPTY_TERMS)
    .map<SearchRow>((p) => ({
      kind: 'term',
      key: `popular:${p.term}`,
      href: p.target_url ?? searchHref(p.term),
      label: p.term,
      section: 'popular',
    }))
  return [...terms, { kind: 'link', key: 'catalogue', href: '/products', label: 'לכל המוצרים' }]
}

const SECTION_TITLE: Record<'recent' | 'popular', string> = {
  recent: 'החיפושים האחרונים שלך',
  popular: 'חיפושים פופולריים',
}

export default function SiteSearch({ id, variant, initialQuery = '', autoFocus, onClose }: Props) {
  const router = useRouter()
  const [value, setValue] = useState(initialQuery)
  const [items, setItems] = useState<Suggestion[]>([])
  const [quick, setQuick] = useState<QuickLinks | null>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [pending, setPending] = useState(false)
  /** A fetch for the CURRENT query has answered, so an empty list is an answer. */
  const [answered, setAnswered] = useState(false)
  const sequence = useRef(0)
  const controller = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const query = value.trim()
  const listId = `${id}-suggestions`

  /**
   * Fetched once, on the first focus rather than on mount: most page views
   * never touch the box, and the header is on every page. A failure is an
   * empty pair of lists, never an error the shopper sees.
   */
  const loadQuick = useCallback(() => {
    if (quick !== null) return
    setQuick(EMPTY_QUICK)
    fetch('/api/search/quick-links', { headers: { Accept: 'application/json' } })
      .then((res) => (res.ok ? res.json() : EMPTY_QUICK))
      .then((data: Partial<QuickLinks>) =>
        setQuick({
          popular: Array.isArray(data.popular) ? data.popular : [],
          recent: Array.isArray(data.recent) ? data.recent : [],
        }),
      )
      .catch(() => setQuick(EMPTY_QUICK))
  }, [quick])

  useEffect(() => {
    if (query.length < MIN_QUERY) {
      controller.current?.abort()
      setItems([])
      setActive(-1)
      setPending(false)
      setAnswered(false)
      return
    }
    setAnswered(false)

    const seq = ++sequence.current
    const timer = setTimeout(async () => {
      controller.current?.abort()
      const ac = new AbortController()
      controller.current = ac
      setPending(true)
      try {
        const params = new URLSearchParams({ q: query })
        const res = await fetch(`/api/search/suggest?${params.toString()}`, {
          signal: ac.signal,
          headers: { Accept: 'application/json' },
        })
        // A newer keystroke has already asked its own question.
        if (seq !== sequence.current) return
        const data = res.ok ? ((await res.json()) as { results?: Suggestion[] }) : { results: [] }
        setItems(Array.isArray(data.results) ? data.results : [])
        setOpen(true)
        setActive(-1)
        setAnswered(true)
      } catch {
        // Aborted, offline, or a malformed body: the field keeps working and
        // the full results page still answers on submit.
        if (seq === sequence.current) setItems([])
      } finally {
        if (seq === sequence.current) setPending(false)
      }
    }, SUGGEST_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [query])

  const rows = buildRows(query, items, answered, quick ?? EMPTY_QUICK)
  const expanded = open && rows.length > 0
  const activeRow = active >= 0 ? rows[active] : undefined
  const activeId = activeRow ? `${id}-option-${active}` : undefined
  const nothingFound = answered && query.length >= MIN_QUERY && items.length === 0

  function navigate(href: string) {
    setOpen(false)
    setActive(-1)
    onClose?.()
    router.push(href)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (activeRow) {
      navigate(activeRow.href)
      return
    }
    // An empty submit still goes to /search rather than doing nothing, so the
    // control never looks broken; the page prompts for a term.
    navigate(query.length >= MIN_QUERY ? searchHref(query) : '/search')
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case 'Escape': {
        if (expanded) {
          e.preventDefault()
          setOpen(false)
          setActive(-1)
        } else if (value) {
          e.preventDefault()
          setValue('')
        } else {
          onClose?.()
        }
        return
      }
      case 'Tab': {
        setOpen(false)
        setActive(-1)
        return
      }
      case 'ArrowDown': {
        e.preventDefault()
        if (!rows.length) return
        setOpen(true)
        setActive((i) => (i + 1) % rows.length)
        return
      }
      case 'ArrowUp': {
        e.preventDefault()
        if (!rows.length) return
        setOpen(true)
        setActive((i) => (i <= 0 ? rows.length - 1 : i - 1))
        return
      }
      case 'Home': {
        if (!expanded) return
        e.preventDefault()
        setActive(0)
        return
      }
      case 'End': {
        if (!expanded) return
        e.preventDefault()
        setActive(rows.length - 1)
        return
      }
      default:
    }
  }

  const pill =
    variant === 'masthead'
      ? 'h-newsletter-field w-full max-w-search-pill'
      : variant === 'handheld'
        ? 'h-newsletter-field w-full'
        : 'h-touch-min w-full'

  return (
    <form
      className={`site-search relative min-w-0 ${variant === 'masthead' ? 'flex-1' : 'w-full'}`}
      data-variant={variant}
      aria-label="חיפוש מוצרים באתר"
      onSubmit={submit}
      // Closing on blur is delayed one tick so a click on an option (which
      // blurs the input first) still reaches the option's handler.
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setTimeout(() => {
            setOpen(false)
            setActive(-1)
          }, 0)
        }
      }}
    >
      <label htmlFor={id} className="sr-only">
        חיפוש מוצרים
      </label>
      {/* Live (refs, 1440): the whole control is 534x41, a 22px-radius pill
          with the yellow 56x41 button at the inline end. The same height and
          radius as the footer's newsletter pill, shared through the tokens. */}
      <div
        className={`flex items-stretch overflow-hidden rounded-pill border-2 border-brand-primary bg-white ${pill}`}
      >
        <input
          ref={inputRef}
          id={id}
          type="search"
          role="combobox"
          name="q"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => {
            loadQuick()
            setOpen(true)
          }}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          dir="auto"
          placeholder="חיפוש מוצרים…"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={expanded}
          aria-activedescendant={activeId}
          aria-busy={pending || undefined}
          aria-describedby={`${id}-hint`}
          // biome-ignore lint/a11y/noAutofocus: the handheld row opens on a tap of the search icon, and the field is the only thing in it
          autoFocus={autoFocus}
          className="min-w-0 flex-1 bg-transparent px-4 text-sm text-heading placeholder:text-muted focus:outline-none"
        />
        <button
          type="submit"
          aria-label="חפש"
          className="flex w-14 shrink-0 items-center justify-center bg-brand-primary text-heading transition-colors hover:bg-brand-primary-hover"
        >
          <Search size={18} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
      <p id={`${id}-hint`} className="sr-only">
        הקלידו לפחות שתי אותיות. חצים למעבר בין ההצעות, אנטר לבחירה, אסקייפ לסגירה.
      </p>
      <output className="sr-only" aria-live="polite" htmlFor={id}>
        {nothingFound
          ? `לא נמצאו מוצרים עבור ${query}`
          : answered
            ? `נמצאו ${items.length} הצעות`
            : ''}
      </output>

      <div
        id={listId}
        // biome-ignore lint/a11y/useSemanticElements: a combobox popup is a listbox by the ARIA pattern; a <select> cannot show thumbnails, prices and section headings or stay open while typing
        role="listbox"
        tabIndex={-1}
        aria-label="הצעות חיפוש"
        dir="rtl"
        hidden={!expanded}
        className="absolute inset-x-0 top-full z-50 mt-1 max-h-96 overflow-y-auto rounded-lg border border-rule bg-white py-1 text-start shadow-lg"
      >
        {nothingFound ? (
          <p className="px-4 py-2 text-sm text-muted">
            לא נמצאו מוצרים עבור ״{query}״. אולי אחד מאלה:
          </p>
        ) : null}
        {rows.map((row, i) => {
          const previous = rows[i - 1]
          const heading =
            row.kind === 'term' &&
            (previous === undefined || previous.kind !== 'term' || previous.section !== row.section)
              ? SECTION_TITLE[row.section]
              : null
          return (
            <div key={row.key} role="presentation">
              {heading ? (
                <p className="px-4 pt-2 pb-1 text-xs font-semibold text-muted">{heading}</p>
              ) : null}
              {/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handling lives on the combobox input per the ARIA pattern */}
              <div
                id={`${id}-option-${i}`}
                // biome-ignore lint/a11y/useSemanticElements: an <option> cannot carry an image and a price; the option role on a div is the ARIA listbox pattern
                role="option"
                tabIndex={-1}
                aria-selected={i === active}
                data-kind={row.kind}
                className={`flex cursor-pointer items-center gap-3 px-4 py-2 text-sm text-heading ${
                  i === active ? 'bg-surface-hover' : ''
                } ${row.kind === 'link' ? 'font-semibold text-brand-dark' : ''}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => navigate(row.href)}
              >
                {row.kind === 'product' ? (
                  row.image ? (
                    <Image
                      src={row.image}
                      alt=""
                      width={36}
                      height={36}
                      className="size-9 shrink-0 rounded object-contain"
                    />
                  ) : (
                    <span className="size-9 shrink-0 rounded bg-surface-hover" aria-hidden="true" />
                  )
                ) : null}
                <span className="min-w-0 flex-1 truncate">{row.label}</span>
                {row.kind === 'product' && row.price != null ? (
                  <span className="shrink-0 text-price">{shekelsFromIlsRounded(row.price)}</span>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </form>
  )
}
