import { act, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import StreetAutocomplete, {
  STREET_LOOKUP_DEBOUNCE_MS,
  type StreetLookup,
  fetchStreetSuggestions,
} from './StreetAutocomplete'

/**
 * The street combobox as a shopper meets it (UX17): typing in a focused field
 * asks the registry once the typing pauses, the answer opens a list that the
 * keyboard can walk, a pick lands the street in the field and tells the
 * parent, and nothing about it stops a street the registry does not know.
 * The lookup itself is a stub; the route's behaviour is route.test.ts.
 */

function setup(props: Partial<Parameters<typeof StreetAutocomplete>[0]> = {}) {
  const onPick = vi.fn()
  const onBlur = vi.fn()
  const lookup = vi.fn<StreetLookup>(async () => ['דיזנגוף', 'דיזנגוף סנטר', 'ככר דיזנגוף'])
  const utils = render(
    <StreetAutocomplete
      id="street"
      city="תל אביב"
      onPick={onPick}
      onBlur={onBlur}
      lookup={lookup}
      {...props}
    />,
  )
  const input = utils.container.querySelector<HTMLInputElement>('input[name="street"]')
  if (!input) throw new Error('street input missing')
  const list = () => utils.container.querySelector<HTMLDivElement>('[role="listbox"]')
  const options = () => [...utils.container.querySelectorAll<HTMLDivElement>('[role="option"]')]
  return { ...utils, input, list, options, onPick, onBlur, lookup }
}

/** Type into a focused field and let the debounce and the stub settle. */
async function type(input: HTMLInputElement, value: string) {
  input.focus()
  fireEvent.change(input, { target: { value } })
  await act(async () => {
    vi.advanceTimersByTime(STREET_LOOKUP_DEBOUNCE_MS + 1)
    await Promise.resolve()
  })
}

describe('the street autocomplete', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('is a combobox over an ordinary named input, so the form still posts `street`', () => {
    const { input } = setup({ defaultValue: 'הרצל' })
    expect(input.getAttribute('role')).toBe('combobox')
    expect(input.getAttribute('aria-autocomplete')).toBe('list')
    expect(input.getAttribute('autocomplete')).toBe('address-line1')
    expect(input.value).toBe('הרצל')
    expect(input.getAttribute('aria-expanded')).toBe('false')
  })

  it('asks once the typing pauses, for the typed city, and opens the answer', async () => {
    const { input, options, list, lookup } = setup()
    await type(input, 'דיז')
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(lookup.mock.calls[0]?.[0]).toEqual({ city: 'תל אביב', prefix: 'דיז' })
    expect(input.getAttribute('aria-expanded')).toBe('true')
    expect(list()?.hidden).toBe(false)
    expect(options().map((o) => o.textContent)).toEqual(['דיזנגוף', 'דיזנגוף סנטר', 'ככר דיזנגוף'])
  })

  it('does not ask under two characters, without a city, or when the field is not focused', async () => {
    const { input, lookup, rerender } = setup({ city: '' })
    await type(input, 'דיז')
    expect(lookup).not.toHaveBeenCalled()

    rerender(<StreetAutocomplete id="street" city="תל אביב" lookup={lookup} onPick={vi.fn()} />)
    await type(input, 'ד')
    expect(lookup).not.toHaveBeenCalled()

    input.blur()
    fireEvent.change(input, { target: { value: 'דיז' } })
    await act(async () => {
      vi.advanceTimersByTime(STREET_LOOKUP_DEBOUNCE_MS + 1)
      await Promise.resolve()
    })
    expect(lookup).not.toHaveBeenCalled()
  })

  it('asks once for a burst of keystrokes, not once per key', async () => {
    const { input, lookup } = setup()
    input.focus()
    fireEvent.change(input, { target: { value: 'די' } })
    vi.advanceTimersByTime(STREET_LOOKUP_DEBOUNCE_MS / 2)
    fireEvent.change(input, { target: { value: 'דיז' } })
    vi.advanceTimersByTime(STREET_LOOKUP_DEBOUNCE_MS / 2)
    fireEvent.change(input, { target: { value: 'דיזנ' } })
    await act(async () => {
      vi.advanceTimersByTime(STREET_LOOKUP_DEBOUNCE_MS + 1)
      await Promise.resolve()
    })
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(lookup.mock.calls[0]?.[0]).toEqual({ city: 'תל אביב', prefix: 'דיזנ' })
  })

  it('picks with the mouse: the street lands in the field and the parent is told', async () => {
    const { input, options, onPick } = setup()
    await type(input, 'דיז')
    const option = options()[1]
    if (!option) throw new Error('no option')
    fireEvent.mouseDown(option)
    expect(input.value).toBe('דיזנגוף סנטר')
    expect(onPick).toHaveBeenCalledWith('דיזנגוף סנטר')
    expect(input.getAttribute('aria-expanded')).toBe('false')
  })

  it('walks the list with the arrows and picks with Enter without submitting', async () => {
    const { input, options, onPick } = setup()
    await type(input, 'דיז')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(options()[1]?.getAttribute('aria-selected')).toBe('true')
    expect(input.getAttribute('aria-activedescendant')).toBe(options()[1]?.id)
    const enter = fireEvent.keyDown(input, { key: 'Enter' })
    expect(enter).toBe(false)
    expect(input.value).toBe('דיזנגוף סנטר')
    expect(onPick).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape and on blur, and still tells the parent it was left', async () => {
    const { input, list, onBlur } = setup()
    await type(input, 'דיז')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(list()?.hidden).toBe(true)
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(list()?.hidden).toBe(false)
    fireEvent.blur(input)
    expect(list()?.hidden).toBe(true)
    expect(onBlur).toHaveBeenCalledTimes(1)
  })

  it('leaves a street the registry does not know exactly as typed', async () => {
    const { input, list } = setup({ lookup: vi.fn<StreetLookup>(async () => []) })
    await type(input, 'רחוב שלי')
    expect(input.value).toBe('רחוב שלי')
    expect(list()?.hidden).toBe(true)
    expect(input.getAttribute('aria-expanded')).toBe('false')
  })

  it('swallows a failed lookup', async () => {
    const { input, list } = setup({
      lookup: vi.fn<StreetLookup>(async () => {
        throw new Error('offline')
      }),
    })
    await type(input, 'דיז')
    expect(list()?.hidden).toBe(true)
  })

  it('announces how many streets opened, for a reader', async () => {
    const { input, container } = setup()
    await type(input, 'דיז')
    const status = container.querySelector('.checkout-combobox__status')
    expect(status?.textContent).toContain('3 רחובות')
    expect(input.getAttribute('aria-describedby')).toContain(status?.id ?? 'missing')
  })
})

describe('the default lookup', () => {
  const originalFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('asks the route and keeps only the strings in its answer', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ streets: ['הרצל', 7, 'ויצמן'] }), { status: 200 }),
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const streets = await fetchStreetSuggestions(
      { city: 'חיפה', prefix: 'ה' },
      new AbortController().signal,
    )
    expect(streets).toEqual(['הרצל', 'ויצמן'])
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url.startsWith('/api/checkout/streets?')).toBe(true)
    expect(url).toContain(`city=${encodeURIComponent('חיפה')}`)
  })

  it('answers nothing for a non-200', async () => {
    globalThis.fetch = vi.fn(
      async () => new Response('', { status: 429 }),
    ) as unknown as typeof fetch
    expect(
      await fetchStreetSuggestions({ city: 'חיפה', prefix: 'הר' }, new AbortController().signal),
    ).toEqual([])
  })
})
