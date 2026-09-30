import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SiteSearch, { MIN_QUERY, SUGGEST_DEBOUNCE_MS, buildRows } from './SiteSearch'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    // biome-ignore lint/a11y/useAltText: passthrough stub, alt arrives via props
    return <img {...(props as object)} />
  },
}))

type Call = { url: URL; signal: AbortSignal | undefined; resolve: (body: unknown) => void }
let calls: Call[]

/**
 * Every fetch is a deferred the test resolves by hand, so the order in which
 * answers land is the test's choice. The late-answer case below depends on it.
 */
function deferredFetch() {
  return vi.fn((input: string, init?: RequestInit) => {
    const url = new URL(input, 'https://kenyonexpress.co.il')
    const signal = init?.signal ?? undefined
    return new Promise<Response>((resolve, reject) => {
      calls.push({
        url,
        signal,
        resolve: (body) => resolve(new Response(JSON.stringify(body), { status: 200 })),
      })
      signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })
  })
}

const SPA = { slug: 'spa-day', name_he: 'יום ספא זוגי', image: null, price: 299 }
const MASSAGE = { slug: 'massage', name_he: 'עיסוי שוודי', image: '/i/m.jpg', price: null }
const QUICK = {
  popular: [
    { term: 'ספא', target_url: null },
    { term: 'צימר', target_url: '/category/tzimmerim' },
  ],
  recent: ['ארוחת בוקר'],
}

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

function setup(props: Partial<React.ComponentProps<typeof SiteSearch>> = {}) {
  render(<SiteSearch id="masthead-search" variant="masthead" {...props} />)
  return screen.getByRole('combobox') as HTMLInputElement
}

function byPath(path: string): Call[] {
  return calls.filter((c) => c.url.pathname === path)
}

function lastCall(path: string): Call {
  const c = byPath(path).at(-1)
  if (!c) throw new Error(`no fetch to ${path}`)
  return c
}

async function focus(input: HTMLElement) {
  await act(async () => {
    fireEvent.focus(input)
  })
}

async function type(input: HTMLElement, value: string) {
  await act(async () => {
    fireEvent.change(input, { target: { value } })
    vi.advanceTimersByTime(SUGGEST_DEBOUNCE_MS)
  })
}

async function answer(path: string, body: unknown) {
  await act(async () => {
    lastCall(path).resolve(body)
  })
}

function options(): HTMLElement[] {
  return screen.queryAllByRole('option')
}

describe('SiteSearch', () => {
  it('is a search-typed combobox wired to its listbox by fixed ids', () => {
    const input = setup()
    expect(input.type).toBe('search')
    expect(input.id).toBe('masthead-search')
    expect(input).toHaveAttribute('aria-autocomplete', 'list')
    expect(input).toHaveAttribute('aria-controls', 'masthead-search-suggestions')
    expect(input).toHaveAttribute('aria-expanded', 'false')
    expect(input).not.toHaveAttribute('aria-activedescendant')
    expect(document.getElementById('masthead-search-suggestions')).toHaveAttribute(
      'role',
      'listbox',
    )
  })

  it('fetches the quick links once, on first focus, and shows recent then popular', async () => {
    const input = setup()
    expect(byPath('/api/search/quick-links')).toHaveLength(0)
    await focus(input)
    expect(byPath('/api/search/quick-links')).toHaveLength(1)
    await answer('/api/search/quick-links', QUICK)

    const rows = options()
    expect(rows.map((o) => o.textContent)).toEqual(['ארוחת בוקר', 'ספא', 'צימר'])
    expect(input).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('החיפושים האחרונים שלך')).toBeInTheDocument()
    expect(screen.getByText('חיפושים פופולריים')).toBeInTheDocument()

    // A second focus does not ask again.
    fireEvent.blur(input)
    await focus(input)
    expect(byPath('/api/search/quick-links')).toHaveLength(1)
  })

  it('does not ask below the floor, then asks the suggest route and lists products', async () => {
    const input = setup()
    await type(input, 'ס')
    expect(byPath('/api/search/suggest')).toHaveLength(0)

    await type(input, 'ספא')
    const call = lastCall('/api/search/suggest')
    expect(call.url.searchParams.get('q')).toBe('ספא')
    expect(call.url.searchParams.has('category')).toBe(false)
    expect(input).toHaveAttribute('aria-busy', 'true')

    await answer('/api/search/suggest', { results: [SPA, MASSAGE] })
    const rows = options()
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('יום ספא זוגי')
    expect(rows[0]).toHaveTextContent('299')
    expect(rows[1]).toHaveTextContent('עיסוי שוודי')
    expect(rows[2]).toHaveTextContent('כל התוצאות עבור ״ספא״')
    expect(rows[2]).toHaveAttribute('data-kind', 'link')
    expect(input).not.toHaveAttribute('aria-busy')
    expect(screen.getByText('נמצאו 2 הצעות')).toBeInTheDocument()
  })

  it('walks the rows with the arrow keys, Home and End, and carries the highlight in aria-activedescendant', async () => {
    const input = setup()
    await type(input, 'ספא')
    await answer('/api/search/suggest', { results: [SPA, MASSAGE] })

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input).toHaveAttribute('aria-activedescendant', 'masthead-search-option-0')
    expect(options()[0]).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input).toHaveAttribute('aria-activedescendant', 'masthead-search-option-1')
    fireEvent.keyDown(input, { key: 'End' })
    expect(input).toHaveAttribute('aria-activedescendant', 'masthead-search-option-2')
    // Wraps at the end.
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input).toHaveAttribute('aria-activedescendant', 'masthead-search-option-0')
    // ...and at the start.
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input).toHaveAttribute('aria-activedescendant', 'masthead-search-option-2')
    fireEvent.keyDown(input, { key: 'Home' })
    expect(input).toHaveAttribute('aria-activedescendant', 'masthead-search-option-0')
    expect(screen.getAllByRole('option', { selected: true })).toHaveLength(1)
  })

  it('Enter opens the highlighted product, and with nothing highlighted submits to /search', async () => {
    const input = setup()
    await type(input, 'ספא')
    await answer('/api/search/suggest', { results: [SPA, MASSAGE] })

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.submit(input.closest('form') as HTMLFormElement)
    expect(push).toHaveBeenCalledWith('/product/massage')

    // Navigating cleared the highlight, so the next submit is the query itself.
    push.mockReset()
    expect(input).not.toHaveAttribute('aria-activedescendant')
    fireEvent.submit(input.closest('form') as HTMLFormElement)
    expect(push).toHaveBeenCalledWith('/search?q=%D7%A1%D7%A4%D7%90')
  })

  it('Escape closes the list, a second Escape clears the field, a third hands off to onClose', async () => {
    const onClose = vi.fn()
    const input = setup({ onClose })
    await type(input, 'ספא')
    await answer('/api/search/suggest', { results: [SPA] })
    expect(input).toHaveAttribute('aria-expanded', 'true')

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input).toHaveAttribute('aria-expanded', 'false')
    expect(input.value).toBe('ספא')
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input.value).toBe('')
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('offers the promoted terms and the catalogue when a query finds nothing', async () => {
    const input = setup()
    await focus(input)
    await answer('/api/search/quick-links', QUICK)
    await type(input, 'ספא')
    await answer('/api/search/suggest', { results: [] })

    expect(screen.getByText(/לא נמצאו מוצרים עבור ״ספא״/)).toBeInTheDocument()
    const rows = options()
    // "ספא" itself is not suggested back; the operator's target URL is kept.
    expect(rows.map((o) => o.textContent)).toEqual(['צימר', 'לכל המוצרים'])
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.submit(input.closest('form') as HTMLFormElement)
    expect(push).toHaveBeenCalledWith('/category/tzimmerim')
  })

  it('drops an answer that lands after a newer keystroke', async () => {
    const input = setup()
    await type(input, 'ספא')
    const first = lastCall('/api/search/suggest')
    await type(input, 'ספא ז')
    const second = lastCall('/api/search/suggest')
    expect(second).not.toBe(first)
    expect(first.signal?.aborted).toBe(true)

    await act(async () => {
      second.resolve({ results: [MASSAGE] })
    })
    expect(options().map((o) => o.textContent)).toEqual(['עיסוי שוודי', 'כל התוצאות עבור ״ספא ז״'])
  })

  it('seeds the field from initialQuery without asking until the shopper types', () => {
    const input = setup({ initialQuery: 'צימר', variant: 'page', id: 'page-search' })
    expect(input.value).toBe('צימר')
    // Seeding is not typing: the results page already shows these results.
    vi.advanceTimersByTime(SUGGEST_DEBOUNCE_MS * 2)
    expect(byPath('/api/search/suggest')).toHaveLength(1)
  })
})

describe('buildRows', () => {
  const quick = { popular: [{ term: 'ספא', target_url: null }], recent: ['צימר'] }

  it('is quick links below the floor, products plus the all-results row above it', () => {
    expect(buildRows('', [], false, quick).map((r) => r.key)).toEqual([
      'recent:צימר',
      'popular:ספא',
    ])
    expect(buildRows('a'.repeat(MIN_QUERY), [SPA], true, quick).map((r) => r.key)).toEqual([
      'product:spa-day',
      'all',
    ])
  })

  it('is nothing while a query is unanswered, and the way out once it answered empty', () => {
    expect(buildRows('ספא', [], false, quick)).toEqual([])
    expect(buildRows('ספא', [], true, quick).map((r) => r.key)).toEqual(['catalogue'])
    expect(buildRows('צימר', [], true, quick).map((r) => r.key)).toEqual([
      'popular:ספא',
      'catalogue',
    ])
  })
})
