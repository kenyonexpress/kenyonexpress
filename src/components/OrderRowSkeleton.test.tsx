import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import OrderRowSkeleton, { OrderRowsListSkeleton } from './OrderRowSkeleton'

describe('OrderRowSkeleton', () => {
  it('renders without crashing', () => {
    const { container } = render(<OrderRowSkeleton />)
    expect(container.firstChild).toBeInTheDocument()
  })

  it('has aria-hidden attribute', () => {
    const { container } = render(<OrderRowSkeleton />)
    const article = container.querySelector('article[aria-hidden="true"]')
    expect(article).toBeInTheDocument()
  })

  it('has cart-line class', () => {
    const { container } = render(<OrderRowSkeleton />)
    const article = container.querySelector('.cart-line')
    expect(article).toBeInTheDocument()
  })

  it('includes placeholder elements for content', () => {
    const { container } = render(<OrderRowSkeleton />)
    const placeholders = container.querySelectorAll('[class*="bg-"]')
    expect(placeholders.length).toBeGreaterThan(0)
  })
})

describe('OrderRowsListSkeleton', () => {
  it('renders default count of 3 skeletons', () => {
    const { container } = render(<OrderRowsListSkeleton />)
    const rows = container.querySelectorAll('.cart-line')
    expect(rows).toHaveLength(3)
  })

  it('renders custom count of skeletons', () => {
    const { container } = render(<OrderRowsListSkeleton count={2} />)
    const rows = container.querySelectorAll('.cart-line')
    expect(rows).toHaveLength(2)
  })

  it('has aria-busy attribute on list container', () => {
    const { container } = render(<OrderRowsListSkeleton />)
    const list = container.querySelector('[aria-busy="true"]')
    expect(list).toBeInTheDocument()
  })

  it('has aria-label for accessibility', () => {
    const { container } = render(<OrderRowsListSkeleton />)
    const list = container.querySelector('[aria-label="טוען פריטים"]')
    expect(list).toBeInTheDocument()
  })

  it('uses space-y-3 for row spacing', () => {
    const { container } = render(<OrderRowsListSkeleton />)
    const list = container.querySelector('.space-y-3')
    expect(list).toBeInTheDocument()
  })
})
