import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ReviewList from './ReviewList'

vi.mock('./HelpfulVote', () => ({
  default: ({ initialCount }: { initialCount: number }) => <span>votes:{initialCount}</span>,
}))
vi.mock('./ReportReview', () => ({ default: () => null }))

/**
 * The sort reorders what is on the page and does not refetch, so these tests
 * are about ORDER and about the two things the order must not do: lose a
 * review, or become unstable when the counts tie.
 */
const review = (id: string, helpful: number, createdAt: string, rating = 5) => ({
  id,
  rating,
  title: `title-${id}`,
  body: `body-${id}`,
  created_at: createdAt,
  supplier_reply: null,
  supplier_replied_at: null,
  helpful_count: helpful,
})

function titles() {
  return screen.getAllByRole('listitem').map((li) => within(li).getByText(/^title-/).textContent)
}

describe('ReviewList', () => {
  const reviews = [
    review('a', 1, '2026-03-01T00:00:00Z'),
    review('b', 9, '2026-01-01T00:00:00Z'),
    review('c', 4, '2026-02-01T00:00:00Z'),
  ]

  it('opens on recency, in the order the server sent', () => {
    render(<ReviewList reviews={reviews} />)
    expect(titles()).toEqual(['title-a', 'title-b', 'title-c'])
  })

  it('reorders by helpful count on request, keeping every review', () => {
    render(<ReviewList reviews={reviews} />)
    fireEvent.click(screen.getByRole('button', { name: 'המועילות ביותר' }))
    expect(titles()).toEqual(['title-b', 'title-c', 'title-a'])
  })

  it('breaks a tie on helpfulness by recency, not by input order', () => {
    // Both have 2 votes. The older one is FIRST in the input, so an unstable
    // or naive sort would leave it first; recency must put the newer one first.
    render(
      <ReviewList
        reviews={[
          review('old', 2, '2026-01-01T00:00:00Z'),
          review('new', 2, '2026-06-01T00:00:00Z'),
        ]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'המועילות ביותר' }))
    expect(titles()).toEqual(['title-new', 'title-old'])
  })

  it('does not mutate the array it was given', () => {
    const input = [...reviews]
    const snapshot = input.map((r) => r.id)
    render(<ReviewList reviews={input} />)
    fireEvent.click(screen.getByRole('button', { name: 'המועילות ביותר' }))
    expect(input.map((r) => r.id)).toEqual(snapshot)
  })

  it('offers no sort control for a single review, because it would do nothing', () => {
    render(<ReviewList reviews={[review('only', 0, '2026-01-01T00:00:00Z')]} />)
    expect(screen.queryByRole('button', { name: 'המועילות ביותר' })).toBeNull()
  })

  it('marks the active sort with aria-pressed, so it is audible and not only bold', () => {
    render(<ReviewList reviews={reviews} />)
    const helpful = screen.getByRole('button', { name: 'המועילות ביותר' })
    expect(helpful.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(helpful)
    expect(helpful.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'החדשות ביותר' }).getAttribute('aria-pressed')).toBe(
      'false',
    )
  })

  it('treats an all-zero helpful_count list as the recency list, which is 222 unapplied', () => {
    const unvoted = [
      review('x', 0, '2026-03-01T00:00:00Z'),
      review('y', 0, '2026-02-01T00:00:00Z'),
      review('z', 0, '2026-01-01T00:00:00Z'),
    ]
    render(<ReviewList reviews={unvoted} />)
    fireEvent.click(screen.getByRole('button', { name: 'המועילות ביותר' }))
    expect(titles()).toEqual(['title-x', 'title-y', 'title-z'])
  })
})
