import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/server/actions/payments/reorder', () => ({ reorderOneClick: vi.fn() }))

import ReorderButton from './ReorderButton'

/**
 * The button's promise must match what the click does: one click and a charge
 * when a card is on file, a cart and the checkout page when there is none.
 */

const CARD = { id: 'tok-1', last4: '4580', cardBrand: 'Visa' }

describe('<ReorderButton>', () => {
  it('offers one click, names the card, and states the terms when a card is saved', () => {
    const html = renderToStaticMarkup(
      <ReorderButton orderId="o1" card={CARD} cartItemCount={0} paymentGateOpen />,
    )
    expect(html).toContain('הזמנה חוזרת בלחיצה אחת')
    expect(html).toContain('account-btn--primary')
    expect(html).toContain('Visa •••• 4580')
    expect(html).toContain('בלחיצה אתם מאשרים את התקנון')
    expect(html).not.toContain('יוחלף')
  })

  it('says what happens to a cart that already has lines', () => {
    const html = renderToStaticMarkup(
      <ReorderButton orderId="o1" card={CARD} cartItemCount={2} paymentGateOpen />,
    )
    expect(html).toContain('2 הפריטים שבעגלה כעת יוחלפו')
  })

  it('degrades to a plain reorder when there is no card, without a charge promise', () => {
    const html = renderToStaticMarkup(
      <ReorderButton orderId="o1" card={null} cartItemCount={0} paymentGateOpen />,
    )
    expect(html).toContain('להזמין שוב')
    expect(html).not.toContain('בלחיצה אחת')
    expect(html).not.toContain('account-btn--primary')
    expect(html).toContain('תועברו לקופה')
  })

  it('renders the label only in the compact list variant', () => {
    const html = renderToStaticMarkup(
      <ReorderButton
        orderId="o1"
        card={CARD}
        cartItemCount={2}
        paymentGateOpen
        variant="compact"
      />,
    )
    expect(html).toContain('הזמנה חוזרת בלחיצה אחת')
    expect(html).not.toContain('החיוב יבוצע')
    expect(html).toContain('data-variant="compact"')
  })

  it('is disabled with a reason while the payment gate is closed', () => {
    const html = renderToStaticMarkup(
      <ReorderButton orderId="o1" card={CARD} cartItemCount={0} paymentGateOpen={false} />,
    )
    expect(html).toContain('disabled=""')
    expect(html).toContain('התשלום באתר מושבת כרגע')
  })
})
