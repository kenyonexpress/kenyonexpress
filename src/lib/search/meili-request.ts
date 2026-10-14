import { log } from '@/lib/observability/log'

/**
 * One Meilisearch search request, with its failure made visible.
 *
 * MEASURED ON PRODUCTION, 14.10 (UX21): `MEILISEARCH_HOST` and
 * `MEILISEARCH_API_KEY` are both set in the Production environment, `/api/ready`
 * reports `meilisearch: ok` (the host answers `/health`), and yet
 * `/api/search/facets?q=ספא` answers `engine: "database"` and
 * `/api/search/suggest` answers `database-fts`. Every search request to the
 * engine was failing, and nothing said so: the three callers each wrapped the
 * fetch in `if (!res.ok) return null` and a bare `catch { return null }`, so
 * the fallback took over with no log line, no metric and no difference a
 * shopper could see. The engine the project pays for has been off for every
 * search, silently, for as long as that has been true.
 *
 * This helper is the one place a search request leaves from. It still falls
 * back (the caller gets `ok: false` and does what it did), but every failure
 * is a `search.meili_unavailable` warning carrying the HTTP status and the
 * error `code` Meilisearch puts in its body (`index_not_found`,
 * `invalid_api_key`, `invalid_search_locales`...), which is exactly the line
 * the runbook needs to name the cause.
 *
 * One failure is also repaired here rather than reported: a server older than
 * 1.10 rejects the `locales` search parameter with a 400 whose message names
 * the field. The request is retried once without it, with a
 * `search.meili_locales_unsupported` warning, so a version gap costs the
 * Hebrew tokenizer hint and not the whole engine.
 */

export type MeiliSearchBody = Record<string, unknown> & { locales?: string[] }

export type MeiliRequestOutcome<T> = { ok: true; data: T } | { ok: false; reason: string }

type MeiliErrorBody = { code?: string; message?: string; type?: string }

/** How much of an upstream message a log line carries. */
const MAX_MESSAGE = 200

export function meiliConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.MEILISEARCH_HOST && env.MEILISEARCH_API_KEY)
}

function meiliHost(env: NodeJS.ProcessEnv): string {
  return (env.MEILISEARCH_HOST as string).replace(/\/$/, '')
}

async function readError(res: { json: () => Promise<unknown> }): Promise<MeiliErrorBody> {
  try {
    const body = (await res.json()) as unknown
    return body && typeof body === 'object' ? (body as MeiliErrorBody) : {}
  } catch {
    return {}
  }
}

/** Whether a 400 is the server refusing the `locales` field itself. */
export function rejectsLocales(status: number, error: MeiliErrorBody): boolean {
  if (status !== 400) return false
  if (error.code === 'invalid_search_locales') return true
  return /locales/i.test(error.message ?? '')
}

/**
 * POSTs `body` to `/indexes/{index}/search`. Never throws: a network error is
 * `ok: false` with the error's message as the reason, after the warning.
 */
export async function meiliSearch<T>(
  index: string,
  body: MeiliSearchBody,
  env: NodeJS.ProcessEnv = process.env,
): Promise<MeiliRequestOutcome<T>> {
  const host = meiliHost(env)
  const send = (payload: MeiliSearchBody) =>
    fetch(`${host}/indexes/${index}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.MEILISEARCH_API_KEY}`,
      },
      body: JSON.stringify(payload),
      // Search is request-time; never cache across queries.
      cache: 'no-store',
    })

  try {
    let res = await send(body)
    if (!res.ok) {
      const error = await readError(res)
      if (body.locales && rejectsLocales(res.status, error)) {
        log.warn('search.meili_locales_unsupported', {
          index,
          status: res.status,
          message: (error.message ?? '').slice(0, MAX_MESSAGE),
        })
        const { locales: _locales, ...withoutLocales } = body
        res = await send(withoutLocales)
        if (res.ok) return { ok: true, data: (await res.json()) as T }
        const retryError = await readError(res)
        return unavailable(index, res.status, retryError)
      }
      return unavailable(index, res.status, error)
    }
    return { ok: true, data: (await res.json()) as T }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown'
    log.warn('search.meili_unavailable', {
      index,
      status: null,
      reason: reason.slice(0, MAX_MESSAGE),
    })
    return { ok: false, reason: 'network' }
  }
}

function unavailable(
  index: string,
  status: number,
  error: MeiliErrorBody,
): MeiliRequestOutcome<never> {
  const reason = error.code ?? `http_${status}`
  log.warn('search.meili_unavailable', {
    index,
    status,
    code: error.code ?? null,
    message: (error.message ?? '').slice(0, MAX_MESSAGE),
  })
  return { ok: false, reason }
}
