import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createCatalogCacheManager } from './catalogCache'
import { type CatalogSchema, initOfflineDB } from './db'

describe('Catalog Cache Manager', () => {
  let db: Awaited<ReturnType<typeof initOfflineDB>>
  let cacheManager: ReturnType<typeof createCatalogCacheManager>

  beforeEach(async () => {
    db = await initOfflineDB()
    await db.clear()
    cacheManager = createCatalogCacheManager(db)
  })

  afterEach(async () => {
    await db.clear()
    db.close()
  })

  describe('Product caching', () => {
    it('preloads and retrieves products', async () => {
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

      await cacheManager.preloadProducts(products)
      const product = await cacheManager.getProductOffline('product-1')
      expect(product).toEqual(products[0])
    })

    it('checks product availability offline', async () => {
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
          stock_quantity: 0,
          supplier_id: 'sup-1',
          category_id: 'cat-1',
          created_at: '2024-01-01',
          updated_at: '2024-01-01',
        },
      ]

      await cacheManager.preloadProducts(products)
      const available1 = await cacheManager.isProductAvailableOffline('product-1')
      const available2 = await cacheManager.isProductAvailableOffline('product-2')

      expect(available1).toBe(true)
      expect(available2).toBe(false)
    })
  })

  describe('Category caching', () => {
    it('preloads and retrieves categories', async () => {
      const categories: CatalogSchema['categories']['value'][] = [
        {
          id: '1',
          slug: 'category-1',
          name_he: 'קטגוריה 1',
          created_at: '2024-01-01',
          updated_at: '2024-01-01',
        },
      ]

      await cacheManager.preloadCategories(categories)
      const category = await cacheManager.getCategoryOffline('category-1')
      expect(category).toEqual(categories[0])
    })

    it('retrieves category products offline', async () => {
      const categories: CatalogSchema['categories']['value'][] = [
        {
          id: '1',
          slug: 'category-1',
          name_he: 'קטגוריה 1',
          created_at: '2024-01-01',
          updated_at: '2024-01-01',
        },
      ]

      const products: CatalogSchema['products']['value'][] = [
        {
          id: '1',
          slug: 'product-1',
          name_he: 'מוצר 1',
          price_agonot: 50000,
          stock_quantity: 10,
          supplier_id: 'sup-1',
          category_id: '1',
          created_at: '2024-01-01',
          updated_at: '2024-01-01',
        },
      ]

      await cacheManager.preloadCategories(categories)
      await cacheManager.preloadProducts(products)

      const categoryProducts = await cacheManager.getCategoryProductsOffline('1')
      expect(categoryProducts).toHaveLength(1)
    })
  })

  describe('Cache statistics', () => {
    it('returns cache statistics', async () => {
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

      const categories: CatalogSchema['categories']['value'][] = [
        {
          id: '1',
          slug: 'category-1',
          name_he: 'קטגוריה 1',
          created_at: '2024-01-01',
          updated_at: '2024-01-01',
        },
      ]

      await cacheManager.preloadProducts(products)
      await cacheManager.preloadCategories(categories)

      const stats = await cacheManager.getCacheStats()
      expect(stats.productCount).toBe(1)
      expect(stats.categoryCount).toBe(1)
      expect(stats.lastUpdated).toBeDefined()
    })
  })

  describe('Cache clearing', () => {
    it('clears the entire cache', async () => {
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

      await cacheManager.preloadProducts(products)
      await cacheManager.clearCache()

      const stats = await cacheManager.getCacheStats()
      expect(stats.productCount).toBe(0)
    })
  })
})
