import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import WishlistCardSkeleton, { WishlistGridSkeleton } from './WishlistGridSkeleton'

describe('WishlistCardSkeleton', () => {
  it('renders without crashing', () => {
    const { container } = render(<WishlistCardSkeleton />)
    expect(container.firstChild).toBeInTheDocument()
  })

  it('has aria-hidden attribute', () => {
    const { container } = render(<WishlistCardSkeleton />)
    const card = container.querySelector('[aria-hidden="true"]')
    expect(card).toBeInTheDocument()
  })

  it('includes placeholder elements for content', () => {
    const { container } = render(<WishlistCardSkeleton />)
    const placeholders = container.querySelectorAll('[class*="bg-gray"]')
    expect(placeholders.length).toBeGreaterThan(0)
  })

  it('has rounded border styling', () => {
    const { container } = render(<WishlistCardSkeleton />)
    const card = container.querySelector('.rounded-xl')
    expect(card).toBeInTheDocument()
  })
})

describe('WishlistGridSkeleton', () => {
  it('renders default count of 4 skeletons', () => {
    const { container } = render(<WishlistGridSkeleton />)
    const items = container.querySelectorAll('li')
    expect(items).toHaveLength(4)
  })

  it('renders custom count of skeletons', () => {
    const { container } = render(<WishlistGridSkeleton count={2} />)
    const items = container.querySelectorAll('li')
    expect(items).toHaveLength(2)
  })

  it('has aria-busy attribute on list container', () => {
    const { container } = render(<WishlistGridSkeleton />)
    const list = container.querySelector('[aria-busy="true"]')
    expect(list).toBeInTheDocument()
  })

  it('has aria-label for accessibility', () => {
    const { container } = render(<WishlistGridSkeleton />)
    const list = container.querySelector('[aria-label="טוען רשימת משאלות"]')
    expect(list).toBeInTheDocument()
  })

  it('uses responsive grid layout', () => {
    const { container } = render(<WishlistGridSkeleton />)
    const list = container.querySelector('.grid')
    expect(list?.className).toContain('sm:grid-cols-2')
  })
})
