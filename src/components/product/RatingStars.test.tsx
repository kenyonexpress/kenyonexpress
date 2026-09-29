import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import RatingStars from './RatingStars'

describe('RatingStars', () => {
  it('renders nothing when there is no summary', () => {
    const { container } = render(<RatingStars summary={null} href="/product/x/reviews" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing for a zero-count summary rather than a fabricated score', () => {
    const { container } = render(
      <RatingStars summary={{ count: 0, averageTenths: 0 }} href="/product/x/reviews" />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('links to the reviews page and states the exact average and count', () => {
    render(<RatingStars summary={{ count: 12, averageTenths: 45 }} href="/product/x/reviews" />)
    const link = screen.getByRole('link', { name: /4\.5.*12 ביקורות/ })
    expect(link).toHaveAttribute('href', '/product/x/reviews')
  })

  it('fills the stars for the rounded average, not the exact one', () => {
    render(<RatingStars summary={{ count: 3, averageTenths: 34 }} href="/product/x/reviews" />)
    const filled = document.querySelectorAll('.text-price')
    const empty = document.querySelectorAll('.text-border-alt')
    expect(filled).toHaveLength(3)
    expect(empty).toHaveLength(2)
  })
})
