import { CatalogViewProvider } from '@/components/category/CatalogViewProvider'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SearchControlBar from './SearchControlBar'

const push = vi.fn()
let search = ''

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/search',
  useSearchParams: () => new URLSearchParams(search),
}))

beforeEach(() => {
  push.mockReset()
  search = 'q=%D7%A1%D7%A4%D7%90'
  window.localStorage.clear()
  document.body.innerHTML = ''
})

function renderBar(props: Partial<React.ComponentProps<typeof SearchControlBar>> = {}) {
  return render(
    <CatalogViewProvider>
      <SearchControlBar sort="relevance" {...props} />
    </CatalogViewProvider>,
  )
}

/**
 * UX21: the results page's control bar. Measured before: no bar, no sort
 * control (the engine accepted `sort=` and nothing set it), no link in the
 * first screen to the filters 2011px down. Now the archive bar's anatomy
 * with the search's four orders, a phone link that opens the disclosure,
 * and the shared grid / list switcher.
 */
describe('SearchControlBar', () => {
  it('offers the four orders the engine can produce, relevance selected by default', () => {
    renderBar()
    const select = screen.getByRole('combobox', { name: 'מיון תוצאות החיפוש' })
    expect(select).toHaveValue('relevance')
    expect([...select.querySelectorAll('option')].map((o) => o.value)).toEqual([
      'relevance',
      'newest',
      'price_asc',
      'price_desc',
    ])
  })

  it('writes the sort to the URL, keeps the query and the facets, and drops the page', () => {
    search = 'q=%D7%A1%D7%A4%D7%90&city=%D7%97%D7%99%D7%A4%D7%94&page=3'
    renderBar()
    fireEvent.change(screen.getByRole('combobox', { name: 'מיון תוצאות החיפוש' }), {
      target: { value: 'price_asc' },
    })
    expect(push).toHaveBeenCalledTimes(1)
    const [href, options] = push.mock.calls[0] as [string, { scroll: boolean }]
    const out = new URLSearchParams(href.replace('/search?', ''))
    expect(href.startsWith('/search?')).toBe(true)
    expect(out.get('q')).toBe('ספא')
    expect(out.get('city')).toBe('חיפה')
    expect(out.get('sort')).toBe('price_asc')
    expect(out.has('page')).toBe(false)
    expect(options).toEqual({ scroll: false })
  })

  it('removes the parameter when relevance is chosen back', () => {
    search = 'q=%D7%A1%D7%A4%D7%90&sort=newest'
    renderBar({ sort: 'newest' })
    fireEvent.change(screen.getByRole('combobox', { name: 'מיון תוצאות החיפוש' }), {
      target: { value: 'relevance' },
    })
    expect(push).toHaveBeenCalledWith('/search?q=%D7%A1%D7%A4%D7%90', { scroll: false })
  })

  it('links the phone filters control to the disclosure and opens it on press', () => {
    const details = document.createElement('details')
    details.id = 'search-filters'
    document.body.appendChild(details)
    renderBar({ activeFilterCount: 2 })
    const link = screen.getByRole('link', { name: /סינון/ })
    expect(link).toHaveAttribute('href', '#search-filters')
    expect(link).toHaveTextContent('סינונים פעילים: 2')
    expect(details.open).toBe(false)
    fireEvent.click(link)
    expect(details.open).toBe(true)
  })

  it('shows no count when nothing narrows the search', () => {
    renderBar()
    expect(screen.getByRole('link', { name: /סינון/ })).not.toHaveTextContent('סינונים פעילים')
  })

  it('carries the shared view switcher', () => {
    renderBar()
    expect(
      screen.getByRole('group', { name: 'תצוגת המוצרים' }).querySelectorAll('button'),
    ).toHaveLength(2)
  })
})
