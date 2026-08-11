import { productTypeBadge } from '@/components/admin/StatusBadge'
import { describe, expect, it } from 'vitest'

/**
 * The products table rendered its type column as
 * `type === 'physical' ? 'פיזי' : 'קופון'`, a binary on a column that is not
 * binary. `products.type` holds `coupon`, `physical` and `service` today, and
 * `recurring` once PENDING-109 is applied.
 *
 * The visible consequence was that a `service` row displayed as "קופון" in the
 * admin list, which is the one label that carries a money meaning: a coupon is
 * prepaid and issues a voucher. Nothing failed, because no test existed.
 */
describe('productTypeBadge', () => {
  it('labels every value the live enum can hold', () => {
    expect(productTypeBadge('coupon').label).toBe('קופון')
    expect(productTypeBadge('physical').label).toBe('פיזי')
    expect(productTypeBadge('service').label).toBe('שירות')
  })

  it('never calls a non-coupon type a coupon', () => {
    // The exact regression: anything that is not `physical` used to read "קופון".
    for (const type of ['service', 'recurring', 'whatever']) {
      expect(productTypeBadge(type).label).not.toBe('קופון')
    }
  })

  it('labels recurring ahead of PENDING-109 so the column is ready', () => {
    expect(productTypeBadge('recurring').label).toBe('מנוי')
  })

  it('prints an unknown value verbatim instead of guessing', () => {
    // Same contract as productStatusBadge/orderStatusBadge in this module.
    expect(productTypeBadge('bundle')).toEqual({ label: 'bundle', variant: 'gray' })
  })
})
