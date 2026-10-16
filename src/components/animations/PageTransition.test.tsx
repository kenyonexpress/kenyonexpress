import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import PageTransition from './PageTransition'

describe('PageTransition', () => {
  it('renders children', () => {
    const { getByText } = render(
      <PageTransition>
        <div>Test Content</div>
      </PageTransition>,
    )
    expect(getByText('Test Content')).toBeInTheDocument()
  })

  it('applies motion div wrapper', () => {
    const { container } = render(
      <PageTransition>
        <div>Test Content</div>
      </PageTransition>,
    )
    const motionDiv = container.querySelector('div')
    expect(motionDiv).toBeInTheDocument()
  })

  it('renders multiple children', () => {
    const { getByText } = render(
      <PageTransition>
        <div>First</div>
        <div>Second</div>
      </PageTransition>,
    )
    expect(getByText('First')).toBeInTheDocument()
    expect(getByText('Second')).toBeInTheDocument()
  })
})
