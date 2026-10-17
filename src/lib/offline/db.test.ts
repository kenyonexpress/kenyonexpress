import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type CatalogSchema, initOfflineDB } from './db'

describe('OfflineDB', () => {
  let offlineDB: Awaited<ReturnType<typeof initOfflineDB>>

  beforeEach(async () => {
    // Use a test database
    vi.resetModules()
    offlineDB = await initOfflineDB()
    await offlineDB.clear()
  })

  afterEach(async () => {
    await offlineDB.clear()
    offlineDB.close()
  })

  describe('Product operations', () => {
    it('saves and retrieves products', async () => {
      const products: CatalogSchema['products']['value'][] = [
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
      ]

      await offlineDB.saveProducts(products)
      const product = await offlineDB.getProduct('product-1')
      expect(product).toEqual(products[0])
    })

    it('retrieves all products', async () => {
      const products: CatalogSchema['products']['value'][] = [
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

      await offlineDB.saveProducts(products)
      const allProducts = await offlineDB.getAllProducts()
      expect(allProducts).toHaveLength(2)
      expect(allProducts[0]).toBeDefined()
      expect(allProducts[1]).toBeDefined()
    })

    it('retrieves products by category', async () => {
      const products: CatalogSchema['products']['value'][] = [
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
          category_id: 'cat-2',
          created_at: '2024-01-01',
          updated_at: '2024-01-01',
        },
      ]

      await offlineDB.saveProducts(products)
      const categoryProducts = await offlineDB.getProductsByCategory('cat-1')
      expect(categoryProducts).toHaveLength(1)
      expect(categoryProducts[0]).toBeDefined()
      expect(categoryProducts[0]?.slug).toBe('product-1')
    })
  })

  describe('Category operations', () => {
    it('saves and retrieves categories', async () => {
      const categories: CatalogSchema['categories']['value'][] = [
        {
          id: '1',
          slug: 'category-1',
          name_he: 'קטגוריה 1',
          created_at: '2024-01-01',
          updated_at: '2024-01-01',
        },
      ]

      await offlineDB.saveCategories(categories)
      const category = await offlineDB.getCategory('category-1')
      expect(category).toEqual(categories[0])
    })

    it('retrieves all categories', async () => {
      const categories: CatalogSchema['categories']['value'][] = [
        {
          id: '1',
          slug: 'category-1',
          name_he: 'קטגוריה 1',
          created_at: '2024-01-01',
          updated_at: '2024-01-01',
        },
        {
          id: '2',
          slug: 'category-2',
          name_he: 'קטגוריה 2',
          created_at: '2024-01-01',
          updated_at: '2024-01-01',
        },
      ]

      await offlineDB.saveCategories(categories)
      const allCategories = await offlineDB.getAllCategories()
      expect(allCategories).toHaveLength(2)
    })
  })

  describe('Cart operations', () => {
    it('saves and retrieves cart', async () => {
      const cart: CatalogSchema['cart']['value'] = {
        items: [
          {
            product_id: '1',
            product_slug: 'product-1',
            quantity: 2,
            price_agonot: 50000,
            timestamp: Date.now(),
          },
        ],
        timestamp: Date.now(),
        syncPending: false,
      }

      await offlineDB.saveCart(cart)
      const savedCart = await offlineDB.getCart()
      expect(savedCart.items).toHaveLength(1)
      expect(savedCart.items[0]).toBeDefined()
      expect(savedCart.items[0]?.product_id).toBe('1')
    })

    it('returns empty cart by default', async () => {
      const cart = await offlineDB.getCart()
      expect(cart.items).toEqual([])
      expect(cart.syncPending).toBe(false)
    })
  })

  describe('Sync queue operations', () => {
    it('adds and retrieves sync items', async () => {
      const id = await offlineDB.addSyncItem({
        action: 'add_to_cart',
        payload: { product_id: '1', quantity: 2 },
        timestamp: Date.now(),
        retryCount: 0,
      })

      const queue = await offlineDB.getSyncQueue()
      expect(queue).toHaveLength(1)
      expect(queue[0]).toBeDefined()
      expect(queue[0]?.id).toBe(id)
      expect(queue[0]?.action).toBe('add_to_cart')
    })

    it('removes sync items', async () => {
      const id = await offlineDB.addSyncItem({
        action: 'remove_from_cart',
        payload: { product_id: '1' },
        timestamp: Date.now(),
        retryCount: 0,
      })

      await offlineDB.removeSyncItem(id)
      const queue = await offlineDB.getSyncQueue()
      expect(queue).toHaveLength(0)
    })

    it('clears sync queue', async () => {
      await offlineDB.addSyncItem({
        action: 'add_to_cart',
        payload: { product_id: '1', quantity: 2 },
        timestamp: Date.now(),
        retryCount: 0,
      })

      await offlineDB.addSyncItem({
        action: 'update_quantity',
        payload: { product_id: '1', quantity: 3 },
        timestamp: Date.now(),
        retryCount: 0,
      })

      await offlineDB.clearSyncQueue()
      const queue = await offlineDB.getSyncQueue()
      expect(queue).toHaveLength(0)
    })
  })
})
