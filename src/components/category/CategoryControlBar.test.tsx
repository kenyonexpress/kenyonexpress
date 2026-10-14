import { CATALOG_VIEW_KEY } from '@/lib/catalog-view'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogViewProvider } from './CatalogViewProvider'
import CategoryControlBar from './CategoryControlBar'

const push = vi.fn()
let search = ''

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/products',
  useSearchParams: () => new URLSearchParams(search),
}))

beforeEach(() => {
  push.mockReset()
  search = ''
  window.localStorage.clear()
})

function renderBar(props: Partial<React.ComponentProps<typeof CategoryControlBar>> = {}) {
  return render(
    <CatalogViewProvider>
      <CategoryControlBar value="menu_order" {...props} />
    </CatalogViewProvider>,
  )
}

/**
 * The listing control bar (UX14). Measured before: the view switcher was four
 * `aria-hidden` spans and the sort <select> offered two orders the catalogue
 * cannot produce. Now the switcher is two pressed-state buttons that write the
 * preference, and the select offers exactly the four orders that reorder.
 */
describe('CategoryControlBar', () => {
  it('renders the view switcher as a named group of two buttons, grid pressed by default', () => {
    renderBar()
    const group = screen.getByRole('group', { name: 'תצוגת המוצרים' })
    const buttons = group.querySelectorAll('button')
    expect(buttons).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'תצוגת רשת' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'תצוגת רשימה' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(group.getAttribute('aria-hidden')).toBeNull()
  })

  it('pressing the list button presses it, releases the grid and stores the choice', async () => {
    renderBar()
    act(() => screen.getByRole('button', { name: 'תצוגת רשימה' }).click())
    expect(screen.getByRole('button', { name: 'תצוגת רשימה' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'תצוגת רשת' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    await waitFor(() => expect(window.localStorage.getItem(CATALOG_VIEW_KEY)).toBe('list'))
  })

  it('offers only the sort orders the catalogue honours, in live order', () => {
    renderBar()
    const select = screen.getByLabelText('מיון מוצרים') as HTMLSelectElement
    expect([...select.options].map((o) => o.value)).toEqual([
      'menu_order',
      'date',
      'price',
      'price-desc',
    ])
    expect([...select.options].map((o) => o.textContent)).not.toContain('למיין לפי פופולריות')
  })

  it('translates the WooCommerce orderby into our sort key and drops the page', () => {
    search = 'page=3&type=coupon'
    renderBar()
    fireEvent.change(screen.getByLabelText('מיון מוצרים'), { target: { value: 'price' } })
    expect(push).toHaveBeenCalledWith('/products?type=coupon&sort=price_asc', { scroll: false })
  })

  it('reads the current sort back into the select', () => {
    renderBar({ value: 'price_desc' })
    expect(screen.getByLabelText('מיון מוצרים')).toHaveValue('price-desc')
  })

  it('shows the active-filter count on the filters link, and nothing when there is none', () => {
    const { unmount } = renderBar({ activeFilterCount: 2 })
    const link = screen.getByRole('link', { name: /סינון/ })
    expect(link).toHaveAttribute('href', '#category-filters')
    expect(link.querySelector('.category-control-bar__filters-count')).toHaveTextContent('2')
    unmount()
    renderBar()
    expect(document.querySelector('.category-control-bar__filters-count')).toBeNull()
  })
})
