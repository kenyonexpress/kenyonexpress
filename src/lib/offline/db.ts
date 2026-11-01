import { type DBSchema, type IDBPDatabase, openDB } from 'idb'

export interface CatalogSchema extends DBSchema {
  products: {
    key: string
    value: {
      id: string
      slug: string
      name_he: string
      price_agonot: number
      stock_quantity: number
      image_url?: string
      supplier_id: string
      supplier_name_he?: string
      category_id: string
      created_at: string
      updated_at: string
    }
    indexes: {
      'by-slug': string
      'by-category': string
      'by-supplier': string
    }
  }
  categories: {
    key: string
    value: {
      id: string
      slug: string
      name_he: string
      image_url?: string
      created_at: string
      updated_at: string
    }
    indexes: {
      'by-slug': string
    }
  }
  cart: {
    key: 'current'
    value: {
      items: CartItem[]
      timestamp: number
      syncPending: boolean
    }
  }
  syncQueue: {
    key: string
    value: {
      id: string
      action: 'add_to_cart' | 'remove_from_cart' | 'update_quantity'
      payload: unknown
      timestamp: number
      retryCount: number
      lastError?: string
    }
    indexes: {
      'by-timestamp': number
      'by-action': string
    }
  }
}

export interface CartItem {
  product_id: string
  product_slug: string
  quantity: number
  price_agonot: number
  timestamp: number
}

export interface OfflineDB {
  getProduct(slug: string): Promise<CatalogSchema['products']['value'] | undefined>
  getAllProducts(): Promise<CatalogSchema['products']['value'][]>
  getProductsByCategory(categoryId: string): Promise<CatalogSchema['products']['value'][]>
  saveProducts(products: CatalogSchema['products']['value'][]): Promise<void>

  getCategory(slug: string): Promise<CatalogSchema['categories']['value'] | undefined>
  getAllCategories(): Promise<CatalogSchema['categories']['value'][]>
  saveCategories(categories: CatalogSchema['categories']['value'][]): Promise<void>

  getCart(): Promise<CatalogSchema['cart']['value']>
  saveCart(cart: CatalogSchema['cart']['value']): Promise<void>

  addSyncItem(item: Omit<CatalogSchema['syncQueue']['value'], 'id'>): Promise<string>
  getSyncQueue(): Promise<CatalogSchema['syncQueue']['value'][]>
  removeSyncItem(id: string): Promise<void>
  clearSyncQueue(): Promise<void>

  close(): void
  clear(): Promise<void>
}

let db: IDBPDatabase<CatalogSchema> | null = null

export async function initOfflineDB(): Promise<OfflineDB> {
  if (db) return createOfflineDBInstance(db)

  db = await openDB<CatalogSchema>('ke-offline', 1, {
    upgrade(db) {
      // Products store
      if (!db.objectStoreNames.contains('products')) {
        const productStore = db.createObjectStore('products', { keyPath: 'slug' })
        productStore.createIndex('by-slug', 'slug')
        productStore.createIndex('by-category', 'category_id')
        productStore.createIndex('by-supplier', 'supplier_id')
      }

      // Categories store
      if (!db.objectStoreNames.contains('categories')) {
        const categoryStore = db.createObjectStore('categories', { keyPath: 'slug' })
        categoryStore.createIndex('by-slug', 'slug')
      }

      // Cart store (single document)
      if (!db.objectStoreNames.contains('cart')) {
        db.createObjectStore('cart')
      }

      // Sync queue
      if (!db.objectStoreNames.contains('syncQueue')) {
        const syncStore = db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true })
        syncStore.createIndex('by-timestamp', 'timestamp')
        syncStore.createIndex('by-action', 'action')
      }
    },
  })

  return createOfflineDBInstance(db)
}

function createOfflineDBInstance(database: IDBPDatabase<CatalogSchema>): OfflineDB {
  return {
    async getProduct(slug: string) {
      return database.get('products', slug)
    },

    async getAllProducts() {
      return database.getAll('products')
    },

    async getProductsByCategory(categoryId: string) {
      const tx = database.transaction('products', 'readonly')
      const index = tx.store.index('by-category')
      return index.getAll(categoryId)
    },

    async saveProducts(products) {
      const tx = database.transaction('products', 'readwrite')
      for (const product of products) {
        await tx.store.put(product)
      }
      await tx.done
    },

    async getCategory(slug: string) {
      return database.get('categories', slug)
    },

    async getAllCategories() {
      return database.getAll('categories')
    },

    async saveCategories(categories) {
      const tx = database.transaction('categories', 'readwrite')
      for (const category of categories) {
        await tx.store.put(category)
      }
      await tx.done
    },

    async getCart() {
      const cart = await database.get('cart', 'current')
      return (
        cart || {
          items: [],
          timestamp: Date.now(),
          syncPending: false,
        }
      )
    },

    async saveCart(cart) {
      await database.put('cart', cart, 'current')
    },

    async addSyncItem(item) {
      const id = `${item.action}-${Date.now()}-${Math.random()}`
      await database.put('syncQueue', {
        ...item,
        id,
        retryCount: 0,
      })
      return id
    },

    async getSyncQueue() {
      return database.getAll('syncQueue')
    },

    async removeSyncItem(id) {
      await database.delete('syncQueue', id)
    },

    async clearSyncQueue() {
      await database.clear('syncQueue')
    },

    close() {
      database.close()
      if (db === database) db = null
    },

    async clear() {
      const storeNames = Array.from(database.objectStoreNames)
      for (const storeName of storeNames) {
        await database.clear(storeName)
      }
    },
  }
}
