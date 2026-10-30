import { describe, expect, it } from 'vitest'
import { wpLegacyTarget } from './wp-legacy'

describe('wpLegacyTarget', () => {
  it('maps Woo category archives to /category/<leaf>', () => {
    expect(wpLegacyTarget('/product-category/home/')).toBe('/category/home')
    expect(wpLegacyTarget('/product-category/a/b/')).toBe('/category/b')
  })
  it('maps fixed WordPress pages', () => {
    expect(wpLegacyTarget('/shop/')).toBe('/products')
    expect(wpLegacyTarget('/my-account')).toBe('/account')
    expect(wpLegacyTarget('/contact-us/')).toBe('/contact')
  })
  it('maps old policy and cart slugs', () => {
    expect(wpLegacyTarget('/terms-and-conditions/')).toBe('/terms')
    expect(wpLegacyTarget('/cart-2')).toBe('/cart')
  })
  it('leaves current routes alone', () => {
    expect(wpLegacyTarget('/product/some-slug')).toBeNull()
    expect(wpLegacyTarget('/category/home')).toBeNull()
    expect(wpLegacyTarget('/product-category/')).toBeNull()
  })
})
