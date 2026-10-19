import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ProductCardSkeleton, { ProductsGridSkeleton } from './ProductCardSkeleton'

describe('ProductCardSkeleton', () => {
  it('renders without crashing', () => {
    const { container } = render(<ProductCardSkeleton />)
    expect(container.firstChild).toBeInTheDocument()
  })

  it('has aria-hidden attribute to prevent announcements', () => {
    const { container } = render(<ProductCardSkeleton />)
    const skeletonDiv = container.querySelector('[aria-hidden="true"]')
    expect(skeletonDiv).toBeInTheDocument()
  })

  it('has proper structure with placeholder elements', () => {
    const { container } = render(<ProductCardSkeleton />)
    const spans = container.querySelectorAll('span.block')
    expect(spans.length).toBeGreaterThan(0)
  })

  it('uses placeholder elements for skeleton color', () => {
    const { container } = render(<ProductCardSkeleton />)
    const placeholderElements = container.querySelectorAll('[class*="bg-"]')
    expect(placeholderElements.length).toBeGreaterThan(0)
  })
})

describe('ProductsGridSkeleton', () => {
  it('renders default count of 8 skeletons', () => {
    const { container } = render(<ProductsGridSkeleton />)
    const skeletons = container.querySelectorAll('[aria-hidden="true"]')
    expect(skeletons).toHaveLength(8)
  })

  it('renders custom count of skeletons', () => {
    const { container } = render(<ProductsGridSkeleton count={5} />)
    const skeletons = container.querySelectorAll('[aria-hidden="true"]')
    expect(skeletons).toHaveLength(5)
  })

  it('has aria-busy attribute on grid container', () => {
    const { container } = render(<ProductsGridSkeleton />)
    const grid = container.querySelector('[aria-busy="true"]')
    expect(grid).toBeInTheDocument()
  })

  it('has aria-label for accessibility', () => {
    const { container } = render(<ProductsGridSkeleton />)
    const grid = container.querySelector('[aria-label="טוען מוצרים"]')
    expect(grid).toBeInTheDocument()
  })

  it('uses grid classes for layout', () => {
    const { container } = render(<ProductsGridSkeleton />)
    const grid = container.querySelector('.grid')
    expect(grid?.className).toContain('grid')
    expect(grid?.className).toContain('gap-3')
  })
})
