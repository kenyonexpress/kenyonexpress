import { productQuantityCeiling } from '@/lib/cart/format'
import { CART_LINE_MAX_QUANTITY } from '@/lib/cart/types'
import { addToCartSchema } from '@/lib/validations/cart'
import { describe, expect, it } from 'vitest'

/**
 * THE PRODUCT PAGE'S STEPPER WENT TO 100 AGAINST A SCHEMA THAT STOPS AT 99.
 *
 * `CART_LINE_MAX_QUANTITY` names the cap precisely so this cannot happen, and
 * the comment on it says why in as many words: "a stepper that goes to 100
 * against a schema that stops at 99 is a button whose only outcome is a
 * validation toast." The cart page and the drawer were unified behind
 * `lineQuantityCeiling` for that reason. The PRODUCT page was not - it wrote
 * `stock > 0 ? stock : 99` and handed the raw shelf count straight to `max`.
 *
 * MEASURED on a built server, /product/demo-coupon-1: `max="100"`. That is a
 * real product in this catalogue, not a fixture. Type 100, press "קנה עכשיו",
 * and `addToCartSchema` answers "כמות מקסימלית: 99" - the one number the
 * shopper was told they could have.
 *
 * The two ceilings are different questions and both are answered here: the
 * shelf caps what exists, the schema caps what one line may hold, and the
 * stepper takes the smaller.
 */

describe('productQuantityCeiling', () => {
  it('does not exceed the schema, which is what the measured bug was', () => {
    // demo-coupon-1's real stock level.
    expect(productQuantityCeiling(100)).toBe(99)
    expect(productQuantityCeiling(5000)).toBe(99)
  })

  it('stops at the shelf when the shelf is the smaller number', () => {
    expect(productQuantityCeiling(3)).toBe(3)
    expect(productQuantityCeiling(99)).toBe(99)
  })

  it('falls back to the schema cap when the catalogue tracks no stock', () => {
    // Null means untracked, not empty. Most of the catalogue is untracked.
    expect(productQuantityCeiling(null)).toBe(CART_LINE_MAX_QUANTITY)
    expect(productQuantityCeiling(undefined)).toBe(CART_LINE_MAX_QUANTITY)
  })

  it('never returns something the shopper cannot type', () => {
    // Zero stock disables the whole buy row, but a `max="0"` on a `min="1"`
    // input is a contradiction the browser resolves by ignoring one of them.
    expect(productQuantityCeiling(0)).toBe(CART_LINE_MAX_QUANTITY)
    expect(productQuantityCeiling(-3)).toBe(CART_LINE_MAX_QUANTITY)
  })

  it('agrees with the schema for every ceiling it can produce', () => {
    // The point of the whole module: the number the stepper offers is a number
    // the write accepts. Checked against the real schema, not a copy of 99.
    for (const stock of [null, 0, 1, 3, 98, 99, 100, 1000]) {
      const ceiling = productQuantityCeiling(stock)
      const parsed = addToCartSchema.safeParse({
        product_id: '11111111-1111-4111-8111-111111111111',
        variant_id: null,
        quantity: ceiling,
      })
      expect(parsed.success, `stock ${stock} -> ${ceiling}`).toBe(true)
    }
  })
})
