'use client'

import type { CatalogSchema, OfflineDB } from './db'

export interface CatalogCacheManager {
  preloadProducts(products: CatalogSchema['products']['value'][]): Promise<void>
  preloadCategories(categories: CatalogSchema['categories']['value'][]): Promise<void>
  getProductOffline(slug: string): Promise<CatalogSchema['products']['value'] | undefined>
  getCategoryOffline(slug: string): Promise<CatalogSchema['categories']['value'] | undefined>
  getCategoryProductsOffline(categoryId: string): Promise<CatalogSchema['products']['value'][]>
  isProductAvailableOffline(slug: string): Promise<boolean>
  getCacheStats(): Promise<CacheStats>
  clearCache(): Promise<void>
}

export interface CacheStats {
  productCount: number
  categoryCount: number
  lastUpdated?: number
}

export function createCatalogCacheManager(db: OfflineDB): CatalogCacheManager {
  return {
    async preloadProducts(products) {
      await db.saveProducts(products)
    },

    async preloadCategories(categories) {
      await db.saveCategories(categories)
    },

    async getProductOffline(slug) {
      return db.getProduct(slug)
    },

    async getCategoryOffline(slug) {
      return db.getCategory(slug)
    },

    async getCategoryProductsOffline(categoryId) {
      return db.getProductsByCategory(categoryId)
    },

    async isProductAvailableOffline(slug) {
      const product = await db.getProduct(slug)
      return !!product && product.stock_quantity > 0
    },

    async getCacheStats() {
      const products = await db.getAllProducts()
      const categories = await db.getAllCategories()

      return {
        productCount: products.length,
        categoryCount: categories.length,
        lastUpdated: Date.now(),
      }
    },

    async clearCache() {
      await db.clear()
    },
  }
}
