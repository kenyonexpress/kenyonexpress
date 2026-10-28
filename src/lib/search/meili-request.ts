import { fetchWithTimeout } from '@/lib/http/fetch-with-timeout'
import { log } from '@/lib/observability/log'

/**
 * Unified Meilisearch request handler with logging and retry logic.
 *
 * All Meilisearch operations (search, indexing, settings) flow through this
 * handler to ensure consistent error logging, retry behavior, and status
 * reporting. The health endpoint calls search with limit: 1 to verify both
 * connectivity and a working index.
 */

export interface MeiliRequestOptions {
  retryIfOlderThan?: string
}

interface MeiliErrorDetail {
  code: string
  message: string
  status: number
}

function meiliEnv(): { host: string; key: string } | null {
  const host = process.env.MEILISEARCH_HOST
  const key = process.env.MEILISEARCH_API_KEY
  if (!host || !key) return null
  return { host: host.replace(/\/$/, ''), key }
}

/**
 * Parse Meilisearch error response to extract the error code and message.
 *
 * Meilisearch returns structured errors like:
 * { "errors": [{ "code": "index_not_found", "message": "..." }] }
 * or { "code": "invalid_api_key", "message": "..." }
 */
async function parseMeiliError(response: Response): Promise<MeiliErrorDetail> {
  const status = response.status
  try {
    const body = await response.json()
    const errorData = body.errors?.[0] ?? body
    const code = errorData.code ?? 'unknown_error'
    const message = errorData.message ?? `HTTP ${status}`
    return { code, message, status }
  } catch {
    return { code: 'parse_error', message: `HTTP ${status}`, status }
  }
}

/**
 * Core Meilisearch request handler with logging.
 *
 * On success: returns parsed JSON
 * On failure: logs the error with code and HTTP status, then throws
 * If not configured: throws immediately with a clear error
 */
export async function meiliRequest<T = unknown>(
  path: string,
  method: string,
  body?: unknown,
  opts: MeiliRequestOptions = {},
): Promise<T> {
  const env = meiliEnv()
  if (!env) throw new Error('meilisearch not configured')

  const url = `${env.host}${path}`
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${env.key}`,
  }

  let lastError: MeiliErrorDetail | null = null

  // Single attempt, or retry once without `locales` param for older servers
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const reqBody = body ? JSON.stringify(body) : undefined
      const res = await fetchWithTimeout(url, {
        method,
        headers,
        ...(reqBody ? { body: reqBody } : {}),
        cache: 'no-store',
      })

      if (res.ok) {
        return (await res.json()) as T
      }

      const error = await parseMeiliError(res)
      lastError = error

      // Retry once if the Meilisearch server is older than 1.10 and failed on
      // a locales parameter. Older servers do not support localizedAttributes.
      if (
        attempt === 0 &&
        opts.retryIfOlderThan &&
        (error.code === 'bad_parameter' || error.code === 'invalid_search_params') &&
        body &&
        typeof body === 'object' &&
        'locales' in (body as Record<string, unknown>)
      ) {
        const retryBody = { ...body } as Record<string, unknown>
        retryBody.locales = undefined
        // Recursively retry without the locales param
        return meiliRequest(path, method, retryBody, { ...opts, retryIfOlderThan: undefined })
      }

      // Log the error and fall through to throw
      log.error('search.meili_unavailable', {
        method,
        path,
        status: error.status,
        code: error.code,
        message: error.message,
      })

      throw new Error(`meilisearch ${method} ${path} -> ${error.status} ${error.code}`)
    } catch (error) {
      if (lastError || attempt === 1) {
        // Already logged above, or this is the final attempt
        if (!lastError) {
          log.error('search.meili_request_failed', {
            method,
            path,
            reason: error instanceof Error ? error.message : 'unknown',
          })
        }
        throw error
      }
    }
  }

  throw new Error('meilisearch request exhausted retries')
}

/**
 * Search request handler specifically for the search endpoint.
 *
 * Returns null on failure (graceful degradation to database fallback)
 * rather than throwing, since the search path needs to silently fall back.
 */
export async function meiliSearch<T = unknown>(
  path: string,
  method: string,
  body?: unknown,
): Promise<T | null> {
  try {
    return await meiliRequest<T>(path, method, body)
  } catch {
    return null
  }
}

/**
 * Health check: ping the index and run a real search to verify the index works.
 * Returns { ok: true } on success, { ok: false, code: string } on failure.
 */
export async function meiliHealthCheck(): Promise<{ ok: boolean; code?: string }> {
  const env = meiliEnv()
  if (!env) {
    return { ok: false, code: 'not_configured' }
  }

  try {
    // First, check if the server is reachable
    const healthRes = await fetchWithTimeout(`${env.host}/health`, {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    })

    if (!healthRes.ok) {
      const error = await parseMeiliError(healthRes)
      log.warn('search.meili_health_check_failed', {
        phase: 'ping',
        code: error.code,
        status: error.status,
      })
      return { ok: false, code: error.code }
    }

    // Second, verify the index exists and can be searched
    const index = process.env.MEILISEARCH_INDEX ?? 'products'
    const searchRes = await fetchWithTimeout(`${env.host}/indexes/${index}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.key}`,
      },
      body: JSON.stringify({ q: '', limit: 1 }),
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    })

    if (!searchRes.ok) {
      const error = await parseMeiliError(searchRes)
      log.warn('search.meili_health_check_failed', {
        phase: 'search',
        code: error.code,
        status: error.status,
      })
      return { ok: false, code: error.code }
    }

    return { ok: true }
  } catch (error) {
    log.error('search.meili_health_check_error', {
      reason: error instanceof Error ? error.message : 'unknown',
    })
    return { ok: false, code: 'check_error' }
  }
}
