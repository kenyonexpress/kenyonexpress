'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CatalogSchema, OfflineDB } from './db'
import { initOfflineDB } from './db'
import type { SyncManager } from './sync'
import { initSyncManager } from './sync'

interface UseOfflineModeReturn {
  isOffline: boolean
  isSyncing: boolean
  offlineDB: OfflineDB | null
  syncManager: SyncManager | null
  syncNow: () => Promise<void>
  saveProductsOffline: (products: CatalogSchema['products']['value'][]) => Promise<void>
  saveCategoriesOffline: (categories: CatalogSchema['categories']['value'][]) => Promise<void>
  getOfflineCart: () => Promise<CatalogSchema['cart']['value']>
  saveOfflineCart: (cart: CatalogSchema['cart']['value']) => Promise<void>
  isInitialized: boolean
}

export function useOfflineMode(): UseOfflineModeReturn {
  const [isOffline, setIsOffline] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)
  const dbRef = useRef<OfflineDB | null>(null)
  const syncManagerRef = useRef<SyncManager | null>(null)

  // Initialize offline DB on mount
  useEffect(() => {
    const initDB = async () => {
      try {
        if (!dbRef.current) {
          dbRef.current = await initOfflineDB()
        }
        if (!syncManagerRef.current && dbRef.current) {
          syncManagerRef.current = await initSyncManager(dbRef.current)
          setIsOffline(!syncManagerRef.current.isConnected())
        }
        setIsInitialized(true)
      } catch (error) {
        console.error('Failed to initialize offline DB:', error)
        setIsInitialized(true)
      }
    }

    initDB()

    return () => {
      if (dbRef.current) {
        dbRef.current.close()
      }
    }
  }, [])

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false)
      syncNow()
    }

    const handleOffline = () => {
      setIsOffline(true)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const syncNow = useCallback(async () => {
    if (!syncManagerRef.current) return
    setIsSyncing(true)
    try {
      await syncManagerRef.current.syncQueuedChanges()
    } finally {
      setIsSyncing(false)
    }
  }, [])

  const saveProductsOffline = useCallback(
    async (products: CatalogSchema['products']['value'][]) => {
      if (!dbRef.current) return
      await dbRef.current.saveProducts(products)
    },
    [],
  )

  const saveCategoriesOffline = useCallback(
    async (categories: CatalogSchema['categories']['value'][]) => {
      if (!dbRef.current) return
      await dbRef.current.saveCategories(categories)
    },
    [],
  )

  const getOfflineCart = useCallback(async () => {
    if (!dbRef.current) return { items: [], timestamp: Date.now(), syncPending: false }
    return dbRef.current.getCart()
  }, [])

  const saveOfflineCart = useCallback(async (cart: CatalogSchema['cart']['value']) => {
    if (!dbRef.current) return
    await dbRef.current.saveCart(cart)
  }, [])

  return {
    isOffline,
    isSyncing,
    offlineDB: dbRef.current,
    syncManager: syncManagerRef.current,
    syncNow,
    saveProductsOffline,
    saveCategoriesOffline,
    getOfflineCart,
    saveOfflineCart,
    isInitialized,
  }
}
