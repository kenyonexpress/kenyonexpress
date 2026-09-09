import RatingStars from '@/components/product/RatingStars'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

/**
 * AN UNRATED PRODUCT RENDERS NO ELEMENT AT ALL, and every other claim in this
 * feature leans on that one.
 *
 * The card's star row is in the flow. The product card's geometry is measured
 * against the live site, and since the live reference was lost the pixel gate
 * refuses to score at all (docs/PARITY-REFERENCE.md), so a row that appeared on
 * every card could not be checked against anything. It is safe only because a
 * product with no approved review produces no node -- which is also the right
 * answer on its own terms: an empty five-star frame is a fabricated score of
 * zero, and reads as "rated, badly" rather than "not rated yet".
 *
 * `container.firstChild` and not a query for text: an element rendered with
 * `display: none` or an empty string would pass a text assertion and still
 * occupy the DOM.
 */
describe('RatingStars', () => {
  it('renders nothing at all without a summary', () => {
    const { container } = render(<RatingStars summary={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders a single labelled control, not ten loose glyphs', () => {
    render(<RatingStars summary={{ count: 12, average: 4.3 }} />)
    expect(screen.getByLabelText('דירוג 4.3 מתוך 5, 12 ביקורות')).toBeTruthy()
  })

  /**
   * The glyph COUNT is always five. What changes is how many sit in the filled
   * span and how many in the grey one, so a test that reads `textContent` off
   * the whole component measures nothing: 4.3 and 5.0 and 1.0 all produce the
   * same five characters. These read the two spans apart.
   */
  function split(container: HTMLElement): { filled: number; empty: number } {
    const wrap = container.querySelector('span[aria-hidden="true"]')
    const grey = wrap?.querySelector('span')
    const emptyText = grey?.textContent ?? ''
    const allText = wrap?.textContent ?? ''
    return { filled: allText.length - emptyText.length, empty: emptyText.length }
  }

  it('rounds the filled stars but leaves the number beside them alone', () => {
    // 4.3 paints four stars and the label still says 4.3. Painting 4.3 stars
    // needs a clipped overlay and buys precision the label already carries.
    const { container } = render(<RatingStars summary={{ count: 3, average: 4.3 }} />)
    expect(split(container)).toEqual({ filled: 4, empty: 1 })
    expect(container.textContent).toContain('(3)')
    expect(screen.getByLabelText(/4\.3/)).toBeTruthy()
  })

  it('rounds 4.5 up rather than down', () => {
    const { container } = render(<RatingStars summary={{ count: 2, average: 4.5 }} />)
    expect(split(container)).toEqual({ filled: 5, empty: 0 })
  })

  it('paints five filled and none grey at a perfect score', () => {
    const { container } = render(<RatingStars summary={{ count: 1, average: 5 }} />)
    expect(split(container)).toEqual({ filled: 5, empty: 0 })
  })

  it('paints one filled star at the floor, never zero', () => {
    // A review carries 1..5 (the CHECK on the column), so a rounded-to-zero row
    // is unreachable by construction. This pins the bottom of that range.
    const { container } = render(<RatingStars summary={{ count: 2, average: 1 }} />)
    expect(split(container)).toEqual({ filled: 1, empty: 4 })
  })
})
