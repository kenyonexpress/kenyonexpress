import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FlashCountdown, { phaseAt } from './FlashCountdown'

/**
 * The flash clock (STEP 61). Pinned: the phase is a pure function of the two
 * moments and the clock; the component paints the shaped blank first, then
 * the device's own count, labelled by phase; it reports each phase change
 * once; and at the end it says the sale is over instead of counting negative.
 */

const T0 = new Date('2026-10-08T12:00:00Z').getTime()
const iso = (offsetSeconds: number) => new Date(T0 + offsetSeconds * 1000).toISOString()

describe('phaseAt', () => {
  it('decides upcoming, live and ended from the two moments', () => {
    expect(phaseAt(iso(60), iso(120), T0)).toBe('upcoming')
    expect(phaseAt(iso(-60), iso(120), T0)).toBe('live')
    expect(phaseAt(iso(-120), iso(0), T0)).toBe('ended')
    expect(phaseAt('bad', iso(120), T0)).toBe('ended')
  })
})

describe('FlashCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('counts down to the end inside the window and labels it so', () => {
    const onPhaseChange = vi.fn()
    render(<FlashCountdown startsAt={iso(-60)} endsAt={iso(65)} onPhaseChange={onPhaseChange} />)
    act(() => {
      vi.advanceTimersByTime(0)
    })
    expect(screen.getByText('נגמר בעוד')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('00:01:05')
    expect(onPhaseChange).toHaveBeenCalledTimes(1)
    expect(onPhaseChange).toHaveBeenCalledWith('live')

    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(screen.getByRole('status')).toHaveTextContent('00:01:00')
    expect(onPhaseChange).toHaveBeenCalledTimes(1)
  })

  it('counts to the start before the window and flips to live when it opens', () => {
    const onPhaseChange = vi.fn()
    render(<FlashCountdown startsAt={iso(2)} endsAt={iso(600)} onPhaseChange={onPhaseChange} />)
    act(() => {
      vi.advanceTimersByTime(0)
    })
    expect(screen.getByText('מתחיל בעוד')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(screen.getByText('נגמר בעוד')).toBeInTheDocument()
    expect(onPhaseChange.mock.calls.map((c) => c[0])).toEqual(['upcoming', 'live'])
  })

  it('says the sale ended at the end instead of counting negative', () => {
    render(<FlashCountdown startsAt={iso(-60)} endsAt={iso(1)} />)
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(screen.getByText('המבצע הסתיים')).toBeInTheDocument()
    expect(screen.queryByRole('status')).toBeNull()
  })
})
