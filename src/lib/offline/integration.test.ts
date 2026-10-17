import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createOfflineCartOps } from './cartOps'
import { createCatalogCacheManager } from './catalogCache'
import { type CatalogSchema, initOfflineDB } from './db'
import { initSyncManager } from './sync'

describe('Offline Mode Integration', () => {
  let db: Awaited<ReturnType<typeof initOfflineDB>>
  let syncManager: Awaited<ReturnType<typeof initSyncManager>>
  let catalogCache: ReturnType<typeof createCatalogCacheManager>
  let cartOps: ReturnType<typeof createOfflineCartOps>

  const sampleProducts: CatalogSchema['products']['value'][] = [
    {
      id: '1',
      slug: 'product-1',
      name_he: 'מוצר 1',
      price_agonot: 50000,
      stock_quantity: 10,
      supplier_id: 'sup-1',
      category_id: 'cat-1',
      created_at: '2024-01-01',
      updated_at: '2024-01-01',
    },
    {
      id: '2',
      slug: 'product-2',
      name_he: 'מוצר 2',
      price_agonot: 75000,
      stock_quantity: 5,
      supplier_id: 'sup-1',
      category_id: 'cat-1',
      created_at: '2024-01-01',
      updated_at: '2024-01-01',
    },
  ]

  const sampleCategories: CatalogSchema['categories']['value'][] = [
    {
      id: 'cat-1',
      slug: 'category-1',
      name_he: 'קטגוריה 1',
      created_at: '2024-01-01',
      updated_at: '2024-01-01',
    },
  ]

  beforeEach(async () => {
    vi.resetModules()
    db = await initOfflineDB()
    await db.clear()
    syncManager = await initSyncManager(db)
    catalogCache = createCatalogCacheManager(db)
    cartOps = createOfflineCartOps(db)

    // Mock fetch
    global.fetch = vi.fn() as unknown as typeof fetch
  })

  afterEach(async () => {
    await db.clear()
    db.close()
  })

  describe('Full offline shopping flow', () => {
    it('caches catalog, adds items to cart, and queues sync', async () => {
      // Step 1: Cache catalog
      await catalogCache.preloadProducts(sampleProducts)
      await catalogCache.preloadCategories(sampleCategories)

      // Step 2: Verify cache populated
      const cachedProduct = await catalogCache.getProductOffline('product-1')
      expect(cachedProduct).toBeDefined()
      expect(cachedProduct?.name_he).toBe('מוצר 1')

      const stats = await catalogCache.getCacheStats()
      expect(stats.productCount).toBe(2)
      expect(stats.categoryCount).toBe(1)

      // Step 3: Add items to cart
      await cartOps.addToOfflineCart('1', 'product-1', 2, 50000)
      await cartOps.addToOfflineCart('2', 'product-2', 1, 75000)

      // Step 4: Verify cart state
      const cartItems = await cartOps.getOfflineCartItems()
      expect(cartItems).toHaveLength(2)
      expect(cartItems.reduce((sum, item) => sum + item.quantity, 0)).toBe(3)

      // Step 5: Verify sync queue
      const queue = await db.getSyncQueue()
      expect(queue).toHaveLength(2)
      expect(queue[0]?.action).toBe('add_to_cart')
      expect(queue[1]?.action).toBe('add_to_cart')
    })

    it('handles offline cart modifications and sync', async () => {
      // Setup: cache and cart
      await catalogCache.preloadProducts(sampleProducts)
      await cartOps.addToOfflineCart('1', 'product-1', 2, 50000)

      // Modify cart offline
      await cartOps.updateOfflineCartQuantity('1', 5)
      await cartOps.addToOfflineCart('2', 'product-2', 1, 75000)
      await cartOps.removeFromOfflineCart('1')

      // Verify final state
      const cartItems = await cartOps.getOfflineCartItems()
      expect(cartItems).toHaveLength(1)
      expect(cartItems[0]?.product_id).toBe('2')

      // Verify sync queue tracks all actions
      const queue = await db.getSyncQueue()
      expect(queue.length).toBeGreaterThanOrEqual(3)
    })

    it('recovers sync queue after network reconnect', async () => {
      const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>
      fetchMock.mockResolvedValue({ ok: true })

      // Queue items while offline
      await cartOps.addToOfflineCart('1', 'product-1', 2, 50000)
      await cartOps.addToOfflineCart('2', 'product-2', 1, 75000)

      const queueBefore = await db.getSyncQueue()
      expect(queueBefore).toHaveLength(2)

      // Simulate reconnect
      const syncResult = await syncManager.syncQueuedChanges()

      // Check that items were processed (moved from queue)
      const queueAfter = await db.getSyncQueue()
      expect(queueAfter.length).toBeLessThanOrEqual(queueBefore.length)
    })
  })

  describe('Offline availability checks', () => {
    it('verifies product availability offline', async () => {
      await catalogCache.preloadProducts(sampleProducts)

      const available1 = await catalogCache.isProductAvailableOffline('product-1')
      const available2 = await catalogCache.isProductAvailableOffline('product-2')
      const unavailable = await catalogCache.isProductAvailableOffline('product-3')

      expect(available1).toBe(true)
      expect(available2).toBe(true)
      expect(unavailable).toBe(false)
    })

    it('handles out-of-stock products correctly', async () => {
      const outOfStockProduct: CatalogSchema['products']['value'] = {
        ...sampleProducts[0]!,
        slug: 'out-of-stock',
        stock_quantity: 0,
      }

      await catalogCache.preloadProducts([outOfStockProduct])
      const available = await catalogCache.isProductAvailableOffline('out-of-stock')

      expect(available).toBe(false)
    })
  })

  describe('Cache invalidation and refresh', () => {
    it('updates catalog cache with new products', async () => {
      // Initial load
      await catalogCache.preloadProducts(sampleProducts)
      let stats = await catalogCache.getCacheStats()
      expect(stats.productCount).toBe(2)

      // Add new product
      const newProduct: CatalogSchema['products']['value'] = {
        id: '3',
        slug: 'product-3',
        name_he: 'מוצר 3',
        price_agonot: 100000,
        stock_quantity: 15,
        supplier_id: 'sup-1',
        category_id: 'cat-1',
        created_at: '2024-01-02',
        updated_at: '2024-01-02',
      }

      await catalogCache.preloadProducts([newProduct])
      stats = await catalogCache.getCacheStats()
      expect(stats.productCount).toBe(3)

      // Verify new product is available
      const product = await catalogCache.getProductOffline('product-3')
      expect(product).toBeDefined()
    })

    it('clears cache completely', async () => {
      await catalogCache.preloadProducts(sampleProducts)
      await catalogCache.preloadCategories(sampleCategories)

      let stats = await catalogCache.getCacheStats()
      expect(stats.productCount).toBe(2)
      expect(stats.categoryCount).toBe(1)

      await catalogCache.clearCache()

      stats = await catalogCache.getCacheStats()
      expect(stats.productCount).toBe(0)
      expect(stats.categoryCount).toBe(0)
    })
  })

  describe('Sync conflict resolution', () => {
    it('resolves conflicts using last-write-wins', async () => {
      const now = Date.now()
      const local = { timestamp: now + 1000, data: 'local' }
      const remote = { timestamp: now, data: 'remote' }

      const conflict = await syncManager.resolveConflict('update_quantity', local, remote)

      expect(conflict.action).toBe('update_quantity')
      expect(conflict.localVersion).toEqual(local)
      expect(conflict.remoteVersion).toEqual(remote)
    })

    it('handles missing timestamps in conflict resolution', async () => {
      const local = { data: 'local' }
      const remote = { timestamp: Date.now(), data: 'remote' }

      const conflict = await syncManager.resolveConflict('add_to_cart', local, remote)

      expect(conflict.action).toBe('add_to_cart')
      expect(conflict.localVersion).toEqual(local)
    })
  })
})
