'use client'

import {
  COMPARE_CHANGED_EVENT,
  readCompareList,
  toggleCompare,
  writeCompareList,
} from '@/lib/compare/storage'
import { useCallback, useEffect, useState } from 'react'

/**
 * The comparison list, as every control on the page sees it.
 *
 * Empty on the server and on the first client render, then read after mount:
 * the list is per browser, the listings are cached, and a first render that
 * read storage would disagree with the HTML it is hydrating. Each control
 * holds its own copy and they stay in step through the event the storage
 * module fires on every write, plus `storage` for a second tab.
 */
export function useCompareList() {
  const [list, setList] = useState<string[]>([])
  // False until storage has been read once, so a caller can tell "nothing
  // picked" from "not read yet".
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const sync = () => setList(readCompareList())
    sync()
    setReady(true)
    window.addEventListener(COMPARE_CHANGED_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(COMPARE_CHANGED_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  /** Returns false when the list is full and the product was not added. */
  const toggle = useCallback((productId: string): boolean => {
    const result = toggleCompare(readCompareList(), productId)
    if (result.refusedFull) return false
    writeCompareList(result.list)
    return true
  }, [])

  const remove = useCallback((productId: string) => {
    writeCompareList(readCompareList().filter((id) => id !== productId.toLowerCase()))
  }, [])

  const clear = useCallback(() => {
    writeCompareList([])
  }, [])

  return { list, ready, toggle, remove, clear }
}
