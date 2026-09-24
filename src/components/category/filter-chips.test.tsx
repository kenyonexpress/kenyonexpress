import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import FilterChips from './FilterChips'

vi.mock('next/navigation', () => ({
  usePathname: () => '/category/spa',
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams('open=weekend'),
}))

describe('filter chips', () => {
  it('links the two filter chips to toggled URLs and marks the active one', () => {
    const html = renderToStaticMarkup(
      <FilterChips
        pathname="/category/spa"
        params={{ sort: 'name', open: 'weekend', shipping: undefined }}
        filters={{ openWeekend: true }}
      />,
    )
    // The active chip links to the URL that turns it OFF.
    expect(html).toMatch(/data-testid="filter-chip-weekend"[^>]*/)
    expect(html).toContain('href="/category/spa?sort=name"')
    expect(html).toContain('href="/category/spa?sort=name&amp;open=weekend&amp;shipping=free"')
    expect(html.match(/aria-current="true"/g)).toHaveLength(1)
    expect(html).toContain('פתוח בסופ״ש')
    expect(html).toContain('משלוח חינם')
  })

  it('renders the near-me chip as a button that reflects the near query', () => {
    const html = renderToStaticMarkup(
      <FilterChips pathname="/category/spa" params={{}} filters={{}} />,
    )
    expect(html).toMatch(/<button[^>]*data-testid="filter-chip-near"/)
    expect(html).toContain('קרוב אליי')
    // No `near` in the mocked query, so it is off.
    expect(html).toContain('aria-pressed="false"')
  })
})
