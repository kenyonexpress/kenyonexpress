import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * THE "VERIFYING YOUR PAYMENT" PAGE POLLED FOREVER.
 *
 * `/checkout/return` renders `AutoRefresh` whenever `reconcileOrderReturn`
 * answers `pending`, and that answer is reached from several places that can
 * be permanent: no payment row yet, a payment with no Low Profile id, or an
 * amount mismatch. Nothing in the reconcile ever gives up - the only exits are
 * `paid` and a status that is no longer `pending`, and NOTHING in this
 * codebase moves an abandoned order off `pending`. `orders.expires_at` is
 * written at insert (ORDER_EXPIRY_MINUTES = 30) and read by no sweeper.
 *
 * So a shopper who closed the Cardcom page and left this tab open kept a
 * three-second loop running against `reconcileOrderReturn` - which, once a Low
 * Profile id exists, calls `provider.verifyLowProfile` on every pass. 1,200
 * calls an hour to the payment provider, per open tab, until the laptop
 * sleeps. And the shopper stared at "מאמתים את התשלום..." with no route out:
 * the pending screen has no link on it at all.
 *
 * The checklist row asks for exactly this - "ודא שבסוף מתייצב" - and the
 * unmount half was already right. It is the "בסוף" half that did not exist.
 *
 * Two minutes is the budget: long enough to cover a slow webhook, short enough
 * that nobody watches a dead spinner. What replaces it is a route, not just a
 * stop: the order is real and paid-or-not is knowable from the account.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const refresh = vi.hoisted(() => vi.fn())

import AutoRefresh from './AutoRefresh'

beforeEach(() => {
  refresh.mockClear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

/** Advance the clock inside act(), so the effect's state lands. */
function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

describe('AutoRefresh on the payment-return page', () => {
  it('polls while there is still budget', () => {
    render(<AutoRefresh />)
    advance(9000)
    expect(refresh).toHaveBeenCalledTimes(3)
  })

  it('stops on its own instead of polling the provider forever', () => {
    render(<AutoRefresh />)
    advance(120_000)
    const atBudget = refresh.mock.calls.length

    advance(600_000)
    expect(refresh).toHaveBeenCalledTimes(atBudget)
  })

  it('leaves the shopper somewhere to go when it stops', () => {
    // The pending screen carries no link of its own, so giving up silently
    // would leave a dead spinner and nothing else on the page.
    render(<AutoRefresh />)
    advance(120_000)

    expect(screen.getByRole('link', { name: /ההזמנות שלי/ }).getAttribute('href')).toBe(
      '/account/orders',
    )
    expect(screen.getByRole('button', { name: 'בדקו שוב' })).toBeTruthy()
  })

  it('says nothing at all while it is still working', () => {
    const { container } = render(<AutoRefresh />)
    advance(60_000)
    expect(container.textContent).toBe('')
  })

  it('resumes polling when the shopper asks it to', () => {
    render(<AutoRefresh />)
    advance(120_000)
    const atBudget = refresh.mock.calls.length

    act(() => {
      screen.getByRole('button', { name: 'בדקו שוב' }).click()
    })
    // The press itself is a check, so it does not cost the shopper three
    // seconds of waiting to find out.
    expect(refresh).toHaveBeenCalledTimes(atBudget + 1)

    advance(6000)
    expect(refresh.mock.calls.length).toBeGreaterThan(atBudget + 1)
  })

  it('clears the interval on unmount', () => {
    // The half that was already right, and the one that matters most: the
    // component unmounts the instant the status turns `paid`, because the
    // pending branch stops being rendered.
    const { unmount } = render(<AutoRefresh />)
    advance(3000)
    expect(refresh).toHaveBeenCalledTimes(1)

    unmount()
    advance(30_000)
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
