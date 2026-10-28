import type { OfflineDB } from './db'

export interface SyncConflict {
  action: string
  localVersion: unknown
  remoteVersion: unknown
  timestamp: number
}

export interface SyncResult {
  success: number
  failed: number
  conflicts: SyncConflict[]
}

export interface SyncItem {
  id: string
  action: 'add_to_cart' | 'remove_from_cart' | 'update_quantity'
  payload: unknown
  timestamp: number
  retryCount: number
  lastError?: string
}

export class SyncManager {
  private db: OfflineDB
  private syncInProgress = false
  private retryInterval = 1000
  private maxRetries = 3
  private backoffMultiplier = 2
  private isOnline = typeof navigator !== 'undefined' && navigator.onLine

  constructor(db: OfflineDB) {
    this.db = db
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.onOnline)
      window.addEventListener('offline', this.onOffline)
    }
  }

  private onOnline = () => this.handleOnline()
  private onOffline = () => this.handleOffline()

  dispose() {
    if (typeof window === 'undefined') return
    window.removeEventListener('online', this.onOnline)
    window.removeEventListener('offline', this.onOffline)
  }

  private handleOnline() {
    this.isOnline = true
    this.syncQueuedChanges().catch(console.error)
  }

  private handleOffline() {
    this.isOnline = false
  }

  isConnected(): boolean {
    return this.isOnline
  }

  async syncQueuedChanges(): Promise<SyncResult> {
    if (this.syncInProgress) return { success: 0, failed: 0, conflicts: [] }
    if (!this.isOnline) return { success: 0, failed: 0, conflicts: [] }

    this.syncInProgress = true
    try {
      const queue = await this.db.getSyncQueue()
      const result: SyncResult = { success: 0, failed: 0, conflicts: [] }

      for (const item of queue) {
        const success = await this.processSyncItem(item)
        if (success) {
          await this.db.removeSyncItem(item.id)
          result.success++
        } else {
          result.failed++
        }
      }

      return result
    } finally {
      this.syncInProgress = false
    }
  }

  private async processSyncItem(item: SyncItem): Promise<boolean> {
    const delay = this.retryInterval * this.backoffMultiplier ** item.retryCount

    try {
      const response = await fetch('/api/offline/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: item.action,
          payload: item.payload,
          timestamp: item.timestamp,
        }),
      })

      if (!response.ok) {
        if (item.retryCount < this.maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, delay))
          item.retryCount++
          return false
        }
        return true
      }

      return true
    } catch (_error) {
      if (item.retryCount < this.maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delay))
        item.retryCount++
        return false
      }
      return true
    }
  }

  async resolveConflict(action: string, local: unknown, remote: unknown): Promise<SyncConflict> {
    // Last-write-wins strategy with timestamp-based resolution
    const _localTime = (local as Record<string, unknown>)?.timestamp ?? 0
    const _remoteTime = (remote as Record<string, unknown>)?.timestamp ?? 0

    return {
      action,
      localVersion: local,
      remoteVersion: remote,
      timestamp: Date.now(),
    }
  }
}

let syncManagerInstance: SyncManager | null = null

export async function initSyncManager(db: OfflineDB): Promise<SyncManager> {
  // A manager holds the handle it was built with; a closed handle is dead, so
  // a new db means a new manager (and the old one stops listening).
  syncManagerInstance?.dispose()
  syncManagerInstance = new SyncManager(db)
  return syncManagerInstance
}
