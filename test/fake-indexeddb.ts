/**
 * The smallest IndexedDB that `lib/cart/sync-queue.ts` and the cart half of
 * `public/sw.js` can run against. jsdom ships none, and the real API is
 * event-driven: every operation returns a request whose `onsuccess` the
 * caller assigns AFTER the call returns, so each request here settles on a
 * microtask, never synchronously.
 *
 * What is modelled: `open` with `onupgradeneeded` on first open, one object
 * store per name with a `keyPath`, and the five store operations the queue
 * uses (`put`, `get`, `getAll`, `delete`, `clear`). Transactions are a
 * pass-through; there is no isolation to model for a single-writer queue.
 * `getAll` returns records in key order, like the real one.
 */

type Listener = (() => void) | null

class FakeRequest<T> {
  onsuccess: Listener = null
  onerror: Listener = null
  result!: T
  error: Error | null = null
  constructor(run: (request: FakeRequest<T>) => T) {
    queueMicrotask(() => {
      try {
        this.result = run(this)
        this.onsuccess?.()
      } catch (error) {
        this.error = error as Error
        this.onerror?.()
      }
    })
  }
}

class FakeObjectStore {
  constructor(
    readonly keyPath: string,
    readonly rows: Map<string, Record<string, unknown>>,
  ) {}
  put(value: Record<string, unknown>) {
    return new FakeRequest(() => {
      const key = String(value[this.keyPath])
      this.rows.set(key, structuredClone(value))
      return key
    })
  }
  get(key: string) {
    return new FakeRequest(() => {
      const row = this.rows.get(key)
      return row ? structuredClone(row) : undefined
    })
  }
  getAll() {
    return new FakeRequest(() =>
      [...this.rows.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([, row]) => structuredClone(row)),
    )
  }
  delete(key: string) {
    return new FakeRequest(() => {
      this.rows.delete(key)
      return undefined
    })
  }
  clear() {
    return new FakeRequest(() => {
      this.rows.clear()
      return undefined
    })
  }
}

class FakeDatabase {
  readonly stores = new Map<string, FakeObjectStore>()
  closed = false
  readonly objectStoreNames = {
    contains: (name: string) => this.stores.has(name),
  }
  createObjectStore(name: string, options: { keyPath: string }) {
    const store = new FakeObjectStore(options.keyPath, new Map())
    this.stores.set(name, store)
    return store
  }
  transaction(_name: string, _mode?: string) {
    return {
      objectStore: (storeName: string) => {
        const store = this.stores.get(storeName)
        if (!store) throw new Error(`NotFoundError: ${storeName}`)
        return store
      },
    }
  }
  close() {
    this.closed = true
  }
}

class FakeOpenRequest extends FakeRequest<FakeDatabase> {
  onupgradeneeded: Listener = null
  onblocked: Listener = null
}

export class FakeIndexedDB {
  readonly databases = new Map<string, FakeDatabase>()
  /** When set, `open` fails: the private-mode shape. */
  refuse = false

  open(name: string, _version?: number): FakeOpenRequest {
    return new FakeOpenRequest((request) => {
      if (this.refuse) throw new Error('InvalidStateError')
      let db = this.databases.get(name)
      if (!db) {
        db = new FakeDatabase()
        this.databases.set(name, db)
        // Upgrade runs before success, with `result` already readable, which
        // is the order the queue's `onupgradeneeded` depends on.
        request.result = db
        ;(request as FakeOpenRequest).onupgradeneeded?.()
      }
      db.closed = false
      return db
    })
  }

  /** Every row in one store of one database, for assertions. */
  rows(database: string, store: string): Record<string, unknown>[] {
    const db = this.databases.get(database)
    const s = db?.stores.get(store)
    return s ? [...s.rows.values()] : []
  }
}

/** Installs a fresh fake on `globalThis.indexedDB` and returns it. */
export function installFakeIndexedDB(): FakeIndexedDB {
  const fake = new FakeIndexedDB()
  Object.defineProperty(globalThis, 'indexedDB', {
    value: fake,
    configurable: true,
    writable: true,
  })
  return fake
}

export function uninstallFakeIndexedDB(): void {
  Reflect.deleteProperty(globalThis, 'indexedDB')
}
