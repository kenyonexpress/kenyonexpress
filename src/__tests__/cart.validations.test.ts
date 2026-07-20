import { addToCartSchema, updateCartItemSchema } from '@/lib/validations/cart'
import { describe, expect, it } from 'vitest'

const PRODUCT_ID = '550e8400-e29b-41d4-a716-446655440000'
const VARIANT_ID = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'

describe('addToCartSchema', () => {
  it('accepts product_id and default quantity', () => {
    const result = addToCartSchema.safeParse({ product_id: PRODUCT_ID })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.quantity).toBe(1)
      expect(result.data.variant_id).toBeNull()
    }
  })

  it('accepts variant_id and custom quantity', () => {
    const result = addToCartSchema.safeParse({
      product_id: PRODUCT_ID,
      variant_id: VARIANT_ID,
      quantity: 3,
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid product_id', () => {
    const result = addToCartSchema.safeParse({ product_id: 'not-a-uuid' })
    expect(result.success).toBe(false)
  })

  it('rejects quantity below 1', () => {
    const result = addToCartSchema.safeParse({ product_id: PRODUCT_ID, quantity: 0 })
    expect(result.success).toBe(false)
  })

  it('rejects quantity above 99', () => {
    const result = addToCartSchema.safeParse({ product_id: PRODUCT_ID, quantity: 100 })
    expect(result.success).toBe(false)
  })
})

describe('updateCartItemSchema', () => {
  it('accepts quantity 0 for removal', () => {
    const result = updateCartItemSchema.safeParse({
      product_id: PRODUCT_ID,
      variant_id: null,
      quantity: 0,
    })
    expect(result.success).toBe(true)
  })

  it('rejects negative quantity', () => {
    const result = updateCartItemSchema.safeParse({
      product_id: PRODUCT_ID,
      quantity: -1,
    })
    expect(result.success).toBe(false)
  })
})
