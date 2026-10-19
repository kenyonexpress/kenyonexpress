# Offline Mode Implementation (STEP 84)

## Overview

Complete offline support for KenyonExpress via IndexedDB with automatic sync-on-reconnect and conflict resolution.

## Core Components

### 1. IndexedDB Infrastructure (`src/lib/offline/db.ts`)

Core database abstraction managing four object stores:

- **products**: Full product catalog (slug-indexed)
  - Indexes: by-slug, by-category, by-supplier
  - Fields: id, name_he, price_agonot, stock_quantity, supplier info
  
- **categories**: Product categories (slug-indexed)
  - Indexes: by-slug
  - Fields: id, name_he, image_url

- **cart**: Current shopping cart (singleton document "current")
  - Items array with product_id, quantity, price_agonot
  - syncPending flag

- **syncQueue**: Queued actions awaiting server sync (auto-incrementing)
  - Indexes: by-timestamp, by-action
  - Actions: add_to_cart, remove_from_cart, update_quantity
  - Retry tracking with exponential backoff

### 2. Sync Manager (`src/lib/offline/sync.ts`)

Handles online/offline transitions and server synchronization:

```typescript
// Core methods
syncQueuedChanges(): Promise<SyncResult>  // Process queued actions
resolveConflict(...): Promise<SyncConflict>  // Last-write-wins strategy
isConnected(): boolean  // Current connection status
```

**Features:**
- Automatic online/offline detection via window events
- Exponential backoff retry (default: 1s base, 2x multiplier)
- Max 3 retry attempts per item
- Silent failure (logs error but doesn't block)
- Prevents concurrent syncs

### 3. React Hook (`src/lib/offline/useOfflineMode.ts`)

Client component integration:

```typescript
const {
  isOffline,           // Current offline status
  isSyncing,          // Sync in progress
  offlineDB,          // IndexedDB instance
  syncManager,        // Sync manager instance
  syncNow,            // Manually trigger sync
  saveProductsOffline,    // Cache products
  saveCategoriesOffline,  // Cache categories
  getOfflineCart,     // Get current cart
  saveOfflineCart,    // Save cart
  isInitialized,      // Hook ready
} = useOfflineMode()
```

Manages:
- IndexedDB initialization on mount
- Online/offline event listeners
- Automatic sync on reconnect
- Cleanup on unmount

### 4. Catalog Cache Manager (`src/lib/offline/catalogCache.ts`)

High-level catalog operations:

```typescript
preloadProducts(products)           // Cache products
preloadCategories(categories)       // Cache categories
getProductOffline(slug)            // Get by slug
getCategoryOffline(slug)           // Get by slug
getCategoryProductsOffline(catId)  // Query by category
isProductAvailableOffline(slug)    // Check stock > 0
getCacheStats()                    // Cache statistics
clearCache()                       // Full reset
```

### 5. Offline Cart Operations (`src/lib/offline/cartOps.ts`)

Cart-specific operations with automatic sync queueing:

```typescript
addToOfflineCart(id, slug, qty, price)
removeFromOfflineCart(id)
updateOfflineCartQuantity(id, qty)
getOfflineCartItems(): Promise<CartItem[]>
clearOfflineCart()
queueCartSync(action, payload)    // Manual queue
```

**Behavior:**
- Duplicate products aggregate quantities
- All operations queue sync automatically
- Maintains syncPending flag
- Cart persists across page reloads

### 6. Sync Endpoint (`src/app/api/offline/sync/route.ts`)

Validates sync requests and processes queued actions:

```
POST /api/offline/sync

Body: {
  action: 'add_to_cart' | 'remove_from_cart' | 'update_quantity',
  payload: { product_id, quantity?, price_agonot? },
  timestamp: number
}

Response: { success: true } or { error: '...' }
```

**Validation:**
- Ensures action is valid
- Ensures payload has required fields
- Returns 400 for invalid requests
- Returns 500 for processing errors

## Usage Pattern

### Initialization

```typescript
// In a client component
const {
  offlineDB,
  syncManager,
  isOffline,
} = useOfflineMode()

// OR use managers directly
const db = await initOfflineDB()
const syncMgr = await initSyncManager(db)
const catalogCache = createCatalogCacheManager(db)
const cartOps = createOfflineCartOps(db)
```

### Preload Catalog

```typescript
// Fetch from server, then cache
const { products, categories } = await fetchCatalog()

await catalogCache.preloadProducts(products)
await catalogCache.preloadCategories(categories)
```

### Shopping Flow

```typescript
// Check if available offline
const available = await catalogCache.isProductAvailableOffline('product-slug')

if (available) {
  // Add to cart (queues sync automatically)
  await cartOps.addToOfflineCart(id, slug, qty, price)
  
  // Get cart items
  const items = await cartOps.getOfflineCartItems()
}
```

### Handle Sync

```typescript
// Manual sync trigger
await syncManager.syncQueuedChanges()

// OR automatic (triggered on window 'online' event)
// Sync happens automatically when reconnecting
```

## Conflict Resolution Strategy

**Last-Write-Wins (LWW):**
- Compares `timestamp` fields between local and remote versions
- Version with later timestamp wins
- Applied symmetrically (local or remote, not merged)
- Useful for simple state (quantity, status flags)

```typescript
const conflict = await syncManager.resolveConflict(
  'update_quantity',
  { timestamp: localTime, quantity: 5 },
  { timestamp: remoteTime, quantity: 3 }
)
// Winner determined by which timestamp is later
```

## Data Structures

### CartItem
```typescript
{
  product_id: string           // UUID or ID
  product_slug: string        // For URLs
  quantity: number            // Units
  price_agonot: number       // Integer agorot (never float)
  timestamp: number          // When added
}
```

### SyncQueueItem
```typescript
{
  id: string                 // Auto-generated
  action: SyncAction         // add_to_cart, remove_from_cart, update_quantity
  payload: unknown           // Action-specific data
  timestamp: number          // When queued
  retryCount: number         // Current retry attempt
  lastError?: string         // Last error message (optional)
}
```

## Retry Behavior

- **Retryable errors**: Network timeouts, rate limiting, temporary server errors
- **Non-retryable**: Invalid payload, product not found, authorization failure
- **Backoff**: `delay = interval × (multiplier ^ retryCount)`
- **Example**: 1000ms × 2^0 = 1s, 1000ms × 2^1 = 2s, 1000ms × 2^2 = 4s

Items marked as non-retryable are removed from queue immediately.

## Event Flow

### Going Offline
1. `window offline` event fires
2. `isOffline` state updates to true
3. Subsequent cart operations queue automatically
4. Sync pauses until reconnect

### Going Online
1. `window online` event fires
2. `isOffline` state updates to false
3. `syncQueuedChanges()` triggered automatically
4. Failed items retain retry count (exponential backoff)
5. Max 3 retries per item, then dropped

## Testing

All components include comprehensive tests:

- `db.test.ts`: IndexedDB operations and transactions
- `sync.test.ts`: Sync queue processing and conflict resolution
- `catalogCache.test.ts`: Product/category caching
- `cartOps.test.ts`: Cart operations and sync queueing
- `integration.test.ts`: Full offline flow (cache → cart → sync)

Run tests:
```bash
pnpm test -- src/lib/offline
```

## Performance Characteristics

- **IndexedDB storage**: Typically 50-200MB per domain
- **Catalog size**: ~1000 products ≈ 2-5MB
- **Cart operations**: <10ms per operation
- **Sync time**: ~100-500ms per item (network dependent)

## Limitations & Future Work

### Current Limitations
1. No server-side sync state tracking (client-initiated only)
2. No conflict resolution UI (automatic LWW applied)
3. Cart sync is one-way (client → server)
4. No product image caching in IndexedDB

### Future Enhancements
1. Add two-way sync with version vectors
2. Implement three-way merge for complex conflicts
3. Cache product images as blobs
4. Add sync status UI component
5. Track last successful sync timestamp
6. Batch sync requests for performance

## Migration Path

No database migrations required. Offline functionality is entirely client-side via IndexedDB.

Server-side enhancements (future):
- Track client sync state per user
- Maintain version vectors for conflict detection
- Support two-way sync for inventory updates

## Debugging

Enable console logging:
```typescript
// In SyncManager
console.log('Syncing item:', item)
console.log('Sync result:', result)

// In useOfflineMode
console.log('Offline state:', isOffline)
console.log('Sync in progress:', isSyncing)
```

Monitor IndexedDB via DevTools:
1. DevTools → Application → Storage → IndexedDB
2. Database: `ke-offline`
3. Stores: products, categories, cart, syncQueue
4. Inspect object stores and indexes

## Integration Example

```typescript
// Product listing with offline fallback
export function ProductList() {
  const { 
    offlineDB, 
    isOffline 
  } = useOfflineMode()
  const [products, setProducts] = useState<Product[]>([])

  useEffect(() => {
    const loadProducts = async () => {
      try {
        if (isOffline && offlineDB) {
          // Use offline cache
          const cached = await offlineDB.getAllProducts()
          setProducts(cached)
        } else {
          // Fetch from server, then cache
          const fresh = await fetch('/api/products').then(r => r.json())
          if (offlineDB) {
            await offlineDB.saveProducts(fresh)
          }
          setProducts(fresh)
        }
      } catch (error) {
        console.error('Load failed:', error)
      }
    }

    loadProducts()
  }, [isOffline, offlineDB])

  return (
    <>
      {isOffline && <div className="alert">Viewing cached products</div>}
      {products.map(p => <ProductCard key={p.id} product={p} />)}
    </>
  )
}
```

## Security Notes

- IndexedDB is same-origin (cannot be accessed cross-origin)
- Cart data stored locally (encrypted at rest by browser)
- Sync endpoint validates all requests server-side
- No credentials stored in IndexedDB
- Clear cache on logout/sign-in change

## Compatibility

- Requires IndexedDB support (all modern browsers)
- Fallback for older browsers: skip offline features
- Service Worker integration: Yes (caches HTML shell)
- PWA: Ready for offline-first PWA architecture

## References

- [MDN IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [idb Library](https://github.com/jakearchibald/idb) (wrapper used)
- [Offline-First Architecture](https://offlinefirst.org/)
- [Sync on Reconnect Pattern](https://www.html5rocks.com/en/tutorials/service-worker/introduction/)
