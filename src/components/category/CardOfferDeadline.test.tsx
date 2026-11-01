import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CardOfferDeadline from './CardOfferDeadline'

const NOW = new Date('2026-10-14T09:00:00Z')
const inHours = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000).toISOString()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const text = (iso: string) =>
  render(<CardOfferDeadline validUntilIso={iso} />).container.textContent

describe('CardOfferDeadline', () => {
  it('counts the days of an offer in its last week', () => {
    expect(text(inHours(3 * 24 + 1))).toBe('נותרו 3 ימים למבצע')
  })

  it('says it is the last day, and marks it', () => {
    const { container } = render(<CardOfferDeadline validUntilIso={inHours(5)} />)
    expect(container.textContent).toBe('היום האחרון למבצע')
    expect(container.querySelector('[data-urgency="today"]')).not.toBeNull()
  })

  it('prints nothing for a deadline more than a week away', () => {
    expect(text(inHours(30 * 24))).toBe('')
  })

  it('prints nothing once the offer has closed, or for a date it cannot read', () => {
    expect(text(inHours(-1))).toBe('')
    expect(text('not-a-date')).toBe('')
  })

  it('disappears when the deadline passes while the tab is open', () => {
    const { container } = render(<CardOfferDeadline validUntilIso={inHours(0.5)} />)
    expect(container.textContent).toBe('היום האחרון למבצע')
    act(() => {
      vi.advanceTimersByTime(31 * 60_000)
    })
    expect(container.textContent).toBe('')
  })
})
