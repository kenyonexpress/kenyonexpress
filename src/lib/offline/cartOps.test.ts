import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createOfflineCartOps } from './cartOps'
import { initOfflineDB } from './db'

describe('Offline Cart Operations', () => {
  let db: Awaited<ReturnType<typeof initOfflineDB>>
  let cartOps: ReturnType<typeof createOfflineCartOps>

  beforeEach(async () => {
    db = await initOfflineDB()
    await db.clear()
    cartOps = createOfflineCartOps(db)
  })

  afterEach(async () => {
    await db.clear()
    db.close()
  })

  describe('Add to cart', () => {
    it('adds item to offline cart', async () => {
      await cartOps.addToOfflineCart('1', 'product-1', 2, 50000)

      const items = await cartOps.getOfflineCartItems()
      expect(items).toHaveLength(1)
      expect(items[0]).toBeDefined()
      expect(items[0]?.product_id).toBe('1')
      expect(items[0]?.quantity).toBe(2)
    })

    it('queues sync item when adding to cart', async () => {
      await cartOps.addToOfflineCart('1', 'product-1', 2, 50000)

      const queue = await db.getSyncQueue()
      expect(queue).toHaveLength(1)
      expect(queue[0]).toBeDefined()
      expect(queue[0]?.action).toBe('add_to_cart')
    })

    it('increments quantity when adding duplicate product', async () => {
      await cartOps.addToOfflineCart('1', 'product-1', 2, 50000)
      await cartOps.addToOfflineCart('1', 'product-1', 3, 50000)

      const items = await cartOps.getOfflineCartItems()
      expect(items).toHaveLength(1)
      expect(items[0]?.quantity).toBe(5)
    })
  })

  describe('Remove from cart', () => {
    it('removes item from offline cart', async () => {
      await cartOps.addToOfflineCart('1', 'product-1', 2, 50000)
      await cartOps.removeFromOfflineCart('1')

      const items = await cartOps.getOfflineCartItems()
      expect(items).toHaveLength(0)
    })

    it('queues sync item when removing from cart', async () => {
      await cartOps.addToOfflineCart('1', 'product-1', 2, 50000)
      await db.clearSyncQueue()

      await cartOps.removeFromOfflineCart('1')

      const queue = await db.getSyncQueue()
      expect(queue).toHaveLength(1)
      expect(queue[0]).toBeDefined()
      expect(queue[0]?.action).toBe('remove_from_cart')
    })
  })

  describe('Update cart quantity', () => {
    it('updates item quantity in offline cart', async () => {
      await cartOps.addToOfflineCart('1', 'product-1', 2, 50000)
      await cartOps.updateOfflineCartQuantity('1', 5)

      const items = await cartOps.getOfflineCartItems()
      expect(items[0]?.quantity).toBe(5)
    })

    it('queues sync item when updating quantity', async () => {
      await cartOps.addToOfflineCart('1', 'product-1', 2, 50000)
      await db.clearSyncQueue()

      await cartOps.updateOfflineCartQuantity('1', 5)

      const queue = await db.getSyncQueue()
      expect(queue).toHaveLength(1)
      expect(queue[0]).toBeDefined()
      expect(queue[0]?.action).toBe('update_quantity')
    })
  })

  describe('Clear offline cart', () => {
    it('clears all items from offline cart', async () => {
      await cartOps.addToOfflineCart('1', 'product-1', 2, 50000)
      await cartOps.addToOfflineCart('2', 'product-2', 3, 75000)

      await cartOps.clearOfflineCart()

      const items = await cartOps.getOfflineCartItems()
      expect(items).toHaveLength(0)
    })
  })

  describe('Queue cart sync', () => {
    it('queues add action', async () => {
      const id = await cartOps.queueCartSync('add', { product_id: '1', quantity: 2 })

      expect(id).toBeDefined()
      const queue = await db.getSyncQueue()
      expect(queue[0]?.action).toBe('add_to_cart')
    })

    it('queues remove action', async () => {
      const id = await cartOps.queueCartSync('remove', { product_id: '1' })

      expect(id).toBeDefined()
      const queue = await db.getSyncQueue()
      expect(queue[0]?.action).toBe('remove_from_cart')
    })

    it('queues update action', async () => {
      const id = await cartOps.queueCartSync('update', { product_id: '1', quantity: 5 })

      expect(id).toBeDefined()
      const queue = await db.getSyncQueue()
      expect(queue[0]?.action).toBe('update_quantity')
    })
  })
})
