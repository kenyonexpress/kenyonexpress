import { snapshotKey } from '@/lib/catalogue/infinite-state'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import InfiniteProductGrid from './InfiniteProductGrid'

vi.mock('@/components/category/CategoryProductCard', () => ({
  default: ({ product }: { product: { id: string } }) => <div data-testid="card">{product.id}</div>,
}))

const ENDPOINT = '/api/catalogue/listing?scope=shop'
const card = (id: string) => ({ id, slug: id, name_he: id, kenyon_price: 10, images: [] })
const pageOf = (n: number) => Array.from({ length: 2 }, (_, i) => card(`p${n}-${i}`))

let intersect: (() => void) | null = null
const fetchMock = vi.fn()

function installObserver() {
  class FakeObserver {
    constructor(callback: IntersectionObserverCallback) {
      intersect = () =>
        callback([{ isIntersecting: true } as IntersectionObserverEntry], this as never)
    }
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal('IntersectionObserver', FakeObserver)
}

function renderGrid(totalPages = 3) {
  return render(
    <InfiniteProductGrid
      initial={pageOf(1)}
      startPage={1}
      totalPages={totalPages}
      total={totalPages * 2}
      pageSize={2}
      endpoint={ENDPOINT}
    >
      <nav data-testid="numbered">1 2 3</nav>
    </InfiniteProductGrid>,
  )
}

const ids = () => screen.getAllByTestId('card').map((node) => node.textContent)

beforeEach(() => {
  intersect = null
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (url: string) => {
    const page = Number(new URL(url, 'http://x').searchParams.get('page'))
    return { ok: true, json: async () => ({ items: pageOf(page) }) }
  })
  vi.stubGlobal('fetch', fetchMock)
  window.sessionStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('InfiniteProductGrid', () => {
  it('keeps the numbered links when the browser cannot observe', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    // biome-ignore lint/performance/noDelete: the component tests for the property, not its value
    delete (window as { IntersectionObserver?: unknown }).IntersectionObserver
    renderGrid()
    expect(screen.getByTestId('numbered')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('appends the next page when the end scrolls into view, and updates the count', async () => {
    installObserver()
    renderGrid()
    await waitFor(() => expect(screen.queryByTestId('numbered')).toBeNull())
    expect(screen.getByText('מציג 1–2 מתוך 6 תוצאות')).toBeTruthy()

    await act(async () => intersect?.())
    await waitFor(() => expect(ids()).toEqual(['p1-0', 'p1-1', 'p2-0', 'p2-1']))
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${ENDPOINT}&page=2`)
    expect(screen.getByText('מציג 1–4 מתוך 6 תוצאות')).toBeTruthy()
  })

  it('stops at the last page and removes the button', async () => {
    installObserver()
    renderGrid(2)
    await waitFor(() => expect(screen.getByRole('button')).toBeTruthy())
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(ids()).toHaveLength(4))
    expect(screen.queryByRole('button')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('never shows a product twice when a page repeats one', async () => {
    installObserver()
    fetchMock.mockImplementation(async () => ({
      ok: true,
      json: async () => ({ items: [card('p1-1'), card('new')] }),
    }))
    renderGrid()
    await waitFor(() => expect(screen.getByRole('button')).toBeTruthy())
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(ids()).toEqual(['p1-0', 'p1-1', 'new']))
  })

  it('turns a failed request into a retry, and the retry loads the same page', async () => {
    installObserver()
    fetchMock.mockImplementationOnce(async () => ({ ok: false, status: 500 }))
    renderGrid()
    await waitFor(() => expect(screen.getByRole('button')).toBeTruthy())
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(screen.getByRole('button').textContent).toContain('נסו שוב'))
    expect(ids()).toHaveLength(2)

    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(ids()).toHaveLength(4))
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      `${ENDPOINT}&page=2`,
      `${ENDPOINT}&page=2`,
    ])
  })

  it('ignores a stored snapshot on a fresh visit', async () => {
    installObserver()
    window.sessionStorage.setItem(
      snapshotKey(ENDPOINT, 1),
      JSON.stringify({ items: pageOf(2), nextPage: 3, scrollY: 900, savedAt: Date.now() }),
    )
    renderGrid()
    await waitFor(() => expect(screen.getByRole('button')).toBeTruthy())
    expect(ids()).toHaveLength(2)
  })

  it('restores the appended pages and the offset after Back', async () => {
    installObserver()
    const scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)
    window.sessionStorage.setItem(
      snapshotKey(ENDPOINT, 1),
      JSON.stringify({ items: pageOf(2), nextPage: 3, scrollY: 900, savedAt: Date.now() }),
    )
    window.dispatchEvent(new PopStateEvent('popstate'))
    renderGrid()
    await waitFor(() => expect(ids()).toEqual(['p1-0', 'p1-1', 'p2-0', 'p2-1']))
    expect(scrollTo).toHaveBeenCalledWith(0, 900)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('stores what it appended when the shopper clicks away', async () => {
    installObserver()
    renderGrid()
    await waitFor(() => expect(screen.getByRole('button')).toBeTruthy())
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(ids()).toHaveLength(4))

    fireEvent.click(screen.getAllByTestId('card')[3] as HTMLElement)
    const stored = JSON.parse(window.sessionStorage.getItem(snapshotKey(ENDPOINT, 1)) ?? 'null')
    expect(stored.items.map((item: { id: string }) => item.id)).toEqual(['p2-0', 'p2-1'])
    expect(stored.nextPage).toBe(3)
  })
})
