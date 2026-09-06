import { getRequestId } from '@/lib/observability/request-context'
import { REQUEST_ID_HEADER } from '@/lib/observability/request-id'
import { timeoutFetch } from '@/lib/supabase/timeout-fetch'

/**
 * The request id, forwarded on every Supabase call.
 *
 * WHY. Migration 169 gave audit_log a request_id column, and the trigger reads
 * it from PostgREST's `request.headers` GUC — which only ever contains what
 * the HTTP request carried. supabase-js sends no correlation header on its
 * own, so without this wrapper every trigger-written audit row has a null
 * request_id and "which request changed this row" stops at the database door.
 * With it, an audit row and the application log lines for the same request
 * share one id, minted once in src/proxy.ts.
 *
 * WHY A FETCH WRAPPER AND NOT `global.headers` AT CONSTRUCTION. A header
 * passed at construction is pinned for the life of the client, and a client
 * cached on a warm serverless instance would stamp one request's id onto
 * every later request. A wrong correlation is worse than a missing one (the
 * same measurement request-context.ts documents for `enterWith`), so the id
 * is resolved per call, exactly when the request goes out.
 *
 * Outside a request — a script, a cron tick, the browser, a test — there is
 * no store and no id, and the wrapper degrades to plain `timeoutFetch`.
 */
export function createRequestIdFetch(baseFetch: typeof fetch = timeoutFetch): typeof fetch {
  return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const id = getRequestId()
    if (!id) return baseFetch(input, init)

    // A Request object carries its own headers; `init.headers`, when present,
    // is what fetch would actually use. Start from whichever applies so the
    // merge drops nothing.
    const source = init?.headers ?? (input instanceof Request ? input.headers : undefined)
    const headers = new Headers(source)

    // An id someone set deliberately upstream outranks the ambient one.
    if (!headers.has(REQUEST_ID_HEADER)) headers.set(REQUEST_ID_HEADER, id)

    return baseFetch(input, { ...init, headers })
  }
}

/** The shared instance, composed over the timeout every client already has. */
export const requestIdFetch: typeof fetch = createRequestIdFetch()
