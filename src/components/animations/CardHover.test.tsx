import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CardHover from './CardHover'

describe('CardHover', () => {
  it('renders children', () => {
    const { getByText } = render(
      <CardHover>
        <div>Card Content</div>
      </CardHover>,
    )
    expect(getByText('Card Content')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = render(
      <CardHover className="test-class">
        <div>Card Content</div>
      </CardHover>,
    )
    const motionDiv = container.querySelector('.test-class')
    expect(motionDiv).toBeInTheDocument()
  })

  it('calls onClick handler when clicked', () => {
    const handleClick = vi.fn()
    const { container } = render(
      <CardHover onClick={handleClick}>
        <div>Card Content</div>
      </CardHover>,
    )
    const button = container.querySelector('[role="button"]')
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(handleClick).toHaveBeenCalled()
  })

  it('has role="button" attribute', () => {
    const { container } = render(
      <CardHover>
        <div>Card Content</div>
      </CardHover>,
    )
    const button = container.querySelector('[role="button"]')
    expect(button).toBeInTheDocument()
  })

  it('renders nested motion div for shadow effects', () => {
    const { container } = render(
      <CardHover>
        <div>Card Content</div>
      </CardHover>,
    )
    const motionDivs = container.querySelectorAll('div')
    expect(motionDivs.length).toBeGreaterThanOrEqual(2)
  })
})
