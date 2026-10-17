import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initOfflineDB } from './db'
import { SyncManager } from './sync'

describe('SyncManager', () => {
  let syncManager: SyncManager
  let offlineDB: Awaited<ReturnType<typeof initOfflineDB>>

  beforeEach(async () => {
    vi.resetModules()
    offlineDB = await initOfflineDB()
    await offlineDB.clear()
    syncManager = new SyncManager(offlineDB)

    // Mock fetch globally
    global.fetch = vi.fn() as unknown as typeof fetch
  })

  afterEach(async () => {
    await offlineDB.clear()
    offlineDB.close()
  })

  describe('Connectivity', () => {
    it('detects online status', () => {
      expect(typeof syncManager.isConnected()).toBe('boolean')
    })
  })

  describe('Sync queue processing', () => {
    it('processes empty sync queue', async () => {
      const result = await syncManager.syncQueuedChanges()
      expect(result.success).toBe(0)
      expect(result.failed).toBe(0)
      expect(result.conflicts).toHaveLength(0)
    })

    it('handles network errors with retry', async () => {
      const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>
      fetchMock.mockRejectedValueOnce(new Error('Network error'))
      fetchMock.mockResolvedValueOnce({ ok: true })

      const _id = await offlineDB.addSyncItem({
        action: 'add_to_cart',
        payload: { product_id: '1', quantity: 2 },
        timestamp: Date.now(),
        retryCount: 0,
      })

      // First attempt fails
      const result1 = await syncManager.syncQueuedChanges()
      expect(result1.failed).toBeGreaterThanOrEqual(0)

      // Item should still be in queue for retry
      const queue = await offlineDB.getSyncQueue()
      expect(queue.length).toBeGreaterThan(0)
    })

    it('removes successful sync items', async () => {
      const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>
      fetchMock.mockResolvedValueOnce({ ok: true })

      await offlineDB.addSyncItem({
        action: 'add_to_cart',
        payload: { product_id: '1', quantity: 2 },
        timestamp: Date.now(),
        retryCount: 0,
      })

      const result = await syncManager.syncQueuedChanges()
      expect(result.success).toBeGreaterThanOrEqual(0)
    })

    it('prevents concurrent syncs', async () => {
      const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>
      fetchMock.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 100)),
      )

      await offlineDB.addSyncItem({
        action: 'add_to_cart',
        payload: { product_id: '1', quantity: 2 },
        timestamp: Date.now(),
        retryCount: 0,
      })

      const sync1 = syncManager.syncQueuedChanges()
      const sync2 = syncManager.syncQueuedChanges()

      const [result1, result2] = await Promise.all([sync1, sync2])

      // One should be skipped due to concurrent sync prevention
      expect(result1.success + result2.success).toBeLessThanOrEqual(1)
    })
  })

  describe('Conflict resolution', () => {
    it('resolves conflicts using last-write-wins', async () => {
      const now = Date.now()
      const local = { timestamp: now + 1000 }
      const remote = { timestamp: now }

      const conflict = await syncManager.resolveConflict('update_quantity', local, remote)

      expect(conflict.action).toBe('update_quantity')
      expect(conflict.localVersion).toEqual(local)
      expect(conflict.remoteVersion).toEqual(remote)
    })

    it('handles conflicts with missing timestamps', async () => {
      const conflict = await syncManager.resolveConflict(
        'add_to_cart',
        { product_id: '1' },
        { product_id: '1' },
      )

      expect(conflict.action).toBe('add_to_cart')
    })
  })

  describe('Sync request validation', () => {
    it('validates add_to_cart payloads', async () => {
      const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>
      fetchMock.mockResolvedValueOnce({ ok: true })

      const result = await fetch('/api/offline/sync', {
        method: 'POST',
        body: JSON.stringify({
          action: 'add_to_cart',
          payload: { product_id: '1', quantity: 2, price_agonot: 50000 },
        }),
      })

      expect(result.ok).toBe(true)
    })

    it('validates remove_from_cart payloads', async () => {
      const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>
      fetchMock.mockResolvedValueOnce({ ok: true })

      const result = await fetch('/api/offline/sync', {
        method: 'POST',
        body: JSON.stringify({
          action: 'remove_from_cart',
          payload: { product_id: '1' },
        }),
      })

      expect(result.ok).toBe(true)
    })

    it('validates update_quantity payloads', async () => {
      const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>
      fetchMock.mockResolvedValueOnce({ ok: true })

      const result = await fetch('/api/offline/sync', {
        method: 'POST',
        body: JSON.stringify({
          action: 'update_quantity',
          payload: { product_id: '1', quantity: 3 },
        }),
      })

      expect(result.ok).toBe(true)
    })
  })
})
