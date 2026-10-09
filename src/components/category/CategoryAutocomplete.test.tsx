import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CategoryAutocomplete, { SUGGEST_DEBOUNCE_MS } from './CategoryAutocomplete'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    // biome-ignore lint/a11y/useAltText: passthrough stub, alt arrives via props
    return <img {...(props as object)} />
  },
}))

type Call = { url: URL; signal: AbortSignal }
let calls: Call[]
let answer: (results: unknown[]) => void
let fail: () => void

/**
 * The fetch is a hand-rolled deferred so a test can decide WHEN each request
 * resolves. The late-response bug this file exists for only shows up when the
 * first request answers after the second.
 */
function deferredFetch() {
  return vi.fn((input: string, init?: RequestInit) => {
    const url = new URL(input, 'https://kenyonexpress.co.il')
    const signal = init?.signal as AbortSignal
    return new Promise<Response>((resolve, reject) => {
      calls.push({ url, signal })
      answer = (results) => resolve(new Response(JSON.stringify({ results }), { status: 200 }))
      fail = () => reject(new TypeError('offline'))
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })
  })
}

const SPA = { slug: 'spa-day', name_he: 'יום ספא זוגי', image: null, price: 299 }
const MASSAGE = { slug: 'massage', name_he: 'עיסוי שוודי', image: '/i/m.jpg', price: null }

beforeEach(() => {
  calls = []
  push.mockReset()
  vi.useFakeTimers()
  vi.stubGlobal('fetch', deferredFetch())
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function setup() {
  render(<CategoryAutocomplete categorySlug="spa" categoryName="ספא" />)
  return screen.getByRole('combobox')
}

/** The i-th option, or a failed test: an index past the list is a bug here. */
function option(i: number): HTMLElement {
  const el = screen.getAllByRole('option')[i]
  if (!el) throw new Error(`no option at ${i}`)
  return el
}

function call(i: number): Call {
  const c = calls[i]
  if (!c) throw new Error(`no fetch call at ${i}`)
  return c
}

async function type(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } })
  await act(async () => {
    vi.advanceTimersByTime(SUGGEST_DEBOUNCE_MS)
  })
}

describe('CategoryAutocomplete', () => {
  it('is a text combobox labelled with the archive, never a search input', () => {
    const input = setup()
    expect(input).toHaveAttribute('type', 'text')
    expect(input).toHaveAttribute('aria-autocomplete', 'list')
    expect(input).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByLabelText('חיפוש בספא')).toBe(input)
  })

  it('does not ask below two characters', async () => {
    const input = setup()
    await type(input, 'ס')
    expect(calls).toHaveLength(0)
  })

  it('asks the suggest route with the category scope after the debounce', async () => {
    const input = setup()
    fireEvent.change(input, { target: { value: 'ספא' } })
    expect(calls).toHaveLength(0)
    await act(async () => {
      vi.advanceTimersByTime(SUGGEST_DEBOUNCE_MS)
    })
    expect(calls).toHaveLength(1)
    expect(call(0).url.pathname).toBe('/api/search/suggest')
    expect(call(0).url.searchParams.get('q')).toBe('ספא')
    expect(call(0).url.searchParams.get('category')).toBe('spa')
  })

  it('lists the answers as options and opens the picked product', async () => {
    const input = setup()
    await type(input, 'ספא')
    await act(async () => answer([SPA, MASSAGE]))

    const options = screen.getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual([
      expect.stringContaining('יום ספא זוגי'),
      expect.stringContaining('עיסוי שוודי'),
    ])
    expect(option(0).textContent).toContain('299')
    expect(input).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(option(1))
    expect(push).toHaveBeenCalledWith('/product/massage')
  })

  it('moves with the arrows, wraps, and Enter picks the highlighted option', async () => {
    const input = setup()
    await type(input, 'ספא')
    await act(async () => answer([SPA, MASSAGE]))

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input).toHaveAttribute('aria-activedescendant', option(0).id)
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input).toHaveAttribute('aria-activedescendant', option(0).id)
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(option(1)).toHaveAttribute('aria-selected', 'true')

    fireEvent.submit(input.closest('form') as HTMLFormElement)
    expect(push).toHaveBeenCalledWith('/product/massage')
  })

  it('submits with nothing highlighted to the results page', async () => {
    const input = setup()
    await type(input, 'ספא זוגי')
    await act(async () => answer([SPA]))

    fireEvent.submit(input.closest('form') as HTMLFormElement)
    expect(push).toHaveBeenCalledWith(`/search?q=${encodeURIComponent('ספא זוגי')}`)
  })

  it('Escape closes the list without clearing the field', async () => {
    const input = setup()
    await type(input, 'ספא')
    await act(async () => answer([SPA]))
    expect(input).toHaveAttribute('aria-expanded', 'true')

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input).toHaveAttribute('aria-expanded', 'false')
    expect(input).toHaveValue('ספא')
  })

  it('says so when the archive has nothing for the query', async () => {
    const input = setup()
    await type(input, 'מקרר')
    await act(async () => answer([]))

    expect(screen.getByRole('status').textContent).toContain('אין הצעות בספא')
    expect(input).toHaveAttribute('aria-expanded', 'false')
  })

  it('aborts the older request and never shows a late answer', async () => {
    const input = setup()
    await type(input, 'ספ')
    const first = call(0)
    const firstAnswer = answer
    await type(input, 'ספא')
    expect(calls).toHaveLength(2)
    expect(first.signal.aborted).toBe(true)

    // Even if the first request had somehow resolved, its rows are dropped.
    await act(async () => firstAnswer([MASSAGE]))
    expect(screen.queryByRole('option')).toBeNull()

    await act(async () => answer([SPA]))
    expect(screen.getAllByRole('option')).toHaveLength(1)
  })

  it('keeps working after a failed request', async () => {
    const input = setup()
    await type(input, 'ספא')
    await act(async () => fail())
    expect(screen.queryByRole('option')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()

    expect(input).not.toHaveAttribute('aria-busy')

    fireEvent.submit(input.closest('form') as HTMLFormElement)
    expect(push).toHaveBeenCalledWith(`/search?q=${encodeURIComponent('ספא')}`)
  })
})
