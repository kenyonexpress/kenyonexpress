import { formatCountdown, secondsUntilJerusalemMidnight } from '@/lib/homepage/below-fold-rules'
import { act, render } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DealCountdown from './DealCountdown'

/**
 * UX08: the countdown is ONE yellow pill, Electro's `.deal-countdown-timer`,
 * with the label and the figures inside the same box. Before this it was a
 * label beside a separate monospace chip (logs/ux08/before.json). The
 * server-side blank and the one-second tick are the same contract as before;
 * they are pinned here because the shape rewrite is the kind of change that
 * silently drops them.
 */
describe('DealCountdown', () => {
  const NOW = new Date('2026-10-14T05:00:00Z') // 08:00 in Israel: 16h left

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('is blank but shaped on the server: the same box, dashes for the figures', () => {
    const html = renderToStaticMarkup(<DealCountdown />)
    expect(html).toContain('data-deal-countdown')
    expect(html).toContain('>--:--:--<')
  })

  it('fills on mount with the time to Israel midnight and ticks once a second', () => {
    const { container } = render(<DealCountdown />)
    const output = container.querySelector('output') as HTMLOutputElement
    const expected = formatCountdown(secondsUntilJerusalemMidnight(NOW))
    expect(output.textContent).toBe(expected)
    expect(output.textContent).toMatch(/^\d\d:\d\d:\d\d$/)

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(output.textContent).toBe(formatCountdown(secondsUntilJerusalemMidnight(NOW) - 1))
  })

  it('is one pill: label and figures in the same full-round yellow box, body face, no monospace', () => {
    const { container } = render(<DealCountdown />)
    const pill = container.querySelector('[data-deal-countdown]') as HTMLElement
    expect(pill.tagName).toBe('P')
    for (const cls of [
      'inline-flex',
      'rounded-full',
      'bg-brand-primary',
      'min-h-deal-countdown',
      'px-deal-countdown-pad',
      'text-body-lg',
      'font-bold',
      'text-heading',
    ])
      expect(pill.classList.contains(cls), cls).toBe(true)
    expect(pill.querySelector('span')?.textContent).toBe('מסתיים בעוד:')
    const output = pill.querySelector('output') as HTMLOutputElement
    expect(output.getAttribute('dir')).toBe('ltr')
    expect(output.getAttribute('aria-live')).toBe('off')
    expect(output.classList.contains('tabular-nums')).toBe(true)
    expect(container.innerHTML).not.toMatch(/font-mono|tracking-widest/)
  })
})
