'use client'

import type { CatalogSchema } from './db'
import type { OfflineDB } from './db'

export interface OfflineCartOps {
  addToOfflineCart(
    productId: string,
    productSlug: string,
    quantity: number,
    priceAgonot: number,
  ): Promise<void>
  removeFromOfflineCart(productId: string): Promise<void>
  updateOfflineCartQuantity(productId: string, quantity: number): Promise<void>
  getOfflineCartItems(): Promise<CatalogSchema['cart']['value']['items']>
  clearOfflineCart(): Promise<void>
  queueCartSync(action: 'add' | 'remove' | 'update', payload: unknown): Promise<string>
}

export function createOfflineCartOps(db: OfflineDB): OfflineCartOps {
  return {
    async addToOfflineCart(productId, productSlug, quantity, priceAgonot) {
      const cart = await db.getCart()
      const existingItemIndex = cart.items.findIndex((item) => item.product_id === productId)

      if (existingItemIndex >= 0) {
        cart.items[existingItemIndex]!.quantity += quantity
      } else {
        cart.items.push({
          product_id: productId,
          product_slug: productSlug,
          quantity,
          price_agonot: priceAgonot,
          timestamp: Date.now(),
        })
      }

      cart.syncPending = true
      await db.saveCart(cart)

      // Queue sync action
      await db.addSyncItem({
        action: 'add_to_cart',
        payload: { product_id: productId, quantity, price_agonot: priceAgonot },
        timestamp: Date.now(),
        retryCount: 0,
      })
    },

    async removeFromOfflineCart(productId) {
      const cart = await db.getCart()
      cart.items = cart.items.filter((item) => item.product_id !== productId)
      cart.syncPending = true
      await db.saveCart(cart)

      // Queue sync action
      await db.addSyncItem({
        action: 'remove_from_cart',
        payload: { product_id: productId },
        timestamp: Date.now(),
        retryCount: 0,
      })
    },

    async updateOfflineCartQuantity(productId, quantity) {
      const cart = await db.getCart()
      const item = cart.items.find((i) => i.product_id === productId)

      if (item) {
        item.quantity = quantity
        cart.syncPending = true
        await db.saveCart(cart)

        // Queue sync action
        await db.addSyncItem({
          action: 'update_quantity',
          payload: { product_id: productId, quantity },
          timestamp: Date.now(),
          retryCount: 0,
        })
      }
    },

    async getOfflineCartItems() {
      const cart = await db.getCart()
      return cart.items
    },

    async clearOfflineCart() {
      const cart = await db.getCart()
      cart.items = []
      cart.syncPending = false
      await db.saveCart(cart)
    },

    async queueCartSync(action, payload) {
      const actionMap: Record<string, CatalogSchema['syncQueue']['value']['action']> = {
        add: 'add_to_cart',
        remove: 'remove_from_cart',
        update: 'update_quantity',
      }

      return db.addSyncItem({
        action: actionMap[action] || 'add_to_cart',
        payload,
        timestamp: Date.now(),
        retryCount: 0,
      })
    },
  }
}
