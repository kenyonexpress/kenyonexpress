import { agorot, formatAgorot } from '@/lib/money'
import type { OrderSummary } from '@/server/queries/orders'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/server/actions/payments/reorder', () => ({ reorderOneClick: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import OrderCard from './OrderCard'

/**
 * UX19: the order card. An article named by its order number, status chips
 * in a labelled group, a product preview and the total in the collapsed
 * state, a toggle with aria-expanded / aria-controls that opens the lines
 * in place (no fetch), a reorder button on a paid order only, and the link
 * to the full page.
 */
function order(over: Partial<OrderSummary> = {}): OrderSummary {
  return {
    id: 'a1b2c3d4-0000-4000-8000-000000000000',
    status: 'paid',
    settlementStatus: 'split_executed',
    createdAt: '2026-10-05T10:00:00Z',
    paidAt: '2026-10-05T10:01:00Z',
    totalAgorot: agorot(12000),
    itemCount: 3,
    hasVouchers: true,
    shipping: {
      kind: 'shipped',
      label: 'נשלח',
      tone: 'warn',
      tracked: [{ carrier: 'israel_post', trackingNumber: 'RR123456789IL' }],
    },
    lines: [
      {
        id: 'l1',
        productId: 'p1',
        productName: 'קופון למסעדה',
        productSlug: 'restaurant-coupon',
        productImage: 'https://img.example/coupon.jpg',
        productType: 'coupon',
        quantity: 2,
        unitPriceAgorot: agorot(4000),
        totalAgorot: agorot(8000),
        settlementStatus: 'split_executed',
        itemStatus: 'pending',
        carrier: null,
        trackingNumber: null,
      },
      {
        id: 'l2',
        productId: 'p2',
        productName: 'מכונת קפה',
        productSlug: null,
        productImage: null,
        productType: 'physical',
        quantity: 1,
        unitPriceAgorot: agorot(4000),
        totalAgorot: agorot(4000),
        settlementStatus: 'split_executed',
        itemStatus: 'shipped',
        carrier: 'israel_post',
        trackingNumber: 'RR123456789IL',
      },
    ],
    ...over,
  }
}

const offer = { card: null, cartItemCount: 0 }

describe('OrderCard', () => {
  it('is an article named by the order number, with the date and both chips', () => {
    render(<OrderCard order={order()} reorder={offer} paymentGateOpen={true} />)
    const card = screen.getByRole('article', { name: /הזמנה [#]A1B2C3D4/ })
    expect(card.querySelector('time')?.getAttribute('datetime')).toBe('2026-10-05T10:00:00Z')
    const badges = within(card).getByRole('list', { name: 'סטטוס ההזמנה' })
    expect([...badges.querySelectorAll('.account-chip')].map((c) => c.textContent)).toEqual([
      'הושלמה',
      'נשלח',
    ])
  })

  it('previews the lines and the total while collapsed', () => {
    render(<OrderCard order={order()} reorder={offer} paymentGateOpen={true} />)
    expect(screen.getByText('קופון למסעדה ×2, מכונת קפה')).toBeTruthy()
    expect(screen.getByText('3 פריטים · כולל קופונים')).toBeTruthy()
    expect(document.querySelector('.order-card__total-value')?.textContent).toBe(
      formatAgorot(agorot(12000)),
    )
  })

  it('opens the lines in place through aria-expanded and aria-controls', () => {
    render(<OrderCard order={order()} reorder={offer} paymentGateOpen={true} />)
    const toggle = screen.getByRole('button', { name: 'הצגת הפריטים (2)' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    const panel = document.getElementById(toggle.getAttribute('aria-controls') as string)
    expect(panel).toBeTruthy()
    expect((panel as HTMLElement).hidden).toBe(true)

    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(toggle.textContent).toBe('הסתרת הפריטים')
    expect((panel as HTMLElement).hidden).toBe(false)

    const lines = (panel as HTMLElement).querySelectorAll('.order-card__line')
    expect(lines).toHaveLength(2)
    // The coupon line links to its product and says count × unit price.
    expect(
      within(lines[0] as HTMLElement)
        .getByRole('link', { name: 'קופון למסעדה' })
        .getAttribute('href'),
    ).toBe('/product/restaurant-coupon')
    expect(lines[0]?.querySelector('.order-card__line-meta')?.textContent).toBe(
      `2 × ${formatAgorot(agorot(4000))} · קופון`,
    )
    expect(lines[0]?.querySelector('.order-card__line-total')?.textContent).toBe(
      formatAgorot(agorot(8000)),
    )
    // An open coupon carries no chip; the shipped parcel does.
    expect(lines[0]?.querySelector('.account-chip')).toBeNull()
    expect(lines[1]?.querySelector('.account-chip')?.textContent).toBe('נשלח')
    // A line without a slug is plain text.
    expect(within(lines[1] as HTMLElement).queryByRole('link')).toBeNull()
    // Tracking is inside the panel, LTR.
    const tracking = within(panel as HTMLElement).getByText('RR123456789IL')
    expect(tracking.getAttribute('dir')).toBe('ltr')

    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect((panel as HTMLElement).hidden).toBe(true)
  })

  it('offers "order again" on a paid order and links to the full page', () => {
    render(<OrderCard order={order()} reorder={offer} paymentGateOpen={true} />)
    expect(screen.getByRole('button', { name: 'להזמין שוב' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'לעמוד ההזמנה' }).getAttribute('href')).toBe(
      '/account/orders/a1b2c3d4-0000-4000-8000-000000000000',
    )
  })

  it('does not offer "order again" on an unpaid order or without an offer', () => {
    const { unmount } = render(
      <OrderCard
        order={order({ paidAt: null, settlementStatus: 'pending' })}
        reorder={offer}
        paymentGateOpen={true}
      />,
    )
    expect(screen.queryByRole('button', { name: /להזמין שוב|הזמנה חוזרת/ })).toBeNull()
    expect(screen.getByText('ממתינה לתשלום')).toBeTruthy()
    // No parcel chip on an unpaid order even if a line is marked shipped.
    expect(screen.queryByText('נשלח', { selector: '.order-card__badges .account-chip' })).toBeNull()
    unmount()

    render(<OrderCard order={order()} reorder={null} paymentGateOpen={true} />)
    expect(screen.queryByRole('button', { name: /להזמין שוב|הזמנה חוזרת/ })).toBeNull()
  })

  it('shows the thumbnail strip only for lines with a picture, hidden from readers', () => {
    render(<OrderCard order={order()} reorder={offer} paymentGateOpen={true} />)
    const strip = document.querySelector('.order-card__thumbs')
    expect(strip?.getAttribute('aria-hidden')).toBe('true')
    expect(strip?.querySelectorAll('.order-card__thumb')).toHaveLength(1)
  })
})
