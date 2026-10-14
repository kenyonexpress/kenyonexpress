'use client'

import {
  MIN_STREET_PREFIX_LENGTH,
  type StreetLookupQuery,
} from '@/lib/checkout/street-autocomplete'
import { useEffect, useId, useRef, useState } from 'react'

/**
 * The checkout street field with the registry's suggestions under it (UX17).
 *
 * The same combobox the city field is (CityAutocomplete), over an ordinary
 * named input that stays UNCONTROLLED for the same reason: the parent fills
 * the form from sessionStorage after the Google round trip by writing the
 * DOM, and a controlled value would drop that write. So the query that drives
 * the list is state, and the field's value is the field's.
 *
 * Unlike the city, the list is not a table in the bundle: it is an answer
 * from `/api/checkout/streets`, asked for the typed prefix in the typed city.
 * Three rules keep that from being a request per keystroke against a
 * government registry: nothing is asked under two characters or without a
 * city; a pause of `STREET_LOOKUP_DEBOUNCE_MS` must follow the last
 * keystroke; and the ask is only made while the field is still focused, so a
 * shopper who tabs on to the house number costs nothing. An answer that
 * arrives after the shopper typed more is dropped (the controller is aborted
 * on every change), and an answer that fails is silence, never an error.
 *
 * A street the registry does not know is a legitimate outcome: the field
 * never refuses what was typed, and leaving it calls the parent's `onBlur`
 * so the postal-code autofill still runs on the typed value.
 */

export const STREET_LOOKUP_DEBOUNCE_MS = 180

export type StreetLookup = (query: StreetLookupQuery, signal: AbortSignal) => Promise<string[]>

/** The default lookup: the route, with its answer validated to a list of strings. */
export const fetchStreetSuggestions: StreetLookup = async (query, signal) => {
  const params = new URLSearchParams({ city: query.city, q: query.prefix })
  const response = await fetch(`/api/checkout/streets?${params.toString()}`, { signal })
  if (!response.ok) return []
  const payload: unknown = await response.json()
  const streets = (payload as { streets?: unknown } | null)?.streets
  return Array.isArray(streets) ? streets.filter((s): s is string => typeof s === 'string') : []
}

export default function StreetAutocomplete({
  id,
  name = 'street',
  defaultValue = '',
  city,
  invalid = false,
  describedBy,
  onBlur,
  onPick,
  lookup = fetchStreetSuggestions,
}: {
  id: string
  name?: string
  defaultValue?: string
  /** The city the suggestions are for. No city, no suggestions. */
  city: string
  invalid?: boolean
  describedBy?: string
  /** Runs after focus leaves the field, whether or not a suggestion was used. */
  onBlur?: () => void
  /** Runs when a suggestion is taken, with the street now in the field. */
  onPick?: (street: string) => void
  /** The source of suggestions; the route by default, a stub in tests. */
  lookup?: StreetLookup
}) {
  const listId = useId()
  const statusId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState(defaultValue)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [suggestions, setSuggestions] = useState<string[]>([])

  const prefix = query.trim()
  const cityName = city.trim()
  const askable = cityName !== '' && prefix.length >= MIN_STREET_PREFIX_LENGTH
  // What the current suggestions answer, so closing and reopening the list on
  // the same typed value shows the same answer without a second ask.
  const answeredFor = useRef<string | null>(null)
  const key = `${cityName}\u0000${prefix}`

  // biome-ignore lint/correctness/useExhaustiveDependencies: `lookup` is a stable function prop; re-running on its identity would re-ask the registry on every parent render
  useEffect(() => {
    if (!askable) {
      answeredFor.current = null
      setSuggestions([])
      return
    }
    if (!open || answeredFor.current === key) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      // The shopper has moved on; the answer would open a list under a field
      // nobody is looking at.
      if (document.activeElement !== inputRef.current) return
      lookup({ city: cityName, prefix }, controller.signal)
        .then((streets) => {
          if (controller.signal.aborted) return
          answeredFor.current = key
          setSuggestions(streets)
          setActive(-1)
        })
        .catch(() => {
          // Aborted, offline, or a non-JSON answer. Nothing to offer.
        })
    }, STREET_LOOKUP_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [askable, open, key, cityName, prefix])

  const shown = open ? suggestions : []
  const expanded = shown.length > 0

  const pick = (street: string) => {
    const input = inputRef.current
    if (input) input.value = street
    setQuery(street)
    setOpen(false)
    setActive(-1)
    onPick?.(street)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      if (!open) setOpen(true)
      if (expanded) {
        event.preventDefault()
        setActive((current) => (current + 1) % shown.length)
      }
      return
    }
    if (event.key === 'ArrowUp') {
      if (expanded) {
        event.preventDefault()
        setActive((current) => (current <= 0 ? shown.length - 1 : current - 1))
      }
      return
    }
    if (event.key === 'Enter') {
      const chosen = active >= 0 ? shown[active] : undefined
      if (expanded && chosen) {
        // Enter picks the highlighted street; it must not also submit the
        // whole checkout, which is what Enter in a text field does by default.
        event.preventDefault()
        pick(chosen)
      }
      return
    }
    if (event.key === 'Escape') {
      if (open) {
        event.preventDefault()
        setOpen(false)
        setActive(-1)
      }
      return
    }
    if (event.key === 'Tab') {
      setOpen(false)
      setActive(-1)
    }
  }

  const activeId = active >= 0 && expanded ? `${listId}-opt-${active}` : undefined

  return (
    <div className="checkout-combobox">
      <input
        ref={inputRef}
        id={id}
        name={name}
        defaultValue={defaultValue}
        // address-line1 is kept so a browser profile can still fill the
        // street; the list only opens on typing, so the two do not fight.
        autoComplete="address-line1"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={activeId}
        aria-invalid={invalid ? 'true' : undefined}
        aria-describedby={
          [describedBy, expanded ? statusId : undefined].filter(Boolean).join(' ') || undefined
        }
        onChange={(event) => {
          setQuery(event.currentTarget.value)
          setOpen(true)
          setActive(-1)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false)
          setActive(-1)
          onBlur?.()
        }}
        onKeyDown={onKeyDown}
      />
      {/* How many streets the list holds, for a reader that cannot see it
          open. Polite, and only while there is a list. */}
      <output id={statusId} className="sr-only checkout-combobox__status" aria-live="polite">
        {expanded ? `${shown.length} רחובות מוצעים, בחרו עם החצים` : ''}
      </output>
      <div
        id={listId}
        // biome-ignore lint/a11y/useSemanticElements: a combobox popup is a listbox by the ARIA pattern; a <select> cannot stay open while typing
        role="listbox"
        tabIndex={-1}
        aria-label="הצעות לרחוב"
        className="checkout-combobox__list"
        hidden={!expanded}
      >
        {shown.map((street, index) => (
          <div
            key={street}
            id={`${listId}-opt-${index}`}
            // biome-ignore lint/a11y/useSemanticElements: the option role on a div is the ARIA listbox pattern; keyboard selection lives on the combobox input and the option is never focused
            role="option"
            tabIndex={-1}
            aria-selected={index === active}
            className="checkout-combobox__option"
            onMouseDown={(event) => {
              // Taken on mousedown, before the input blurs, so the parent's
              // blur handler still runs against the picked street.
              event.preventDefault()
              pick(street)
            }}
            onMouseEnter={() => setActive(index)}
          >
            {street}
          </div>
        ))}
      </div>
    </div>
  )
}
