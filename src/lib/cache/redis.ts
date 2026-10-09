import { log } from '@/lib/observability/log'
import { tryCommand, upstashConfig } from '@/lib/rate-limit/upstash'

/**
 * Upstash-backed JSON cache.
 *
 * Transport is the fetch-based REST client from `src/lib/rate-limit/upstash.ts`,
 * for the reasons documented at length in that file (worktree-shared
 * `node_modules` rules out `pnpm add @upstash/redis`, and the edge runtime
 * rules out TCP clients). If the SDK is ever adopted deliberately, only that
 * transport changes; this module's surface stays the same.
 *
 * Failure policy: a cache that throws is worse than no cache. Every Redis or
 * transport failure degrades to a miss (`get` returns `null`, `set`/`del`
 * report `false`, `withCache` falls through to the wrapped function) and is
 * logged by the transport. The same degradation applies when
 * `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` are unset, matching the
 * rate limiter's "half-configured means off" rule.
 *
 * Values must survive `JSON.stringify`/`JSON.parse` round-tripping. `Date`,
 * `Map`, `undefined` inside objects and friends will come back changed; that
 * is a caller contract, not something this module can detect cheaply.
 */

/**
 * Stored envelope. `storedAt` (epoch ms) is what makes stale-while-revalidate
 * possible: Redis TTL alone cannot distinguish "fresh" from "stale but still
 * servable", so freshness is computed here and the Redis expiry is set to the
 * end of the stale window.
 */
type Envelope<T> = { value: T; storedAt: number }

export async function get<T>(key: string): Promise<T | null> {
  const entry = await readEnvelope<T>(key)
  return entry ? entry.value : null
}

/**
 * `ttlSeconds` omitted means no expiry. Returns `false` when Upstash is
 * unconfigured or the write failed; the caller decides whether that matters.
 */
export async function set<T>(key: string, value: T, ttlSeconds?: number): Promise<boolean> {
  return writeEnvelope(key, { value, storedAt: Date.now() }, ttlSeconds)
}

export async function del(key: string): Promise<boolean> {
  const config = upstashConfig()
  if (!config) return false
  const result = await tryCommand(config, ['DEL', key], 'cache.del_failed')
  return result !== null
}

export type WithCacheOptions = {
  /** Seconds the value is served without touching the loader. */
  ttlSeconds: number
  /**
   * Seconds past `ttlSeconds` during which a stale value is still returned
   * immediately while one background refresh runs. Omitted or 0: expired
   * entries are recomputed inline.
   */
  staleWhileRevalidateSeconds?: number
}

/**
 * Wrap an async loader with cache-aside plus stale-while-revalidate.
 *
 * `key` is a function of the loader's arguments, because a fixed string would
 * silently serve one argument set's result for every other.
 *
 * Behaviour per call:
 * - miss (or cache unavailable): run the loader, store, return.
 * - fresh hit (age <= ttl): return the cached value.
 * - stale hit (ttl < age <= ttl + swr): return the cached value now, refresh
 *   in the background. Concurrent stale hits in the same process share one
 *   refresh, so a hot key does not stampede the loader.
 *
 * Redis expiry is `ttl + swr`, so anything readable from Redis is servable by
 * definition and the fully-expired case is just a miss.
 */
export function withCache<Args extends unknown[], T>(
  key: (...args: Args) => string,
  fn: (...args: Args) => Promise<T>,
  options: WithCacheOptions,
): (...args: Args) => Promise<T> {
  const ttlMs = options.ttlSeconds * 1000
  const swrSeconds = options.staleWhileRevalidateSeconds ?? 0
  const redisTtlSeconds = options.ttlSeconds + swrSeconds

  const loadAndStore = async (cacheKey: string, args: Args): Promise<T> => {
    const value = await fn(...args)
    await writeEnvelope(cacheKey, { value, storedAt: Date.now() }, redisTtlSeconds)
    return value
  }

  return async (...args: Args): Promise<T> => {
    const cacheKey = key(...args)
    const entry = await readEnvelope<T>(cacheKey)
    if (!entry) return loadAndStore(cacheKey, args)

    const age = Date.now() - entry.storedAt
    if (age <= ttlMs) return entry.value

    if (age <= ttlMs + swrSeconds * 1000) {
      revalidateOnce(cacheKey, () => loadAndStore(cacheKey, args))
      return entry.value
    }

    // Readable but past the whole window: only reachable when the loader set
    // no Redis expiry it could rely on (clock skew, or a manual `set` with a
    // longer ttl). Treated as a miss.
    return loadAndStore(cacheKey, args)
  }
}

/** One in-flight background refresh per key per process. */
const revalidating = new Map<string, Promise<void>>()

function revalidateOnce(cacheKey: string, refresh: () => Promise<unknown>): void {
  if (revalidating.has(cacheKey)) return
  const inflight = refresh()
    .catch((error: unknown) => {
      // The stale value was already served, so a failed refresh costs nothing
      // beyond this log line; the next stale hit will try again.
      log.error('cache.revalidate_failed', {
        key: cacheKey,
        reason: error instanceof Error ? error.message : String(error),
      })
    })
    .then(() => {
      revalidating.delete(cacheKey)
    })
  revalidating.set(cacheKey, inflight)
}

async function readEnvelope<T>(key: string): Promise<Envelope<T> | null> {
  const config = upstashConfig()
  if (!config) return null
  const raw = await tryCommand(config, ['GET', key], 'cache.get_failed')
  if (typeof raw !== 'string') return null
  try {
    const parsed = JSON.parse(raw) as Envelope<T>
    if (typeof parsed !== 'object' || parsed === null) return null
    if (typeof parsed.storedAt !== 'number' || !('value' in parsed)) return null
    return parsed
  } catch {
    // A foreign or corrupt payload under this key is a miss, not an outage.
    return null
  }
}

async function writeEnvelope<T>(
  key: string,
  entry: Envelope<T>,
  ttlSeconds?: number,
): Promise<boolean> {
  const config = upstashConfig()
  if (!config) return false
  const args =
    ttlSeconds && ttlSeconds > 0
      ? ['SET', key, JSON.stringify(entry), 'EX', String(Math.ceil(ttlSeconds))]
      : ['SET', key, JSON.stringify(entry)]
  const result = await tryCommand(config, args, 'cache.set_failed')
  return result !== null
}
