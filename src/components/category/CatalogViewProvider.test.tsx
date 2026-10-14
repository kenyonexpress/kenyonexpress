import { CATALOG_VIEW_KEY } from '@/lib/catalog-view'
import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { CatalogViewBody, CatalogViewProvider, useCatalogView } from './CatalogViewProvider'

function Consumer() {
  const { view, setView, ready } = useCatalogView()
  return (
    <div>
      <output data-testid="view">{view}</output>
      <output data-testid="ready">{String(ready)}</output>
      <button type="button" onClick={() => setView('list')}>
        list
      </button>
      <button type="button" onClick={() => setView('grid')}>
        grid
      </button>
    </div>
  )
}

/**
 * The context the switcher writes and the cards read (UX14). Two things are
 * pinned: the FIRST render is the grid no matter what is stored (the server
 * rendered the grid, so a different first client render would be a hydration
 * mismatch), and the stored preference arrives in the effect after it.
 */
describe('CatalogViewProvider', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('renders the grid first and then the stored list, after the effect', async () => {
    window.localStorage.setItem(CATALOG_VIEW_KEY, 'list')
    render(
      <CatalogViewProvider>
        <Consumer />
      </CatalogViewProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'))
    expect(screen.getByTestId('view')).toHaveTextContent('list')
  })

  it('switches and persists the choice', async () => {
    render(
      <CatalogViewProvider>
        <Consumer />
        <CatalogViewBody>
          <span>grid or list</span>
        </CatalogViewBody>
      </CatalogViewProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'))
    expect(screen.getByTestId('view')).toHaveTextContent('grid')
    expect(document.querySelector('.category-page__body')?.getAttribute('data-view')).toBe('grid')

    act(() => screen.getByRole('button', { name: 'list' }).click())
    expect(screen.getByTestId('view')).toHaveTextContent('list')
    expect(document.querySelector('.category-page__body')?.getAttribute('data-view')).toBe('list')
    expect(window.localStorage.getItem(CATALOG_VIEW_KEY)).toBe('list')

    act(() => screen.getByRole('button', { name: 'grid' }).click())
    expect(window.localStorage.getItem(CATALOG_VIEW_KEY)).toBeNull()
  })

  it('is the grid, and inert, with no provider (the search results page)', () => {
    window.localStorage.setItem(CATALOG_VIEW_KEY, 'list')
    render(<Consumer />)
    expect(screen.getByTestId('view')).toHaveTextContent('grid')
    act(() => screen.getByRole('button', { name: 'list' }).click())
    expect(screen.getByTestId('view')).toHaveTextContent('grid')
  })
})
