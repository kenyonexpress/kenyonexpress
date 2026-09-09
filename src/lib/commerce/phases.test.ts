import { isTypeSellable } from '@/lib/commerce/phases'
import { describe, expect, it } from 'vitest'

/**
 * `isTypeSellable` decides whether a product appears in the catalogue, so its
 * two defaults are the whole of [89]'s risk. Both point the same way: when in
 * doubt, LIST it, because an empty shop is indistinguishable from a shop with
 * nothing to sell and produces no error anywhere.
 *
 * The purchase path does not share that default. `assertTypeSellable` reads
 * live and refuses on failure, because refusing one add to cart is cheap and
 * selling something the operator withdrew is not.
 */
describe('isTypeSellable', () => {
  it('lists a type that is enabled', () => {
    expect(isTypeSellable('physical', ['coupon', 'physical'])).toBe(true)
  })

  it('hides a type that is not', () => {
    expect(isTypeSellable('recurring', ['coupon', 'physical'])).toBe(false)
  })

  it('lists EVERYTHING when the config could not be read', () => {
    // `null` is "no opinion", not "nothing is sellable". Measured context: all
    // 44 active products are `physical`, so a failed read that filtered to
    // nothing would empty the shop, silently, for a whole cache period.
    expect(isTypeSellable('physical', null)).toBe(true)
    expect(isTypeSellable('anything', null)).toBe(true)
  })

  it('hides everything when the config says nothing is enabled', () => {
    // An empty ARRAY is a real answer and is honoured. Only `null` is not.
    expect(isTypeSellable('physical', [])).toBe(false)
  })

  it('hides a type with no row, because nobody approved it', () => {
    // The one place this does NOT fail open. 210 seeds a row per enum value and
    // 91/92 seed their new types DISABLED before the enum has them, so a type
    // with no row is one nobody has approved. Listing it would put a new
    // product type on sale the moment somebody added it to the enum - the
    // opposite failure from an empty shop, and a worse one.
    expect(isTypeSellable('cabin', ['coupon', 'physical'])).toBe(false)
  })

  it('lists a product with no type at all rather than hiding it', () => {
    expect(isTypeSellable(null, ['coupon'])).toBe(true)
    expect(isTypeSellable(undefined, [])).toBe(true)
  })
})
