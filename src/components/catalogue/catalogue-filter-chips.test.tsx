import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import CatalogueFilterChips from './CatalogueFilterChips'

describe('catalogue filter chips', () => {
  it('links the two column chips to toggled URLs and marks the active one', () => {
    const html = renderToStaticMarkup(
      <CatalogueFilterChips
        pathname="/category/spa"
        params={{ sort: 'name', open: 'weekend', shipping: undefined }}
        filters={{ openWeekend: true }}
      />,
    )
    // The active chip links to the URL that turns it OFF.
    expect(html).toContain('href="/category/spa?sort=name"')
    expect(html).toContain('href="/category/spa?sort=name&amp;open=weekend&amp;shipping=free"')
    expect(html.match(/aria-current="true"/g)).toHaveLength(1)
    expect(html).toContain('פתוח בסופ״ש')
    expect(html).toContain('משלוח חינם')
  })

  it('renders four chips in order, with no location chip, button or search field', () => {
    const html = renderToStaticMarkup(
      <CatalogueFilterChips pathname="/category/spa" params={{}} filters={{}} />,
    )
    const order = ['weekend', 'shipping', 'under99', 'newest'].map((id) =>
      html.indexOf(`data-testid="filter-chip-${id}"`),
    )
    expect(order.every((i) => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(html.match(/data-testid="filter-chip-/g)).toHaveLength(4)
    expect(html).not.toContain('filter-chip-near')
    expect(html).not.toMatch(/<button/)
    expect(html).not.toMatch(/<input/)
    expect(html).not.toContain('קרוב אליי')
  })

  it('keeps a near-sorted URL near-sorted while a chip narrows it', () => {
    const html = renderToStaticMarkup(
      <CatalogueFilterChips
        pathname="/category/spa"
        params={{ near: '32.08,34.78', page: '3' }}
        filters={{}}
      />,
    )
    expect(html).toContain('href="/category/spa?near=32.08%2C34.78&amp;shipping=free"')
    expect(html).not.toContain('page=3')
  })
})
