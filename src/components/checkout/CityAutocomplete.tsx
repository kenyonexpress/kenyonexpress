'use client'

import { type IsraeliCity, suggestCities } from '@/lib/geo/israeli-cities'
import { useId, useRef, useState } from 'react'

/**
 * The checkout city field with suggestions under it.
 *
 * A combobox in the WAI-ARIA 1.2 sense: the input owns the value, the list is
 * advice. The INPUT STAYS UNCONTROLLED on purpose. The postal-code autofill
 * writes the city straight into the DOM (`city.value = region` in
 * CheckoutForm) and the resume-after-Google effect does the same, and both
 * predate this component; a controlled value would silently drop those writes
 * on the next render. So the query that drives the list is state, and the
 * field's value is the field's.
 *
 * The list opens only while there is something typed and something matching,
 * and a click on an option is taken on mousedown, before the input blurs, so
 * the blur handler the parent uses to look up a postal code still runs
 * afterwards against the picked value and not the half-typed one.
 *
 * A free-text city is a legitimate outcome: the list is not the whole country
 * (see lib/geo/israeli-cities.ts), and the field never refuses a locality it
 * does not know.
 */
export default function CityAutocomplete({
  id,
  name = 'city',
  defaultValue = '',
  invalid = false,
  describedBy,
  onBlur,
  onPick,
}: {
  id: string
  name?: string
  defaultValue?: string
  invalid?: boolean
  describedBy?: string
  /** Runs after focus leaves the field, whether or not a suggestion was used. */
  onBlur?: () => void
  /** Runs when a suggestion is taken, with the canonical name now in the field. */
  onPick?: (city: IsraeliCity) => void
}) {
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState(defaultValue)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)

  const suggestions = open ? suggestCities(query) : []
  const expanded = suggestions.length > 0

  const pick = (city: IsraeliCity) => {
    const input = inputRef.current
    if (input) input.value = city.name
    setQuery(city.name)
    setOpen(false)
    setActive(-1)
    onPick?.(city)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      if (!open) setOpen(true)
      if (expanded) {
        event.preventDefault()
        setActive((current) => (current + 1) % suggestions.length)
      }
      return
    }
    if (event.key === 'ArrowUp') {
      if (expanded) {
        event.preventDefault()
        setActive((current) => (current <= 0 ? suggestions.length - 1 : current - 1))
      }
      return
    }
    if (event.key === 'Enter') {
      const chosen = active >= 0 ? suggestions[active] : undefined
      if (expanded && chosen) {
        // Enter picks the highlighted city; it must not also submit the whole
        // checkout, which is what Enter in a text field does by default.
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
        // address-level2 is kept so a browser profile can still fill the
        // city; the list only opens on typing, so the two do not fight.
        autoComplete="address-level2"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={activeId}
        aria-invalid={invalid ? 'true' : undefined}
        aria-describedby={describedBy}
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
      <div
        id={listId}
        // biome-ignore lint/a11y/useSemanticElements: a combobox popup is a listbox by the ARIA pattern; a <select> cannot stay open while typing
        role="listbox"
        tabIndex={-1}
        aria-label="הצעות לעיר"
        className="checkout-combobox__list"
        hidden={!expanded}
      >
        {suggestions.map((city, index) => (
          <div
            key={city.name}
            id={`${listId}-opt-${index}`}
            // biome-ignore lint/a11y/useSemanticElements: the option role on a div is the ARIA listbox pattern; keyboard selection lives on the combobox input and the option is never focused
            role="option"
            tabIndex={-1}
            aria-selected={index === active}
            className="checkout-combobox__option"
            onMouseDown={(event) => {
              event.preventDefault()
              pick(city)
            }}
            onMouseEnter={() => setActive(index)}
          >
            {city.name}
          </div>
        ))}
      </div>
    </div>
  )
}
