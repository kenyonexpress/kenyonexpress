import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CategoryActiveFilters from './CategoryActiveFilters'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

/**
 * The strip between the bar and the grid (UX14): nothing on a bare archive,
 * one removable link per facet, and "clear all" only when there is more than
 * one thing to clear.
 */
describe('CategoryActiveFilters', () => {
  it('renders nothing when no facet is on', () => {
    const { container } = render(
      <CategoryActiveFilters pathname="/products" params={{ sort: 'newest' }} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders one chip per facet, each a link that removes it', () => {
    render(<CategoryActiveFilters pathname="/products" params={{ type: 'coupon', min: '50' }} />)
    const nav = screen.getByRole('navigation', { name: 'סינונים פעילים' })
    expect(nav).toHaveAttribute('data-active-filters')
    const type = screen.getByRole('link', { name: 'הסרת הסינון סוג: קופונים' })
    expect(type).toHaveAttribute('href', '/products?min=50')
    const price = screen.getByRole('link', { name: /הסרת הסינון מחיר/ })
    expect(price).toHaveAttribute('href', '/products?type=coupon')
    expect(screen.getByRole('link', { name: 'נקה הכל' })).toHaveAttribute('href', '/products')
  })

  it('omits "clear all" when the one chip already clears everything', () => {
    render(
      <CategoryActiveFilters pathname="/products" params={{ sort: 'newest', brand: 'Sony' }} />,
    )
    expect(screen.getByRole('link', { name: 'הסרת הסינון מותג: Sony' })).toHaveAttribute(
      'href',
      '/products?sort=newest',
    )
    expect(screen.queryByRole('link', { name: 'נקה הכל' })).toBeNull()
  })
})
