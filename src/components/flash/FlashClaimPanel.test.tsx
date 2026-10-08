import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The sale page's panel (STEP 61). Pinned, one state at a time: a guest sees
 * the sign-in link with the return path and no button; a signed-in shopper
 * with no claim sees the claim button (and a quantity picker only when the
 * sale allows more than one); claiming calls the action and shows its line;
 * a hold shows its own clock and "לקופה", which adds the held quantity to
 * the cart and goes to the checkout; the waiting room shows how many are
 * ahead and offers to leave; a consumed claim says so.
 */

const mock = vi.hoisted(() => ({
  claim: vi.fn(),
  leave: vi.fn(),
  addToCart: vi.fn(),
  push: vi.fn(),
  fetch: vi.fn(),
}))

vi.mock('@/server/actions/flash-sales', () => ({
  claimFlashSale: (...args: unknown[]) => mock.claim(...args),
  leaveFlashSale: (...args: unknown[]) => mock.leave(...args),
}))
vi.mock('@/components/cart/CartProvider', () => ({
  useCart: () => ({ addToCart: mock.addToCart, isPending: false }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mock.push }) }))
vi.mock('@/components/flash/FlashCountdown', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/flash/FlashCountdown')>()
  return {
    ...actual,
    // The real clock is tested on its own; here the phase is handed straight
    // to the panel on mount so each state renders without a timer.
    default: ({
      startsAt,
      endsAt,
      onPhaseChange,
    }: {
      startsAt: string
      endsAt: string
      onPhaseChange?: (p: 'upcoming' | 'live' | 'ended') => void
    }) => {
      const phase = actual.phaseAt(startsAt, endsAt, Date.now())
      // biome-ignore lint/correctness/useExhaustiveDependencies: a test stub reporting once on mount
      React.useEffect(() => onPhaseChange?.(phase), [])
      return <output data-testid="countdown">{phase}</output>
    },
  }
})

import type { FlashStatus } from '@/lib/flash-sales/status'
import React from 'react'
import FlashClaimPanel from './FlashClaimPanel'

const SALE = '11111111-1111-4111-8111-111111111111'
const future = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString()

function status(claim: FlashStatus['claim'], remaining = 5): FlashStatus {
  return {
    phase: 'live' as const,
    remaining,
    allocation: 20,
    claim,
    starts_at: future(-10),
    ends_at: future(50),
    server_now: new Date().toISOString(),
  }
}

function panel(overrides: Partial<React.ComponentProps<typeof FlashClaimPanel>> = {}) {
  return render(
    <FlashClaimPanel
      saleId={SALE}
      productId="p1"
      productName="ספל"
      maxPerClaim={1}
      signedIn
      initialStatus={status(null)}
      startsAt={future(-10)}
      endsAt={future(50)}
      {...overrides}
    />,
  )
}

beforeEach(() => {
  mock.claim.mockReset()
  mock.leave.mockReset()
  mock.addToCart.mockReset()
  mock.push.mockReset()
  mock.fetch.mockReset()
  mock.fetch.mockResolvedValue({ ok: false })
  vi.stubGlobal('fetch', mock.fetch)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('FlashClaimPanel', () => {
  it('sends a guest to sign in with the return path and offers no button', () => {
    panel({ signedIn: false })
    const link = screen.getByRole('link', { name: 'התחברו כדי לתפוס יחידה' })
    expect(link).toHaveAttribute('href', `/login?next=${encodeURIComponent(`/flash/${SALE}`)}`)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('claims through the action and shows its line; the quantity picker appears only above one', async () => {
    mock.claim.mockResolvedValue({
      ok: true,
      outcome: 'held',
      message: 'תפסתם יחידה!',
      claim: null,
      remaining: 4,
    })
    panel()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByText('נותרו 5 מתוך 20 יחידות במחיר הבזק')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'תפסו יחידה במחיר הבזק' }))
    await waitFor(() => expect(mock.claim).toHaveBeenCalledWith(SALE, 1))
    await waitFor(() =>
      expect(screen.getByTestId('flash-message')).toHaveTextContent('תפסתם יחידה!'),
    )
  })

  it('lets the shopper pick a quantity up to the sale maximum and labels a full sale as the waiting room', async () => {
    mock.claim.mockResolvedValue({
      ok: true,
      outcome: 'queued',
      message: 'בתור',
      claim: null,
      remaining: 0,
    })
    panel({ maxPerClaim: 3, initialStatus: status(null, 0) })
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.options.length).toBe(3)
    fireEvent.change(select, { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'להיכנס לחדר ההמתנה' }))
    await waitFor(() => expect(mock.claim).toHaveBeenCalledWith(SALE, 2))
  })

  it('shows a hold with its clock and sends the held quantity to the cart and on to the checkout', async () => {
    mock.addToCart.mockResolvedValue(true)
    panel({
      initialStatus: status({
        status: 'held',
        quantity: 2,
        position: null,
        ahead: null,
        expires_at: future(8),
        order_id: null,
      }),
    })
    expect(screen.getByTestId('flash-hold')).toHaveTextContent('2 יחידות שמורות לכם')
    expect(screen.getByText('השלימו את הרכישה בתוך')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'לקופה' }))
    await waitFor(() => expect(mock.addToCart).toHaveBeenCalledWith('p1', null, 2, 'ספל'))
    await waitFor(() => expect(mock.push).toHaveBeenCalledWith('/checkout'))
  })

  it('does not navigate when the cart refused the line', async () => {
    mock.addToCart.mockResolvedValue(false)
    panel({
      initialStatus: status({
        status: 'held',
        quantity: 1,
        position: null,
        ahead: null,
        expires_at: future(8),
        order_id: null,
      }),
    })
    fireEvent.click(screen.getByRole('button', { name: 'לקופה' }))
    await waitFor(() => expect(mock.addToCart).toHaveBeenCalled())
    expect(mock.push).not.toHaveBeenCalled()
  })

  it('shows the waiting room with the count ahead and lets the shopper leave', async () => {
    mock.leave.mockResolvedValue({ ok: true, message: 'יצאתם מהמבצע.' })
    panel({
      initialStatus: status(
        { status: 'queued', quantity: 1, position: 7, ahead: 3, expires_at: null, order_id: null },
        0,
      ),
    })
    expect(screen.getByTestId('flash-waiting-room')).toHaveTextContent('לפניכם בתור: 3')
    fireEvent.click(screen.getByRole('button', { name: 'יוצאים מהתור' }))
    await waitFor(() => expect(mock.leave).toHaveBeenCalledWith(SALE))
    await waitFor(() =>
      expect(screen.getByTestId('flash-message')).toHaveTextContent('יצאתם מהמבצע.'),
    )
  })

  it('tells the next in line they are next, and a buyer that they already bought', () => {
    panel({
      initialStatus: status({
        status: 'queued',
        quantity: 1,
        position: 2,
        ahead: 0,
        expires_at: null,
        order_id: null,
      }),
    })
    expect(screen.getByText(/אתם הבאים בתור/)).toBeInTheDocument()

    panel({
      initialStatus: status({
        status: 'consumed',
        quantity: 1,
        position: null,
        ahead: null,
        expires_at: null,
        order_id: 'o1',
      }),
    })
    expect(screen.getByText(/כבר רכשתם/)).toBeInTheDocument()
  })

  it('refreshes from the status route and renders what it answers', async () => {
    const held = status({
      status: 'held',
      quantity: 1,
      position: null,
      ahead: null,
      expires_at: future(8),
      order_id: null,
    })
    mock.fetch.mockResolvedValue({ ok: true, json: async () => held })
    mock.claim.mockResolvedValue({
      ok: true,
      outcome: 'held',
      message: 'x',
      claim: null,
      remaining: 4,
    })
    panel()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'תפסו יחידה במחיר הבזק' }))
    })
    await waitFor(() => expect(screen.getByTestId('flash-hold')).toBeInTheDocument())
    expect(mock.fetch).toHaveBeenCalledWith(
      `/api/flash-sales/${SALE}/status`,
      expect.objectContaining({ cache: 'no-store' }),
    )
  })
})
