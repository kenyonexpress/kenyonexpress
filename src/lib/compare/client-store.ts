import { isCompareId, sanitizeCompareIds } from '@/lib/compare/ids'
import { COMPARE_LIMIT, COMPARE_STORAGE_KEY } from '@/lib/compare/limit'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

/**
 * The browser's one copy of "which products is this shopper comparing".
 *
 * WHY THE BROWSER AND NOT A TABLE. A compare list is a scratchpad: up to four
 * ids a shopper lines up for a minute and forgets. It is not per account (a
 * visitor who has never signed in compares just as much), it is not something
 * the server needs to price or to charge, and a table for it would sit in
 * `migrations/pending/` waiting for an approval the feature does not need.
 * The list lives in `localStorage` under its own key (the same decision the
 * parked cart lines took in `cart/saved-for-later.ts`), and the server only
 * ever sees it as the ids `/compare` asks it to describe.
 *
 * FOUR, AND THE FIFTH IS REFUSED, NOT ROTATED. Silently dropping the oldest
 * column to make room is how a shopper loses the product they came to
 * compare against; the button says the list is full and the tray offers
 * "נקה", and the shopper decides what goes.
 *
 * SSR RENDERS AN EMPTY LIST. `skipHydration` keeps the first client paint
 * identical to the server's (no compare marks, no tray) and
 * `useCompareHydration` rehydrates from storage after mount, once per page
 * load. The alternative, reading storage during render, is a hydration
 * mismatch on every card the shopper has already marked.
 */

export type CompareAddOutcome = { ok: true; added: boolean } | { ok: false; reason: 'full' }

export interface CompareClientState {
  /** In insertion order, which is the column order on `/compare`. */
  ids: readonly string[]
  /** Storage has been read; before this the list is empty by design. */
  hydrated: boolean
  add: (productId: string) => CompareAddOutcome
  remove: (productId: string) => void
  /** Add when absent, remove when present. Refuses (full) instead of rotating. */
  toggle: (productId: string) => CompareAddOutcome
  clear: () => void
  /** Replace the whole list (the page drops ids the catalogue no longer has). */
  replace: (ids: readonly string[]) => void
  setHydrated: (hydrated: boolean) => void
}

export { sanitizeCompareIds }

export const useCompareStore = create<CompareClientState>()(
  persist(
    (set, get) => ({
      ids: [],
      hydrated: false,

      add: (productId) => {
        const { ids } = get()
        if (ids.includes(productId)) return { ok: true, added: false }
        if (!isCompareId(productId)) return { ok: true, added: false }
        if (ids.length >= COMPARE_LIMIT) return { ok: false, reason: 'full' }
        set({ ids: [...ids, productId] })
        return { ok: true, added: true }
      },

      remove: (productId) => {
        const { ids } = get()
        if (!ids.includes(productId)) return
        set({ ids: ids.filter((id) => id !== productId) })
      },

      toggle: (productId) => {
        if (get().ids.includes(productId)) {
          get().remove(productId)
          return { ok: true, added: false }
        }
        return get().add(productId)
      },

      clear: () => set({ ids: [] }),

      replace: (ids) => set({ ids: sanitizeCompareIds(ids) }),

      setHydrated: (hydrated) => set({ hydrated }),
    }),
    {
      name: COMPARE_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ ids: state.ids }),
      merge: (persisted, current) => ({
        ...current,
        ids: sanitizeCompareIds((persisted as { ids?: unknown } | undefined)?.ids),
      }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true)
      },
    },
  ),
)

/** Selector: is this product in the list? Re-renders only when its answer changes. */
export function useIsCompared(productId: string): boolean {
  return useCompareStore((s) => s.ids.includes(productId))
}

/** Selector: how many products are listed (0 until hydrated). */
export function useCompareCount(): number {
  return useCompareStore((s) => s.ids.length)
}

/** Selector: the list is at its limit, so the next add will be refused. */
export function useCompareFull(): boolean {
  return useCompareStore((s) => s.ids.length >= COMPARE_LIMIT)
}

let rehydrated = false

/**
 * Read storage once per page load, after mount. Every compare control calls
 * this; the first one to mount does the read and the rest find it done.
 * Exported for tests, which reset it between cases.
 */
export function rehydrateCompareOnce(): void {
  if (rehydrated) return
  rehydrated = true
  void useCompareStore.persist.rehydrate()
}

/** @internal test seam */
export function resetCompareHydrationForTests(): void {
  rehydrated = false
  useCompareStore.setState({ ids: [], hydrated: false })
}
