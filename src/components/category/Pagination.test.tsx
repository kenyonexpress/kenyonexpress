import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import Pagination from './Pagination'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

/**
 * The links are the contract: a page number that drops the sort, or a page=1
 * that survives in the URL, is a duplicate page for a crawler and a broken
 * back button for a shopper. jsdom renders the anchors and these read them.
 */
describe('Pagination', () => {
  it('renders nothing for a single page', () => {
    const { container } = render(
      <Pagination pathname="/category/spa" params={{}} currentPage={1} totalPages={1} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('keeps the active filters in every page link and drops page=1', () => {
    render(
      <Pagination
        pathname="/category/spa"
        params={{ sort: 'price', min: '50', max: undefined }}
        currentPage={2}
        totalPages={3}
      />,
    )
    expect(screen.getByRole('link', { name: 'העמוד הקודם' })).toHaveAttribute(
      'href',
      '/category/spa?sort=price&min=50',
    )
    expect(screen.getByRole('link', { name: 'העמוד הבא' })).toHaveAttribute(
      'href',
      '/category/spa?sort=price&min=50&page=3',
    )
    expect(screen.getByText('2')).toHaveAttribute('aria-current', 'page')
  })

  it('collapses a long run into first, last, the neighbours and gaps', () => {
    render(<Pagination pathname="/category/spa" params={{}} currentPage={6} totalPages={12} />)
    const labels = [...screen.getByRole('navigation').querySelectorAll('a, span')]
      .map((el) => el.textContent?.trim())
      .filter((t) => t && t !== '')
    expect(labels).toEqual(['1', '…', '5', '6', '7', '…', '12'])
  })

  it('disables the edge chevrons on the first and last page', () => {
    const { rerender } = render(
      <Pagination pathname="/p" params={{}} currentPage={1} totalPages={4} />,
    )
    expect(screen.queryByRole('link', { name: 'העמוד הקודם' })).toBeNull()
    expect(screen.getByRole('link', { name: 'העמוד הבא' })).toHaveAttribute('href', '/p?page=2')

    rerender(<Pagination pathname="/p" params={{}} currentPage={4} totalPages={4} />)
    expect(screen.queryByRole('link', { name: 'העמוד הבא' })).toBeNull()
    expect(screen.getByRole('link', { name: 'העמוד הקודם' })).toHaveAttribute('href', '/p?page=3')
  })
})
