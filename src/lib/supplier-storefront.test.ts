import { describe, expect, it } from 'vitest'
import { SUPPLIER_STOREFRONT_PRODUCT_COLUMNS, isSupplierId } from './supplier-storefront'

describe('isSupplierId', () => {
  it('accepts a v4 uuid and refuses everything else', () => {
    expect(isSupplierId('3f6b8c1e-0000-4000-8000-000000000000')).toBe(true)
    expect(isSupplierId('not-a-uuid')).toBe(false)
    expect(isSupplierId('../etc/passwd')).toBe(false)
    expect(isSupplierId('')).toBe(false)
  })
})

describe('SUPPLIER_STOREFRONT_PRODUCT_COLUMNS', () => {
  it('never selects a commission column', () => {
    expect(SUPPLIER_STOREFRONT_PRODUCT_COLUMNS).not.toMatch(/platform_percent/)
    expect(SUPPLIER_STOREFRONT_PRODUCT_COLUMNS).not.toMatch(/supplier_split/)
    expect(SUPPLIER_STOREFRONT_PRODUCT_COLUMNS).not.toMatch(/commission/)
  })
})
