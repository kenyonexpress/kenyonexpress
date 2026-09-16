'use client'

import { shekelsFromIlsRounded } from '@/lib/money-format'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState } from 'react'

/**
 * THE ONE PLACE ON THE SITE A VISITOR CAN TYPE A PRODUCT NAME.
 *
 * It lives inside the listing page's filter sidebar and nowhere else: not the
 * masthead, not the drawer, not the results page. `no-search-ui.test.ts` names
 * this file as the single exemption to the no-search-field rule and pins the
 * shell to zero inputs, so the exemption cannot spread by accident.
 *
 * WHAT IT DOES. Suggestions come from `/api/search/suggest`, which proxies
 * Meilisearch (or the Postgres FTS / ILIKE fallbacks, ARCHITECTURE-SEARCH-
 * DISCOVERY.md section 0) and applies the `category` scope in the engine, so
 * typing in /category/spa cannot surface a refrigerator. Picking a suggestion
 * opens the product. Submitting with nothing picked goes to /search?q=, the
 * results page that still answers a query it is handed.
 *
 * WHAT IT REFUSES TO DO. It never calls the engine directly (the key is a
 * server secret and the CSP's connect-src is closed to our origin), it never
 * fires below two characters (one Hebrew letter matches most of the catalogue),
 * and a failed or late fetch is dropped rather than shown: a request that
 * resolves after a newer keystroke is discarded by the sequence check, and an
 * aborted one is not an error.
 *
 * ACCESSIBILITY. The WAI-ARIA combobox pattern, list-autocomplete flavour:
 * `role="combobox"` on the input, `aria-controls` to a `role="listbox"`,
 * `aria-activedescendant` for the highlighted option, ArrowUp/ArrowDown to
 * move, Enter to choose, Escape to close. The input is `type="text"`, not
 * `type="search"`: the rule test forbids the latter, and this field is a
 * filter on one archive, not a site search.
 */

export type Suggestion = {
  slug: string
  name_he: string
  image: string | null
  price: number | null
}

type Props = {
  /** The archive the field sits on. Sent as the `category` scope. */
  categorySlug: string
  /** Shown in the label so a screen reader hears WHICH archive is searched. */
  categoryName: string
}

/** Keystrokes settle for this long before a request is sent. */
export const SUGGEST_DEBOUNCE_MS = 150
/** Mirrors MIN_QUERY in the suggest route; below it the route answers empty. */
export const MIN_QUERY = 2

export default function CategoryAutocomplete({ categorySlug, categoryName }: Props) {
  const router = useRouter()
  const listId = useId()
  const [value, setValue] = useState('')
  const [items, setItems] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [pending, setPending] = useState(false)
  /** A fetch for the CURRENT query has answered, so an empty list is an answer. */
  const [answered, setAnswered] = useState(false)
  const sequence = useRef(0)
  const controller = useRef<AbortController | null>(null)

  const query = value.trim()

  useEffect(() => {
    if (query.length < MIN_QUERY) {
      controller.current?.abort()
      setItems([])
      setOpen(false)
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
        const params = new URLSearchParams({ q: query, category: categorySlug })
        const res = await fetch(`/api/search/suggest?${params.toString()}`, {
          signal: ac.signal,
          headers: { Accept: 'application/json' },
        })
        // A newer keystroke has already asked its own question.
        if (seq !== sequence.current) return
        const data = res.ok ? ((await res.json()) as { results?: Suggestion[] }) : { results: [] }
        const results = Array.isArray(data.results) ? data.results : []
        setItems(results)
        setOpen(true)
        setActive(-1)
        setAnswered(true)
      } catch {
        // Aborted, offline, or a malformed body: the field keeps working and
        // the full results page still answers on submit.
        if (seq === sequence.current) {
          setItems([])
          setOpen(false)
        }
      } finally {
        if (seq === sequence.current) setPending(false)
      }
    }, SUGGEST_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [query, categorySlug])

  function choose(item: Suggestion) {
    setOpen(false)
    router.push(`/product/${encodeURIComponent(item.slug)}`)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (active >= 0 && items[active]) {
      choose(items[active])
      return
    }
    if (query.length < MIN_QUERY) return
    setOpen(false)
    router.push(`/search?q=${encodeURIComponent(query)}`)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      if (open) e.preventDefault()
      setOpen(false)
      setActive(-1)
      return
    }
    if (!items.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((i) => (i + 1) % items.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setOpen(true)
      setActive((i) => (i <= 0 ? items.length - 1 : i - 1))
    }
  }

  const expanded = open && items.length > 0
  const activeId = active >= 0 ? `${listId}-opt-${active}` : undefined

  return (
    <form
      className="category-autocomplete"
      onSubmit={submit}
      // Closing on blur is delayed one tick so a click on an option (which
      // blurs the input first) still reaches the option's handler.
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setTimeout(() => setOpen(false), 0)
        }
      }}
    >
      <label className="category-sidebar__title" htmlFor={`${listId}-input`}>
        חיפוש ב{categoryName}
      </label>
      <div className="category-autocomplete__field">
        <input
          id={`${listId}-input`}
          className="category-autocomplete__input"
          type="text"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          dir="auto"
          placeholder="שם מוצר..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => items.length > 0 && setOpen(true)}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={expanded}
          aria-activedescendant={activeId}
          aria-busy={pending || undefined}
          aria-describedby={`${listId}-hint`}
        />
        <button type="submit" className="category-autocomplete__submit" aria-label="חפש">
          <svg viewBox="0 0 16 16" width={14} height={14} fill="currentColor" aria-hidden="true">
            <path d="M6.5 1a5.5 5.5 0 0 1 4.38 8.83l3.65 3.65-1.06 1.06-3.65-3.65A5.5 5.5 0 1 1 6.5 1Zm0 1.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
          </svg>
        </button>
      </div>
      <p id={`${listId}-hint`} className="sr-only">
        הקלידו לפחות שתי אותיות. חצים למעבר בין ההצעות, אנטר לבחירה.
      </p>
      <div
        id={listId}
        // biome-ignore lint/a11y/useSemanticElements: a combobox popup is a listbox by the ARIA pattern; a <select> cannot show thumbnails and prices or stay open while typing
        role="listbox"
        tabIndex={-1}
        aria-label="הצעות מוצרים"
        className="category-autocomplete__list"
        hidden={!expanded}
      >
        {items.map((item, i) => (
          // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handling lives on the combobox input per the ARIA pattern
          <div
            key={item.slug}
            id={`${listId}-opt-${i}`}
            // biome-ignore lint/a11y/useSemanticElements: an <option> cannot carry an image and a price; the option role on a div is the ARIA listbox pattern
            role="option"
            tabIndex={-1}
            aria-selected={i === active}
            className={`category-autocomplete__option${i === active ? ' is-active' : ''}`}
            onMouseEnter={() => setActive(i)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => choose(item)}
          >
            {item.image ? (
              <Image
                src={item.image}
                alt=""
                width={36}
                height={36}
                className="category-autocomplete__thumb"
              />
            ) : (
              <span className="category-autocomplete__thumb" aria-hidden="true" />
            )}
            <span className="category-autocomplete__name">{item.name_he}</span>
            {item.price != null ? (
              <span className="category-autocomplete__price">
                {shekelsFromIlsRounded(item.price)}
              </span>
            ) : null}
          </div>
        ))}
      </div>
      {answered && items.length === 0 ? (
        <output className="category-autocomplete__empty" htmlFor={`${listId}-input`}>
          אין הצעות ב{categoryName} עבור ״{query}״
        </output>
      ) : null}
    </form>
  )
}
