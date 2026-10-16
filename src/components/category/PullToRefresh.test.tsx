import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen } from '@testing-library/react'

import PullToRefresh from '@/components/category/PullToRefresh'

describe('PullToRefresh', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders children', () => {
    render(
      <PullToRefresh categorySlug="test-category">
        <div>Test Content</div>
      </PullToRefresh>,
    )
    expect(screen.getByText('Test Content')).toBeInTheDocument()
  })

  it('renders the refresh indicator', () => {
    const { container } = render(
      <PullToRefresh categorySlug="test-category">
        <div>Test Content</div>
      </PullToRefresh>,
    )
    const indicator = container.querySelector('.pull-to-refresh__indicator')
    expect(indicator).toBeInTheDocument()
  })

  it('renders an SVG icon in the indicator', () => {
    const { container } = render(
      <PullToRefresh categorySlug="test-category">
        <div>Test Content</div>
      </PullToRefresh>,
    )
    const svg = container.querySelector('.pull-to-refresh__indicator svg')
    expect(svg).toBeInTheDocument()
  })

  it('accepts a categorySlug prop', () => {
    const { container } = render(
      <PullToRefresh categorySlug="my-category">
        <div>Test Content</div>
      </PullToRefresh>,
    )
    expect(container).toBeInTheDocument()
  })
})
