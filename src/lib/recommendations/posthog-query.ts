import 'server-only'

import { log } from '@/lib/observability/log'

/**
 * Reads PostHog's event store back out, server-side, over the HogQL query API.
 *
 * WHY THIS IS THE FIRST READER OF POSTHOG IN THE REPO. Everything else in
 * `lib/analytics` and `lib/observability/posthog.ts` WRITES: the browser fans
 * `view_item`/`add_to_cart` out, the server adds the four money events, and
 * the only private-API caller was `scripts/deploy/mark-release.mjs` posting a
 * deploy annotation. The recommendation strips are the first feature that
 * needs the events back: "viewed together" is the co-occurrence of `view_item`
 * events inside one visitor-day, and the personalised home row is one
 * visitor's own `view_item` history. Both are one HogQL statement each.
 *
 * THE KEY IS THE PERSONAL ONE, NOT THE PUBLIC ONE. `NEXT_PUBLIC_POSTHOG_KEY`
 * is a write-only ingest token and cannot run a query; `POSTHOG_API_KEY`
 * (`phx_...`) with `POSTHOG_PROJECT_ID` are what `mark-release.mjs` already
 * documents in `.env.example`, and the same host rewrite applies: the ingest
 * host is `*.i.posthog.com`, the API host is `*.posthog.com`. Without either
 * variable this module says so once and every reader falls back to its
 * first-party source; nothing here can take a page down.
 *
 * NEVER STRING-INTERPOLATE A VISITOR VALUE INTO HOGQL. The distinct id is a
 * cookie the visitor controls. HogQL takes `{placeholders}` bound through the
 * `values` map, which is the only way an id reaches a statement here.
 */

export type PostHogQueryConfig = { host: string; projectId: string; apiKey: string }

type EnvLike = Record<string, string | undefined>

export function postHogQueryConfig(env: EnvLike = process.env): PostHogQueryConfig | null {
  const apiKey = env.POSTHOG_API_KEY?.trim()
  const projectId = env.POSTHOG_PROJECT_ID?.trim()
  if (!apiKey || !projectId || !/^\d+$/.test(projectId)) return null
  const host = (env.POSTHOG_API_HOST ?? env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.posthog.com')
    .replace(/\/+$/, '')
    .replace('.i.posthog.com', '.posthog.com')
  return { host, projectId, apiKey }
}

export function isPostHogQueryConfigured(env: EnvLike = process.env): boolean {
  return postHogQueryConfig(env) !== null
}

export type HogqlValue = string | number

export type HogqlResult = { columns: string[]; results: unknown[][] }

type FetchLike = (input: string, init: RequestInit) => Promise<Response>

export const HOGQL_TIMEOUT_MS = 8_000

/**
 * Runs one HogQL statement and returns its rows, or null on any failure:
 * unconfigured, network, non-2xx, malformed body. Callers treat null as
 * "no PostHog opinion" and read their first-party source instead; they must
 * not treat it as "no events".
 */
export async function queryHogql(
  query: string,
  values: Record<string, HogqlValue> = {},
  options: { config?: PostHogQueryConfig | null; fetchImpl?: FetchLike; timeoutMs?: number } = {},
): Promise<HogqlResult | null> {
  const config = options.config === undefined ? postHogQueryConfig() : options.config
  if (!config) return null
  const fetchImpl: FetchLike = options.fetchImpl ?? fetch
  try {
    const res = await fetchImpl(`${config.host}/api/projects/${config.projectId}/query/`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ query: { kind: 'HogQLQuery', query, values } }),
      signal: AbortSignal.timeout(options.timeoutMs ?? HOGQL_TIMEOUT_MS),
    })
    if (!res.ok) {
      log.warn('recommendations.hogql_failed', { status: res.status })
      return null
    }
    const body = (await res.json()) as { columns?: unknown; results?: unknown }
    if (!Array.isArray(body.columns) || !Array.isArray(body.results)) {
      log.warn('recommendations.hogql_malformed', {})
      return null
    }
    return {
      columns: body.columns.map(String),
      results: body.results.filter((row): row is unknown[] => Array.isArray(row)),
    }
  } catch (error) {
    log.warn('recommendations.hogql_threw', {
      reason: error instanceof Error ? error.message : 'unknown',
    })
    return null
  }
}

/**
 * Every `view_item` that named a product, in the window, keyed by the
 * visitor-day it happened in. The basket key is `distinct_id` + day rather
 * than `$session_id` on purpose: the fetch-path emitter in
 * `observability/posthog.ts` stamps no session id (only the lazily loaded
 * posthog-js does), so grouping by session would drop most of the events.
 * A visitor's day is also closer to what "viewed together" means to a
 * shopper comparing two deals.
 *
 * `properties.item_id` is the product id `commerce-client.ts` puts on every
 * single-item event; multi-item events (checkout, purchase) carry none and
 * are excluded by the `!= ''` test.
 */
export const CO_VIEW_QUERY = `
SELECT
  concat(distinct_id, ':', toString(toDate(timestamp))) AS basket,
  properties.item_id AS item_id
FROM events
WHERE event = 'view_item'
  AND timestamp > now() - INTERVAL {days} DAY
  AND properties.item_id IS NOT NULL
  AND properties.item_id != ''
GROUP BY basket, item_id
LIMIT 20000
`.trim()

/** One visitor's most recent distinct viewed products, newest first. */
export const VIEWED_BY_VISITOR_QUERY = `
SELECT properties.item_id AS item_id, max(timestamp) AS last_seen
FROM events
WHERE event = 'view_item'
  AND distinct_id = {distinct_id}
  AND timestamp > now() - INTERVAL {days} DAY
  AND properties.item_id IS NOT NULL
  AND properties.item_id != ''
GROUP BY item_id
ORDER BY last_seen DESC
LIMIT {limit}
`.trim()

/** Pulls the two named columns out of a result, dropping rows missing either. */
export function rowsAs(
  result: HogqlResult,
  first: string,
  second: string,
): { first: string; second: string }[] {
  const i = result.columns.indexOf(first)
  const j = result.columns.indexOf(second)
  if (i < 0 || j < 0) return []
  const out: { first: string; second: string }[] = []
  for (const row of result.results) {
    const a = row[i]
    const b = row[j]
    if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) continue
    out.push({ first: a, second: b })
  }
  return out
}
