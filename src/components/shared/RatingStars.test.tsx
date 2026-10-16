import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RatingStars } from './RatingStars'

describe('RatingStars', () => {
  it('renders 5 full stars for rating 5', () => {
    const { container } = render(<RatingStars rating={5} />)
    const fullStars = container.querySelectorAll('[data-star-state="full"]')
    const halfStars = container.querySelectorAll('[data-star-state="half"]')
    const emptyStars = container.querySelectorAll('[data-star-state="empty"]')
    expect(fullStars).toHaveLength(5)
    expect(halfStars).toHaveLength(0)
    expect(emptyStars).toHaveLength(0)
  })

  it('renders 0 stars for rating 0', () => {
    const { container } = render(<RatingStars rating={0} />)
    const fullStars = container.querySelectorAll('[data-star-state="full"]')
    const halfStars = container.querySelectorAll('[data-star-state="half"]')
    const emptyStars = container.querySelectorAll('[data-star-state="empty"]')
    expect(fullStars).toHaveLength(0)
    expect(halfStars).toHaveLength(0)
    expect(emptyStars).toHaveLength(5)
  })

  it('renders full and empty stars for integer rating 3', () => {
    const { container } = render(<RatingStars rating={3} />)
    const fullStars = container.querySelectorAll('[data-star-state="full"]')
    const halfStars = container.querySelectorAll('[data-star-state="half"]')
    const emptyStars = container.querySelectorAll('[data-star-state="empty"]')
    expect(fullStars).toHaveLength(3)
    expect(halfStars).toHaveLength(0)
    expect(emptyStars).toHaveLength(2)
  })

  it('renders half star for rating 3.5', () => {
    const { container } = render(<RatingStars rating={3.5} />)
    const fullStars = container.querySelectorAll('[data-star-state="full"]')
    const halfStars = container.querySelectorAll('[data-star-state="half"]')
    const emptyStars = container.querySelectorAll('[data-star-state="empty"]')
    expect(fullStars).toHaveLength(3)
    expect(halfStars).toHaveLength(1)
    expect(emptyStars).toHaveLength(1)
  })

  it('renders half star for rating 1.5', () => {
    const { container } = render(<RatingStars rating={1.5} />)
    const fullStars = container.querySelectorAll('[data-star-state="full"]')
    const halfStars = container.querySelectorAll('[data-star-state="half"]')
    const emptyStars = container.querySelectorAll('[data-star-state="empty"]')
    expect(fullStars).toHaveLength(1)
    expect(halfStars).toHaveLength(1)
    expect(emptyStars).toHaveLength(3)
  })

  it('clamps rating above 5 to 5', () => {
    const { container } = render(<RatingStars rating={7.5} />)
    const fullStars = container.querySelectorAll('[data-star-state="full"]')
    const emptyStars = container.querySelectorAll('[data-star-state="empty"]')
    expect(fullStars).toHaveLength(5)
    expect(emptyStars).toHaveLength(0)
  })

  it('clamps rating below 0 to 0', () => {
    const { container } = render(<RatingStars rating={-2} />)
    const fullStars = container.querySelectorAll('[data-star-state="full"]')
    const emptyStars = container.querySelectorAll('[data-star-state="empty"]')
    expect(fullStars).toHaveLength(0)
    expect(emptyStars).toHaveLength(5)
  })

  it('renders Hebrew count text when count prop provided', () => {
    render(<RatingStars rating={3.5} count={523} />)
    expect(screen.getByText('(523 דירוגים)')).toBeInTheDocument()
  })

  it('renders singular form for count = 1', () => {
    render(<RatingStars rating={4} count={1} />)
    expect(screen.getByText('(1 דירוג)')).toBeInTheDocument()
  })

  it('hides count when showCount is false', () => {
    const { container } = render(<RatingStars rating={3.5} count={523} showCount={false} />)
    expect(container.querySelector('.rating-stars__count')).not.toBeInTheDocument()
  })

  it('includes count in aria-label when provided', () => {
    const { container } = render(<RatingStars rating={3.5} count={523} />)
    const ratingDiv = container.querySelector('[role="img"]')
    expect(ratingDiv).toHaveAttribute('aria-label', '3.5 מתוך 5 כוכבים, 523 דירוגים')
  })

  it('generates default aria-label without count', () => {
    const { container } = render(<RatingStars rating={3} />)
    const ratingDiv = container.querySelector('[role="img"]')
    expect(ratingDiv).toHaveAttribute('aria-label', '3 מתוך 5 כוכבים')
  })

  it('uses custom aria-label when provided', () => {
    const { container } = render(<RatingStars rating={3.5} ariaLabel="משהו מותאם אישית" />)
    const ratingDiv = container.querySelector('[role="img"]')
    expect(ratingDiv).toHaveAttribute('aria-label', 'משהו מותאם אישית')
  })

  it('applies custom className', () => {
    const { container } = render(<RatingStars rating={3} className="custom-class" />)
    expect(container.querySelector('.rating-stars')).toHaveClass('custom-class')
  })

  it('hides stars with aria-hidden', () => {
    const { container } = render(<RatingStars rating={3.5} count={100} />)
    const starsDiv = container.querySelector('.rating-stars__stars')
    expect(starsDiv).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders with custom size prop', () => {
    const { container } = render(<RatingStars rating={3} size={32} />)
    // The Star component receives the size prop
    const svgs = container.querySelectorAll('svg')
    expect(svgs.length).toBeGreaterThan(0)
  })

  it('does not round .25 up (only .5 and above show half star)', () => {
    const { container } = render(<RatingStars rating={2.25} />)
    const fullStars = container.querySelectorAll('[data-star-state="full"]')
    const halfStars = container.querySelectorAll('[data-star-state="half"]')
    const emptyStars = container.querySelectorAll('[data-star-state="empty"]')
    expect(fullStars).toHaveLength(2)
    expect(halfStars).toHaveLength(0) // 2.25 < 2.5, so no half star
    expect(emptyStars).toHaveLength(3)
  })

  it('renders half star for .5 exactly', () => {
    const { container } = render(<RatingStars rating={2.5} />)
    const fullStars = container.querySelectorAll('[data-star-state="full"]')
    const halfStars = container.querySelectorAll('[data-star-state="half"]')
    expect(fullStars).toHaveLength(2)
    expect(halfStars).toHaveLength(1)
  })

  it('renders as img role for proper ARIA semantics', () => {
    const { container } = render(<RatingStars rating={3} />)
    expect(container.querySelector('[role="img"]')).toBeInTheDocument()
  })

  it('renders without count prop or undefined count', () => {
    const { container } = render(<RatingStars rating={3} count={undefined} />)
    expect(container.querySelector('.rating-stars__count')).not.toBeInTheDocument()
  })

  it('handles 4.7 rating as 4.5 for display (rounds at 0.5)', () => {
    const { container } = render(<RatingStars rating={4.7} />)
    const fullStars = container.querySelectorAll('[data-star-state="full"]')
    const halfStars = container.querySelectorAll('[data-star-state="half"]')
    const emptyStars = container.querySelectorAll('[data-star-state="empty"]')
    expect(fullStars).toHaveLength(4)
    expect(halfStars).toHaveLength(1)
    expect(emptyStars).toHaveLength(0)
  })
})
