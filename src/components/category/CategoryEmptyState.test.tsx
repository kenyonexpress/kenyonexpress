import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CategoryEmptyState from './CategoryEmptyState'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

/**
 * The first line is a contract with e2e/category.spec.ts and the shop archive:
 * both look for it verbatim. The action is what this component adds, and the
 * two branches must not offer the same way out, because on a bare-empty page
 * "clear the filters" leads back to the page the shopper is already on.
 */
describe('CategoryEmptyState', () => {
  it('keeps the sentence the e2e suite looks for', () => {
    render(<CategoryEmptyState clearHref="/category/spa" hasFilters={false} />)
    expect(screen.getByText('לא נמצאו מוצרים התואמים את הבחירה שלך.')).toBeInTheDocument()
  })

  it('offers to drop every facet when the shopper narrowed the archive', () => {
    render(<CategoryEmptyState clearHref="/category/spa" hasFilters />)
    const link = screen.getByRole('link', { name: 'נקו את כל הסינונים' })
    expect(link).toHaveAttribute('href', '/category/spa')
    expect(screen.queryByRole('link', { name: 'לכל המוצרים' })).toBeNull()
  })

  it('offers the whole catalogue when the archive is empty on its own', () => {
    render(<CategoryEmptyState clearHref="/category/spa" hasFilters={false} />)
    const link = screen.getByRole('link', { name: 'לכל המוצרים' })
    expect(link).toHaveAttribute('href', '/products')
    expect(screen.queryByRole('link', { name: 'נקו את כל הסינונים' })).toBeNull()
  })

  it('carries no dir=ltr: every line is Hebrew and inherits the document direction', () => {
    const { container } = render(<CategoryEmptyState clearHref="/category/spa" hasFilters />)
    expect(container.querySelector('[dir="ltr"]')).toBeNull()
  })
})
