import { lineQuantityCeiling, unavailableMessage } from '@/lib/cart/format'
import type { CartViewItem } from '@/lib/cart/types'
import { agorot } from '@/lib/money'
import { describe, expect, it } from 'vitest'

/**
 * The four unavailability reasons, as sentences a shopper can act on.
 *
 * A cart line used to answer all four with "המוצר אינו זמין — הסירו מהעגלה לפני
 * התשלום". For a line that is merely short of stock that advice is wrong: the
 * item does not need removing, the quantity needs lowering, and the number to
 * lower it to was already known server-side and thrown away.
 *
 * The function is tested on its own rather than through a render because it is
 * the whole of the decision, and because `CartLineItem` reaches
 * `@/server/actions/cart` through `useCart`: importing the component here does
 * not fail an assertion, it fails to transform. That is why the function sits
 * in `format.ts`.
 */
function item(overrides: Partial<CartViewItem> = {}): CartViewItem {
  return {
    product_id: 'p1',
    variant_id: null,
    quantity: 2,
    name_he: 'מוצר',
    slug: 'p1',
    image_url: null,
    unit_price: agorot(10_000),
    line_total: agorot(20_000),
    type: 'physical',
    available: true,
    platform_fee: agorot(1_000),
    supplier_due: agorot(9_000),
    customer_pays_now: agorot(10_000),
    balance_due_at_business: agorot(0),
    platform_percent_bp: 1_000,
    platform_percent_snapshot: 10,
    coupon_price_unit: null,
    max_quantity: null,
    unavailable_reason: null,
    ...overrides,
  }
}

describe('unavailableMessage', () => {
  it('says nothing about a line that is fine', () => {
    expect(unavailableMessage(item())).toBeNull()
  })

  it('tells a shopper short of stock how many are left, and to reduce rather than remove', () => {
    const message = unavailableMessage(
      item({ available: false, unavailable_reason: 'insufficient_stock', max_quantity: 3 }),
    )

    expect(message).toContain('3')
    expect(message).toContain('הפחיתו את הכמות')
    // The one reason whose fix is NOT removal.
    expect(message).not.toContain('הסירו')
  })

  it('falls back to a truthful vaguer sentence when the ceiling is unknown', () => {
    // Reachable only if a reason and a ceiling ever disagree; it must still not
    // print "נותרו null במלאי".
    const message = unavailableMessage(
      item({ available: false, unavailable_reason: 'insufficient_stock', max_quantity: null }),
    )

    expect(message).toBe('המוצר אינו זמין בכמות המבוקשת')
  })

  it('separates a delisted product from an empty shelf', () => {
    const delisted = unavailableMessage(item({ available: false, unavailable_reason: 'delisted' }))
    const empty = unavailableMessage(
      item({ available: false, unavailable_reason: 'out_of_stock', max_quantity: 0 }),
    )

    expect(delisted).toContain('כבר לא נמכר')
    expect(empty).toContain('אזל מהמלאי')
    expect(delisted).not.toBe(empty)
  })

  it('does not confess the configuration gap behind an unpriced line', () => {
    const message = unavailableMessage(item({ available: false, unavailable_reason: 'unpriced' }))

    expect(message).toContain('הסירו מהעגלה')
    // `platform_percent` is an internal agreement a shopper can neither cause
    // nor cure, and naming it is a confession with no action attached.
    expect(message).not.toMatch(/עמלה|אחוז|percent/)
  })
})

describe('lineQuantityCeiling', () => {
  it('stops at the shelf when the catalogue tracks one', () => {
    expect(lineQuantityCeiling(item({ max_quantity: 3 }))).toBe(3)
  })

  it('falls back to the schema cap when no stock is tracked', () => {
    // `updateCartItemSchema` rejects above 99, so a stepper that ran higher
    // would be a button whose only outcome is a validation toast.
    expect(lineQuantityCeiling(item({ max_quantity: null }))).toBe(99)
  })

  it('never lets a deep shelf lift the line above the schema cap', () => {
    expect(lineQuantityCeiling(item({ max_quantity: 5_000 }))).toBe(99)
  })

  it('returns zero for an empty shelf rather than a usable ceiling', () => {
    // The stepper is disabled at this point anyway; what matters is that it
    // does not read as "no ceiling" and open back up to 99.
    expect(lineQuantityCeiling(item({ max_quantity: 0 }))).toBe(0)
  })
})
