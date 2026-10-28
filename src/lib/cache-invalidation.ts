import { purgeCacheForResource } from './cache'

interface CacheInvalidationEvent {
  resource: 'product' | 'category' | 'order' | 'coupon' | 'supplier'
  id: string | number
  reason: string
}

const invalidationQueue: CacheInvalidationEvent[] = []

function invalidateOnChange(event: CacheInvalidationEvent): void {
  invalidationQueue.push(event)
  processQueue()
}

async function processQueue(): Promise<void> {
  while (invalidationQueue.length > 0) {
    const event = invalidationQueue.shift()
    if (!event) break

    try {
      await purgeCacheForResource(event.resource, event.id)
    } catch {
      // Cache invalidation failure should not block request handling
    }
  }
}

export async function invalidateProductCache(productId: string | number): Promise<void> {
  invalidateOnChange({
    resource: 'product',
    id: productId,
    reason: 'product data changed',
  })
}

export async function invalidateCategoryCache(categoryId: string | number): Promise<void> {
  invalidateOnChange({
    resource: 'category',
    id: categoryId,
    reason: 'category data changed',
  })
}

export async function invalidateCouponCache(couponId: string | number): Promise<void> {
  invalidateOnChange({
    resource: 'coupon',
    id: couponId,
    reason: 'coupon issued or status changed',
  })
}

export async function invalidateOrderCache(orderId: string | number): Promise<void> {
  invalidateOnChange({
    resource: 'order',
    id: orderId,
    reason: 'order status changed',
  })
}

export async function invalidateSupplierCache(supplierId: string | number): Promise<void> {
  invalidateOnChange({
    resource: 'supplier',
    id: supplierId,
    reason: 'supplier profile changed',
  })
}
