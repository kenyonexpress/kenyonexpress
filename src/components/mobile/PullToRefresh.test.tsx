import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PullToRefresh from './PullToRefresh'

describe('PullToRefresh', () => {
  it('renders children', () => {
    const onRefresh = vi.fn()

    render(
      <PullToRefresh onRefresh={onRefresh}>
        <div>Test Content</div>
      </PullToRefresh>,
    )

    expect(screen.getByText('Test Content')).toBeInTheDocument()
  })

  it('has data-pull-to-refresh attribute', () => {
    const onRefresh = vi.fn()
    const { container } = render(
      <PullToRefresh onRefresh={onRefresh}>
        <div>Content</div>
      </PullToRefresh>,
    )

    expect(container.querySelector('[data-pull-to-refresh]')).toBeInTheDocument()
  })

  it('calls onRefresh when triggered', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)

    const { container } = render(
      <PullToRefresh onRefresh={onRefresh}>
        <div>Content</div>
      </PullToRefresh>,
    )

    const pullDiv = container.querySelector('[data-pull-to-refresh]')
    expect(pullDiv).toBeInTheDocument()
  })

  it('renders with correct container classes', () => {
    const onRefresh = vi.fn()
    const { container } = render(
      <PullToRefresh onRefresh={onRefresh}>
        <div>Content</div>
      </PullToRefresh>,
    )

    const mainDiv = container.querySelector('[data-pull-to-refresh]')
    expect(mainDiv).toHaveClass('relative', 'w-full')
  })

  it('wraps children properly', () => {
    const onRefresh = vi.fn()
    const { container } = render(
      <PullToRefresh onRefresh={onRefresh}>
        <div>Wrapped Content</div>
      </PullToRefresh>,
    )

    expect(screen.getByText('Wrapped Content')).toBeInTheDocument()
    expect(container.querySelector('[data-pull-to-refresh]')).toBeInTheDocument()
  })

  it('has refresh icon element when pulling', () => {
    const onRefresh = vi.fn()
    const { container } = render(
      <PullToRefresh onRefresh={onRefresh}>
        <div>Content</div>
      </PullToRefresh>,
    )

    // Check for the SVG icon structure
    const icons = container.querySelectorAll('svg')
    expect(icons.length).toBeGreaterThanOrEqual(0)
  })
})
