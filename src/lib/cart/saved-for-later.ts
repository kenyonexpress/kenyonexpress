import type { CartViewItem } from '@/lib/cart/types'
import type { Agorot } from '@/lib/money'
import { createJSONStorage, persist } from 'zustand/middleware'
import { createStore } from 'zustand/vanilla'

/**
 * The "saved for later" list: lines a shopper has parked outside the cart.
 *
 * WHY THE BROWSER AND NOT A TABLE. A parked line is not a reservation, not a
 * price, and not something the server needs to know to charge a card. It is
 * a bookmark with a quantity. Production has no table for it, a migration
 * would sit in `migrations/pending/` waiting for an approval this feature does
 * not need, and a `carts` row that carried parked lines would have to be
 * kept out of the pricer, the merge, the reaper and the abandoned-cart mail,
 * each of which would need to learn the distinction. The list lives in
 * `localStorage` under its own key, third after the mirror and the fallback,
 * and the server never sees it.
 *
 * WHAT IS STORED. Only what the row needs to render and to come back: the
 * identity (`product_id`, `variant_id`), the quantity, and the name, slug,
 * image and unit price AS THEY WERE when the line was parked. The price is a
 * display value and nothing else: "החזר לעגלה" calls the real `addToCart`,
 * which re-reads the product, re-prices it, and refuses it if it is gone,
 * exactly as any other add does. A stale price on a parked row is a stale
 * price on a bookmark, never on a charge.
 *
 * NEVER A MODULE SINGLETON. Same rule as the cart store: module state on the
 * server is shared across requests. `createSavedForLaterStore` is called from
 * a provider, once per mount.
 */

export const SAVED_FOR_LATER_KEY = 'ke_saved_for_later_v1'

/** Enough for a wish list, few enough that the key stays under any quota. */
export const SAVED_FOR_LATER_MAX = 50

export type SavedItem = {
  product_id: string
  variant_id: string | null
  quantity: number
  name_he: string
  slug: string
  image_url: string | null
  /** Integer agorot as of the moment it was parked. Display only. */
  unit_price: Agorot
  /** Epoch milliseconds, for the order of the list. */
  saved_at: number
}

export function savedItemKey(productId: string, variantId: string | null): string {
  return `${productId}::${variantId ?? 'null'}`
}

/** A cart line reduced to what the parked row keeps. */
export function savedItemFromLine(item: CartViewItem, now: number = Date.now()): SavedItem {
  return {
    product_id: item.product_id,
    variant_id: item.variant_id,
    quantity: item.quantity,
    name_he: item.name_he,
    slug: item.slug,
    image_url: item.image_url,
    unit_price: item.unit_price,
    saved_at: now,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Structural check on a persisted row. Same policy as the cart fallback: a
 * row that fails is dropped, never repaired. The price must be an integer
 * (agorot, the standing rule) and the quantity a positive integer.
 */
export function isSavedItem(value: unknown): value is SavedItem {
  if (!isRecord(value)) return false
  return (
    typeof value.product_id === 'string' &&
    value.product_id !== '' &&
    (typeof value.variant_id === 'string' || value.variant_id === null) &&
    Number.isInteger(value.quantity) &&
    (value.quantity as number) > 0 &&
    typeof value.name_he === 'string' &&
    typeof value.slug === 'string' &&
    (typeof value.image_url === 'string' || value.image_url === null) &&
    Number.isInteger(value.unit_price) &&
    (value.unit_price as number) >= 0 &&
    typeof value.saved_at === 'number'
  )
}

export interface SavedForLaterState {
  /** Newest first. */
  items: SavedItem[]
  /**
   * Whether `localStorage` has been read. False on the server and during the
   * first client render, so the list renders nothing until it can render the
   * truth: painting an empty list and then a full one is a flash, painting a
   * full one during hydration is a mismatch.
   */
  hydrated: boolean
  /** Parks a line. Replaces an existing row with the same identity. */
  save: (item: SavedItem) => void
  /** Drops a row without sending it anywhere. */
  discard: (productId: string, variantId: string | null) => void
  /** Drops a row and hands it back, for the caller that is re-adding it. */
  take: (productId: string, variantId: string | null) => SavedItem | null
  has: (productId: string, variantId: string | null) => boolean
  markHydrated: () => void
}

export type SavedForLaterStoreApi = ReturnType<typeof createSavedForLaterStore>

export function createSavedForLaterStore(initialItems: SavedItem[] = []) {
  return createStore<SavedForLaterState>()(
    persist(
      (set, get) => ({
        items: initialItems,
        hydrated: false,
        save: (item) => {
          const key = savedItemKey(item.product_id, item.variant_id)
          set((state) => ({
            items: [
              item,
              ...state.items.filter(
                (entry) => savedItemKey(entry.product_id, entry.variant_id) !== key,
              ),
            ].slice(0, SAVED_FOR_LATER_MAX),
          }))
        },
        discard: (productId, variantId) => {
          const key = savedItemKey(productId, variantId)
          set((state) => ({
            items: state.items.filter(
              (entry) => savedItemKey(entry.product_id, entry.variant_id) !== key,
            ),
          }))
        },
        take: (productId, variantId) => {
          const key = savedItemKey(productId, variantId)
          const found =
            get().items.find((entry) => savedItemKey(entry.product_id, entry.variant_id) === key) ??
            null
          if (found) get().discard(productId, variantId)
          return found
        },
        has: (productId, variantId) => {
          const key = savedItemKey(productId, variantId)
          return get().items.some(
            (entry) => savedItemKey(entry.product_id, entry.variant_id) === key,
          )
        },
        markHydrated: () => set({ hydrated: true }),
      }),
      {
        name: SAVED_FOR_LATER_KEY,
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({ items: state.items }) as SavedForLaterState,
        // A row this module did not write, or wrote under an older shape, is
        // dropped on the way in rather than rendered with holes.
        merge: (persisted, current) => {
          const raw = isRecord(persisted) && Array.isArray(persisted.items) ? persisted.items : []
          return { ...current, items: raw.filter(isSavedItem).slice(0, SAVED_FOR_LATER_MAX) }
        },
        skipHydration: true,
      },
    ),
  )
}
