import { CATALOG_PAGING_KEY, scrollDepthKey } from '@/lib/catalog-paging'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CatalogGrid, { LOAD_MORE_LABEL, LOADING_LABEL, RETRY_LABEL } from './CatalogGrid'

vi.mock('@/components/category/CategoryProductCard', () => ({
  default: ({ product }: { product: { slug: string; name_he: string } }) => (
    <a href={`/product/${product.slug}`}>{product.name_he}</a>
  ),
}))

/**
 * The grid's two ways past page one (UX22). Pinned: the FIRST render is the
 * numbered mode whatever is stored (the server rendered the links, so any
 * other first client render is a hydration mismatch), the stored choice
 * arrives in the effect, the next page lands inside the same <ul> with the
 * count and the live region saying so, a failed fetch becomes a retry and
 * nothing loops, the depth reached is refilled on the way back, and
 * choosing the numbered pages again drops the appended cards.
 */

type Item = { id: string; slug: string; name_he: string; kenyon_price: number; images: unknown }

function item(id: string): Item {
  return { id, slug: `p-${id}`, name_he: `מוצר ${id}`, kenyon_price: 10, images: [] }
}

function pageBody(page: number, items: Item[], total = 46, totalPages = 2) {
  return { items, total, page, totalPages, pageSize: 24 }
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  } as Response
}

const serverItems = Array.from({ length: 24 }, (_, i) => item(`s${i + 1}`))

function renderGrid(props: Partial<React.ComponentProps<typeof CatalogGrid>> = {}) {
  return render(
    <CatalogGrid
      page={1}
      totalPages={2}
      total={46}
      pageSize={24}
      from={1}
      to={24}
      pagination={<nav aria-label="ניווט בין עמודים">pages</nav>}
      {...props}
    >
      {serverItems.map((p) => (
        <li key={p.id} className="category-products__item">
          <a href={`/product/${p.slug}`}>{p.name_he}</a>
        </li>
      ))}
    </CatalogGrid>,
  )
}

let fetchMock: ReturnType<typeof vi.fn>

/** A controllable stand-in for the browser's observer: the test fires the crossing. */
class FakeObserver {
  static instances: FakeObserver[] = []
  callback: IntersectionObserverCallback
  observed: Element[] = []
  disconnected = false
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
    FakeObserver.instances.push(this)
  }
  observe(el: Element) {
    this.observed.push(el)
  }
  disconnect() {
    this.disconnected = true
  }
  unobserve() {}
  takeRecords() {
    return []
  }
  fire(entry: Partial<IntersectionObserverEntry>) {
    this.callback(
      [{ isIntersecting: false, boundingClientRect: { bottom: 100 }, ...entry } as never],
      this as never,
    )
  }
}

describe('CatalogGrid', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    window.history.replaceState({}, '', '/products?sort=price_asc')
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    FakeObserver.instances = []
    vi.stubGlobal('IntersectionObserver', undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the numbered pages, the switch and the count by default, with no load-more', async () => {
    renderGrid()
    expect(screen.getByRole('navigation', { name: 'ניווט בין עמודים' })).toBeInTheDocument()
    const group = screen.getByRole('group', { name: 'אופן הדפדוף' })
    expect(group).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'עמודים' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'גלילה רציפה' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.queryByRole('button', { name: LOAD_MORE_LABEL })).not.toBeInTheDocument()
    expect(screen.getByText('מציג 1–24 מתוך 46 תוצאות')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(24)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('renders no switch and no pagination when there is one page', () => {
    renderGrid({ totalPages: 1, total: 13, to: 13, pagination: null })
    expect(screen.queryByRole('group', { name: 'אופן הדפדוף' })).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(screen.getByText('מציגים את כל ⁦13⁩ התוצאות')).toBeInTheDocument()
  })

  it('renders the numbered mode first and then the stored continuous mode, after the effect', async () => {
    window.localStorage.setItem(CATALOG_PAGING_KEY, 'scroll')
    renderGrid()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'גלילה רציפה' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    )
    expect(screen.queryByRole('navigation', { name: 'ניווט בין עמודים' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: LOAD_MORE_LABEL })).toBeInTheDocument()
    // Nothing was fetched on its own: the observer is absent here, the press is the shopper's.
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('appends the next page inside the same list, updates the count, announces, and remembers the depth', async () => {
    window.localStorage.setItem(CATALOG_PAGING_KEY, 'scroll')
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        pageBody(
          2,
          Array.from({ length: 22 }, (_, i) => item(`n${i + 1}`)),
        ),
      ),
    )
    renderGrid()
    const button = await screen.findByRole('button', { name: LOAD_MORE_LABEL })
    fireEvent.click(button)

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(46))
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), 'http://localhost')
    expect(url.pathname).toBe('/api/catalog/page')
    expect(url.searchParams.get('page')).toBe('2')
    expect(url.searchParams.get('sort')).toBe('price_asc')

    const lists = screen.getAllByRole('list')
    expect(lists).toHaveLength(1)
    expect(lists[0]?.querySelectorAll('li[data-loaded-page="2"]')).toHaveLength(22)
    expect(screen.getByText('מציגים את כל ⁦46⁩ התוצאות')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(
      'נטענו 22 מוצרים נוספים. מציג 1–46 מתוך 46.',
    )
    // The last page is in: no more button.
    expect(screen.queryByRole('button', { name: LOAD_MORE_LABEL })).not.toBeInTheDocument()
    expect(window.sessionStorage.getItem(scrollDepthKey('/products', '?sort=price_asc'))).toBe('2')
  })

  it('turns a failed fetch into a retry, and the retry loads', async () => {
    window.localStorage.setItem(CATALOG_PAGING_KEY, 'scroll')
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: 'rate_limited' }, false, 429))
      .mockResolvedValueOnce(jsonResponse(pageBody(2, [item('n1')], 25)))
    renderGrid({ total: 25 })
    fireEvent.click(await screen.findByRole('button', { name: LOAD_MORE_LABEL }))
    const retry = await screen.findByRole('button', { name: RETRY_LABEL })
    expect(retry).toHaveAttribute('data-status', 'error')
    expect(screen.getAllByRole('listitem')).toHaveLength(24)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    fireEvent.click(retry)
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(25))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('disables the button while a page is in flight and ignores a second press', async () => {
    window.localStorage.setItem(CATALOG_PAGING_KEY, 'scroll')
    let resolve: (value: Response) => void = () => {}
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((r) => {
        resolve = r
      }),
    )
    renderGrid()
    const button = await screen.findByRole('button', { name: LOAD_MORE_LABEL })
    fireEvent.click(button)
    await screen.findByRole('button', { name: LOADING_LABEL })
    expect(screen.getByRole('button', { name: LOADING_LABEL })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: LOADING_LABEL }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await act(async () => {
      resolve(jsonResponse(pageBody(2, [item('n1')])))
    })
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(25))
  })

  it('lets the observer press the button when the foot is reached, or already passed', async () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver)
    window.localStorage.setItem(CATALOG_PAGING_KEY, 'scroll')
    fetchMock.mockResolvedValueOnce(jsonResponse(pageBody(2, [item('n1')])))
    renderGrid()
    await screen.findByRole('button', { name: LOAD_MORE_LABEL })
    await waitFor(() => expect(FakeObserver.instances.length).toBeGreaterThan(0))
    const observer = FakeObserver.instances[FakeObserver.instances.length - 1]
    if (!observer) throw new Error('no observer was constructed')
    expect(observer.observed[0]).toBe(screen.getByRole('button', { name: LOAD_MORE_LABEL }))

    // Not reached yet: nothing happens.
    act(() =>
      observer.fire({ isIntersecting: false, boundingClientRect: { bottom: 500 } as never }),
    )
    expect(fetchMock).not.toHaveBeenCalled()

    // Jumped past it in one frame: above the viewport counts as reached.
    act(() =>
      observer.fire({ isIntersecting: false, boundingClientRect: { bottom: -10 } as never }),
    )
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(25))
  })

  it('refills to the depth this URL reached in the session, in order, on the way back', async () => {
    window.localStorage.setItem(CATALOG_PAGING_KEY, 'scroll')
    window.sessionStorage.setItem(scrollDepthKey('/products', '?sort=price_asc'), '3')
    fetchMock.mockImplementation(async (input: string) => {
      const page = Number(new URL(input, 'http://localhost').searchParams.get('page'))
      return jsonResponse(pageBody(page, [item(`p${page}`)], 60, 3))
    })
    renderGrid({ totalPages: 3, total: 60 })
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(26))
    const pages = fetchMock.mock.calls.map((call) =>
      new URL(String(call[0]), 'http://localhost').searchParams.get('page'),
    )
    expect(pages.sort()).toEqual(['2', '3'])
    const loaded = [...document.querySelectorAll('li[data-loaded-page]')].map((li) =>
      li.getAttribute('data-loaded-page'),
    )
    expect(loaded).toEqual(['2', '3'])
    expect(screen.queryByRole('button', { name: LOAD_MORE_LABEL })).not.toBeInTheDocument()
  })

  it('choosing the numbered pages again drops the appended cards and forgets the depth', async () => {
    window.localStorage.setItem(CATALOG_PAGING_KEY, 'scroll')
    fetchMock.mockResolvedValueOnce(jsonResponse(pageBody(2, [item('n1')])))
    renderGrid()
    fireEvent.click(await screen.findByRole('button', { name: LOAD_MORE_LABEL }))
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(25))

    fireEvent.click(screen.getByRole('button', { name: 'עמודים' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(24)
    expect(screen.getByRole('navigation', { name: 'ניווט בין עמודים' })).toBeInTheDocument()
    expect(screen.getByText('מציג 1–24 מתוך 46 תוצאות')).toBeInTheDocument()
    expect(window.localStorage.getItem(CATALOG_PAGING_KEY)).toBeNull()
    expect(window.sessionStorage.getItem(scrollDepthKey('/products', '?sort=price_asc'))).toBeNull()
  })

  it('choosing continuous loading writes the preference and hides the links', async () => {
    renderGrid()
    fireEvent.click(screen.getByRole('button', { name: 'גלילה רציפה' }))
    expect(window.localStorage.getItem(CATALOG_PAGING_KEY)).toBe('scroll')
    expect(screen.queryByRole('navigation', { name: 'ניווט בין עמודים' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: LOAD_MORE_LABEL })).toBeInTheDocument()
  })
})
