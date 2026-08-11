// Polite HTTP client for the live WooCommerce store.
//
// We are reading a production site that real customers are browsing. The
// client enforces a concurrency cap, a floor on the interval between requests,
// exponential backoff with Retry-After support, and a permanent slowdown once
// the store has signalled stress even once.

import { THROTTLE, WC } from '../config.mjs'
import { warn } from './log.mjs'

let inFlight = 0
let nextSlotAt = 0
let interval = THROTTLE.minIntervalMs
const waiters = []

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function acquire() {
  while (inFlight >= THROTTLE.concurrency) {
    await new Promise((r) => waiters.push(r))
  }
  inFlight += 1
  const now = Date.now()
  const slot = Math.max(now, nextSlotAt)
  nextSlotAt = slot + interval
  const wait = slot - now
  if (wait > 0) await sleep(wait)
}

function release() {
  inFlight -= 1
  const next = waiters.shift()
  if (next) next()
}

/**
 * Once the store returns 429 or 5xx we do not go back to full speed for the
 * rest of the run. A store that is struggling at 4 req/s is still struggling
 * ten requests later.
 */
function slowDown(reason) {
  if (interval < THROTTLE.backoffIntervalMs) {
    interval = THROTTLE.backoffIntervalMs
    warn(`throttling down to ${1000 / interval} req/s for the rest of the run (${reason})`)
  }
}

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504])

/**
 * Fetch with retry. Returns the Response on success; throws after the last
 * attempt. Non-retryable statuses (4xx other than 408/429) throw immediately:
 * a 401 will not fix itself.
 */
export async function politeFetch(url, init = {}) {
  let lastErr
  for (let attempt = 0; attempt < THROTTLE.maxAttempts; attempt += 1) {
    await acquire()
    try {
      const res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(THROTTLE.timeoutMs),
      })
      if (res.ok) return res

      if (!RETRYABLE.has(res.status)) {
        throw new Error(`${res.status} ${res.statusText} for ${url}`)
      }
      slowDown(`HTTP ${res.status}`)
      const retryAfter = Number.parseInt(res.headers.get('retry-after') || '', 10)
      const backoff = Number.isFinite(retryAfter)
        ? retryAfter * 1000
        : THROTTLE.backoffMs[Math.min(attempt, THROTTLE.backoffMs.length - 1)]
      lastErr = new Error(`${res.status} ${res.statusText} for ${url}`)
      await sleep(backoff)
    } catch (err) {
      // an explicit non-retryable status was already thrown above
      if (
        err.message?.match(/^4\d\d /) &&
        !err.message.startsWith('408') &&
        !err.message.startsWith('429')
      ) {
        throw err
      }
      lastErr = err
      slowDown(err.name === 'TimeoutError' ? 'timeout' : 'network error')
      await sleep(THROTTLE.backoffMs[Math.min(attempt, THROTTLE.backoffMs.length - 1)])
    } finally {
      release()
    }
  }
  throw new Error(`giving up after ${THROTTLE.maxAttempts} attempts: ${lastErr?.message}`)
}

function authHeader() {
  if (!WC.key || !WC.secret) return {}
  // Basic auth keeps the credentials out of URLs, and therefore out of the
  // store's access logs and out of our own error messages.
  const token = Buffer.from(`${WC.key}:${WC.secret}`).toString('base64')
  return { authorization: `Basic ${token}` }
}

/** GET one WooCommerce REST endpoint. Returns {data, total, totalPages}. */
export async function wcGet(path, params = {}) {
  const url = new URL(`${WC.base}/wp-json/wc/v3/${path.replace(/^\/+/, '')}`)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value))
  }
  const res = await politeFetch(url, {
    headers: { accept: 'application/json', ...authHeader() },
  })
  return {
    data: await res.json(),
    total: Number.parseInt(res.headers.get('x-wp-total') || '0', 10),
    totalPages: Number.parseInt(res.headers.get('x-wp-totalpages') || '0', 10),
  }
}

/**
 * Page through a WooCommerce collection, yielding one page at a time.
 *
 * Termination is driven by X-WP-TotalPages and by an empty page, never by a
 * hardcoded count: the store is live and its totals move under us.
 */
export async function* wcPages(path, params = {}) {
  let page = 1
  let totalPages = null
  for (;;) {
    const {
      data,
      total,
      totalPages: reported,
    } = await wcGet(path, {
      ...params,
      per_page: WC.perPage,
      page,
    })
    if (totalPages === null) totalPages = reported || null
    if (!Array.isArray(data) || data.length === 0) return
    yield { page, rows: data, total, totalPages }
    if (totalPages && page >= totalPages) return
    page += 1
  }
}

/** Download raw bytes (images). Same throttle as the REST calls. */
export async function fetchBytes(url) {
  const res = await politeFetch(url, { headers: { accept: 'image/*,*/*' } })
  const buffer = Buffer.from(await res.arrayBuffer())
  return {
    buffer,
    contentType: res.headers.get('content-type') || '',
    byteSize: buffer.byteLength,
  }
}
