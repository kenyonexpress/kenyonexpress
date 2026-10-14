import { act, render } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CouponCountdown from './CouponCountdown'

/**
 * UX10: the hot-coupon countdown pill. Blank-but-shaped on the server, filled
 * on mount, ticking once a second, urgent under a day, and honest once the
 * deadline has passed. The figures themselves are pinned in
 * lib/homepage/coupon-countdown.test.ts.
 */
describe('CouponCountdown', () => {
  const NOW = new Date('2026-10-14T08:00:00Z')

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('is blank but shaped on the server: the label and dashes in the same pill', () => {
    const html = renderToStaticMarkup(<CouponCountdown validUntilIso="2026-10-17T12:12:33Z" />)
    expect(html).toContain('data-coupon-countdown')
    expect(html).toContain('data-urgency="none"')
    expect(html).toContain('מסתיים בעוד')
    expect(html).toMatch(/<output[^>]*dir="ltr"[^>]*>--:--:--<\/output>/)
  })

  it('fills on mount with the days and the clock, and ticks once a second', () => {
    const { container } = render(<CouponCountdown validUntilIso="2026-10-17T12:12:33Z" />)
    const pill = container.querySelector('[data-coupon-countdown]') as HTMLElement
    const output = pill.querySelector('output') as HTMLOutputElement
    expect(pill.dataset.urgency).toBe('soon')
    expect(pill.querySelector('span')?.textContent).toBe('מסתיים בעוד 3 ימים')
    expect(output.textContent).toBe('04:12:33')
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(output.textContent).toBe('04:12:32')
  })

  it('drops the day word and turns urgent under a day', () => {
    const { container } = render(<CouponCountdown validUntilIso="2026-10-14T20:30:00Z" />)
    const pill = container.querySelector('[data-coupon-countdown]') as HTMLElement
    expect(pill.dataset.urgency).toBe('today')
    expect(pill.querySelector('span')?.textContent).toBe('מסתיים בעוד')
    expect(pill.querySelector('output')?.textContent).toBe('12:30:00')
  })

  it('reads "המבצע הסתיים" past the deadline, with no clock, and stops ticking', () => {
    const { container } = render(<CouponCountdown validUntilIso="2026-10-14T08:00:02Z" />)
    const pill = () => container.querySelector('[data-coupon-countdown]') as HTMLElement
    expect(pill().querySelector('output')?.textContent).toBe('00:00:02')
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(pill().dataset.urgency).toBe('ended')
    expect(pill().textContent).toContain('המבצע הסתיים')
    expect(pill().querySelector('output')).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('stays blank for a deadline it cannot parse', () => {
    const { container } = render(<CouponCountdown validUntilIso="not a date" />)
    expect(container.querySelector('output')?.textContent).toBe('--:--:--')
    expect(vi.getTimerCount()).toBe(0)
  })
})
