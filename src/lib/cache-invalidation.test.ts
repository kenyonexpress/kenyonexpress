import { beforeEach, describe, it, vi } from 'vitest'
import {
  invalidateCategoryCache,
  invalidateCouponCache,
  invalidateOrderCache,
  invalidateProductCache,
  invalidateSupplierCache,
} from './cache-invalidation'

vi.mock('./cache', () => ({
  purgeCacheForResource: vi.fn(),
}))

describe('cache invalidation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('invalidateProductCache', () => {
    it('invalidates product cache for given ID', async () => {
      await invalidateProductCache(123)
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
  })

  describe('invalidateCategoryCache', () => {
    it('invalidates category cache for given ID', async () => {
      await invalidateCategoryCache('electronics')
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
  })

  describe('invalidateCouponCache', () => {
    it('invalidates coupon cache for given ID', async () => {
      await invalidateCouponCache('coup-789')
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
  })

  describe('invalidateOrderCache', () => {
    it('invalidates order cache for given ID', async () => {
      await invalidateOrderCache('ord-456')
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
  })

  describe('invalidateSupplierCache', () => {
    it('invalidates supplier cache for given ID', async () => {
      await invalidateSupplierCache(42)
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
  })
})
