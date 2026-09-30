import { describe, expect, it } from 'vitest'
import {
  REORDER_MAX_LINE_QUANTITY,
  type ReorderCardCandidate,
  describeCartReplacement,
  describeReorderCard,
  describeSkippedLines,
  pickReorderCard,
  planReorderLines,
} from './reorder'

/**
 * The two decisions a one-click reorder makes without asking: which saved
 * card, and which cart lines. Both must be boring and both must never pick
 * something the checkout would refuse a moment later.
 */

const NOW = new Date('2026-10-01T12:00:00Z')

function card(overrides: Partial<ReorderCardCandidate> = {}): ReorderCardCandidate {
  return {
    id: 'tok-1',
    last4: '1234',
    cardBrand: 'Visa',
    expiryMonth: 12,
    expiryYear: 2028,
    isDefault: false,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('pickReorderCard', () => {
  it('prefers the default card when it is in date', () => {
    const chosen = pickReorderCard(
      [
        card({ id: 'newer', createdAt: '2026-09-01T00:00:00Z' }),
        card({ id: 'default', isDefault: true, createdAt: '2025-01-01T00:00:00Z' }),
      ],
      NOW,
    )
    expect(chosen?.id).toBe('default')
  })

  it('falls back to the newest live card when the default has expired', () => {
    const chosen = pickReorderCard(
      [
        card({ id: 'default', isDefault: true, expiryMonth: 8, expiryYear: 2026 }),
        card({ id: 'old', createdAt: '2025-06-01T00:00:00Z' }),
        card({ id: 'newest', createdAt: '2026-09-15T00:00:00Z' }),
      ],
      NOW,
    )
    expect(chosen?.id).toBe('newest')
  })

  it('treats a card valid through the current month as live', () => {
    // 10/26 is valid through 31 October; the classic off-by-one declines it.
    const chosen = pickReorderCard([card({ expiryMonth: 10, expiryYear: 26 })], NOW)
    expect(chosen?.id).toBe('tok-1')
  })

  it('returns null when every card has expired, or there are none', () => {
    expect(pickReorderCard([card({ expiryMonth: 9, expiryYear: 2026 })], NOW)).toBeNull()
    expect(pickReorderCard([], NOW)).toBeNull()
  })

  it('exposes only what the button needs, never the token', () => {
    const chosen = pickReorderCard([card()], NOW)
    expect(chosen).toEqual({ id: 'tok-1', last4: '1234', cardBrand: 'Visa' })
  })
})

describe('planReorderLines', () => {
  it('keeps product, variant and quantity per line', () => {
    const plan = planReorderLines([
      { product_id: 'p1', variant_id: null, quantity: 2 },
      { product_id: 'p2', variant_id: 'v1', quantity: 1 },
    ])
    expect(plan.lines).toEqual([
      { productId: 'p1', variantId: null, quantity: 2 },
      { productId: 'p2', variantId: 'v1', quantity: 1 },
    ])
    expect(plan.droppedWithoutProduct).toBe(0)
  })

  it('merges two lines of the same product and variant into one cart line', () => {
    const plan = planReorderLines([
      { product_id: 'p1', variant_id: 'v1', quantity: 2 },
      { product_id: 'p1', variant_id: 'v1', quantity: 3 },
      { product_id: 'p1', variant_id: null, quantity: 1 },
    ])
    expect(plan.lines).toEqual([
      { productId: 'p1', variantId: 'v1', quantity: 5 },
      { productId: 'p1', variantId: null, quantity: 1 },
    ])
  })

  it('clamps to the cart ceiling instead of refusing a bulk order', () => {
    const plan = planReorderLines([{ product_id: 'p1', variant_id: null, quantity: 120 }])
    expect(plan.lines[0]?.quantity).toBe(REORDER_MAX_LINE_QUANTITY)
  })

  it('reads a nonsense quantity as one, since the line was bought once', () => {
    const plan = planReorderLines([
      { product_id: 'p1', variant_id: null, quantity: 0 },
      { product_id: 'p2', variant_id: null, quantity: null },
      { product_id: 'p3', variant_id: null, quantity: 2.5 },
    ])
    expect(plan.lines.map((line) => line.quantity)).toEqual([1, 1, 1])
  })

  it('drops and counts a line whose product row is gone', () => {
    const plan = planReorderLines([
      { product_id: null, variant_id: null, quantity: 1 },
      { product_id: 'p1', variant_id: null, quantity: 1 },
    ])
    expect(plan.lines).toHaveLength(1)
    expect(plan.droppedWithoutProduct).toBe(1)
  })
})

describe('wording', () => {
  it('names the card by brand and last four, and copes with either missing', () => {
    expect(describeReorderCard({ id: 't', last4: '1234', cardBrand: 'Visa' })).toBe(
      'החיוב יבוצע בכרטיס Visa •••• 1234',
    )
    expect(describeReorderCard({ id: 't', last4: '1234', cardBrand: null })).toBe(
      'החיוב יבוצע בכרטיס •••• 1234',
    )
    expect(describeReorderCard({ id: 't', last4: null, cardBrand: null })).toBe(
      'החיוב יבוצע בכרטיס השמור',
    )
  })

  it('warns about the cart only when there is something in it', () => {
    expect(describeCartReplacement(0)).toBeNull()
    expect(describeCartReplacement(1)).toBe('הפריט שבעגלה כעת יוחלף בפריטי ההזמנה')
    expect(describeCartReplacement(3)).toBe('3 הפריטים שבעגלה כעת יוחלפו בפריטי ההזמנה')
  })

  it('lists at most three skipped names and counts the rest', () => {
    expect(describeSkippedLines([])).toBeNull()
    expect(describeSkippedLines(['א', 'ב'])).toBe('לא ניתן היה להוסיף: א, ב')
    expect(describeSkippedLines(['א', 'ב', 'ג', 'ד', 'ה'])).toBe(
      'לא ניתן היה להוסיף: א, ב, ג ועוד 2',
    )
  })
})
