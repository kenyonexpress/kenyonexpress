import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CheckoutError from './error'

/**
 * THE ONE ERROR BOUNDARY WHERE "TRY AGAIN" CAN COST THE CUSTOMER MONEY.
 *
 * Until 2026-09-09 the only boundary under the root layout was
 * `src/app/error.tsx`, so a throw anywhere in checkout rendered the storefront
 * apology: a large primary "נסו שוב" button and a link to the home page. That
 * is right for a category listing and wrong here.
 *
 * By the time this file can render, the card may already have been charged.
 * Cardcom takes the payment on its own hosted page and returns the customer to
 * `/checkout/return`, where `reconcileOrderReturn` decides whether an order
 * exists. A throw during that render is a failure of OUR page and says nothing
 * about the payment. Putting a big retry button in front of somebody whose card
 * was just debited invites a second debit, and the refund for it comes out of a
 * Cardcom dashboard nobody on this machine can reach.
 *
 * So the assertions below are about ORDER and EMPHASIS, not about wording:
 *
 *   - "אל תשלמו שוב" must be present, and must come before the actions.
 *   - The primary action must lead to a page that can answer "was I charged".
 *   - `reset()` must NOT be the primary action.
 *
 * The last one is the regression that matters. A later refactor that unifies
 * this file with `SegmentErrorBoundary` "for consistency" would restore the
 * retry button and reintroduce exactly the defect, and it would look like a
 * tidy-up in review.
 */

const captureException = vi.fn()
const setTag = vi.fn()

vi.mock('@sentry/nextjs', () => ({
  withScope: (fn: (scope: { setTag: typeof setTag }) => void) => fn({ setTag }),
  captureException: (...args: unknown[]) => captureException(...args),
}))

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

function setUrl(search: string) {
  Object.defineProperty(window, 'location', {
    value: new URL(`https://kenyonexpress.co.il/checkout/return${search}`),
    writable: true,
  })
}

const error = Object.assign(new Error('boom'), { digest: 'abc123' })

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  setUrl('')
})

afterEach(() => {
  vi.restoreAllMocks()
  captureException.mockClear()
  setTag.mockClear()
})

describe('the checkout boundary tells the customer not to pay twice', () => {
  it('DOUBLE_CHARGE: warns before it offers any action', () => {
    render(<CheckoutError error={error} reset={vi.fn()} />)

    const warning = screen.getByText(/אל תשלמו שוב/)
    expect(warning).toBeTruthy()

    // Ordering, not just presence. A warning underneath the buttons is a
    // warning read after the click it was meant to prevent.
    const actions = screen.getByRole('link')
    expect(warning.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('NOT_A_RETRY_BUTTON: reset is not the primary action', () => {
    const reset = vi.fn()
    render(<CheckoutError error={error} reset={reset} />)

    // There is exactly one button and it is the demoted "reload" link, not a
    // call to action. The primary action is an anchor.
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0]?.textContent).toContain('לטעון מחדש')
    expect(buttons[0]?.textContent).not.toContain('נסו שוב')
  })
})

describe('where the primary action leads', () => {
  it('to the settlement re-check when the URL carries an order id', () => {
    // /checkout/return re-verifies against the terminal itself rather than
    // trusting anything this page rendered, so it is the only page that can
    // actually answer the question.
    setUrl('?order_id=ord_123')
    render(<CheckoutError error={error} reset={vi.fn()} />)

    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toBe('/checkout/return?order_id=ord_123')
    expect(link.textContent).toContain('בדיקת מצב ההזמנה')
  })

  it('to the order list when it does not, so the action is never dead', () => {
    render(<CheckoutError error={error} reset={vi.fn()} />)

    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toBe('/account/orders')
    expect(link.textContent).toContain('להזמנות שלי')
  })

  it('encodes the id rather than pasting it into the query', () => {
    setUrl('?order_id=a%26b%3Dc')
    render(<CheckoutError error={error} reset={vi.fn()} />)

    expect(screen.getByRole('link').getAttribute('href')).toBe(
      '/checkout/return?order_id=a%26b%3Dc',
    )
  })
})

describe('what triage gets', () => {
  it('tags the area, the digest, and whether an order was in play', () => {
    // `has_order_id` cannot be recovered after the customer navigates away, so
    // it has to be captured at throw time or not at all.
    setUrl('?order_id=ord_123')
    render(<CheckoutError error={error} reset={vi.fn()} />)

    expect(captureException).toHaveBeenCalledWith(error)
    expect(setTag).toHaveBeenCalledWith('boundary', 'checkout')
    expect(setTag).toHaveBeenCalledWith('digest', 'abc123')
    expect(setTag).toHaveBeenCalledWith('has_order_id', 'yes')
  })

  it('reports no as a value rather than omitting the tag', () => {
    render(<CheckoutError error={error} reset={vi.fn()} />)
    expect(setTag).toHaveBeenCalledWith('has_order_id', 'no')
  })

  it('shows the digest LTR, so support reads the same string Sentry has', () => {
    render(<CheckoutError error={error} reset={vi.fn()} />)
    const digest = screen.getByText('abc123')
    expect(digest.getAttribute('dir')).toBe('ltr')
  })
})
