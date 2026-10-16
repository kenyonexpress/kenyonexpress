import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SuccessPageShell } from './SuccessPageShell'

describe('SuccessPageShell', () => {
  it('renders children', () => {
    render(
      <SuccessPageShell>
        <div data-testid="test-child">Test Content</div>
      </SuccessPageShell>,
    )
    expect(screen.getByTestId('test-child')).toBeInTheDocument()
  })

  it('renders checkmark SVG', () => {
    const { container } = render(
      <SuccessPageShell>
        <div>Content</div>
      </SuccessPageShell>,
    )
    const svg = container.querySelector('.success-checkmark__svg')
    expect(svg).toBeInTheDocument()
  })

  it('applies animation data attribute', () => {
    const { container } = render(
      <SuccessPageShell>
        <div>Content</div>
      </SuccessPageShell>,
    )
    const checkmark = container.querySelector('.success-checkmark')
    expect(checkmark).toHaveAttribute('data-animated')
  })

  it('renders circle and path elements', () => {
    const { container } = render(
      <SuccessPageShell>
        <div>Content</div>
      </SuccessPageShell>,
    )
    const circle = container.querySelector('.success-checkmark__circle')
    const path = container.querySelector('.success-checkmark__path')
    expect(circle).toBeInTheDocument()
    expect(path).toBeInTheDocument()
  })

  it('has hidden SVG for screen readers', () => {
    const { container } = render(
      <SuccessPageShell>
        <div>Content</div>
      </SuccessPageShell>,
    )
    const svg = container.querySelector('.success-checkmark__svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
  })
})
