import { headers } from 'next/headers'
import { runWithRequestContext } from './request-context'
import { resolveRequestId } from './request-id'

/**
 * A Server Function's request id, bound around its body.
 *
 * WHY AN ACTION IS NOT JUST WRAPPED LIKE A ROUTE HANDLER. A `'use server'`
 * module may export nothing but async functions. [10] measured what happens
 * when one exports a const: the module's ENTIRE export set is zeroed and both
 * newsletter pages fail to build. So `export const submitCheckout =
 * withActionLog(...)`, the shape `withRequestLog` uses for the 15 route
 * handlers, is not available here. Each action instead keeps its body under a
 * private name and re-exports a two-line delegate through this.
 *
 * WHY THIS TAKES A CALLBACK WHEN A ONE-LINER WAS AVAILABLE. See
 * request-context.ts: the one-liner was `enterWith`, it was measured, and it
 * both failed to bind anything when called from an awaited helper and leaked
 * upward out of the request when it did bind. The callback cannot do either.
 *
 * WHY READING `headers()` HERE IS FREE. It marks the surrounding segment
 * dynamic, which is what makes the same call unacceptable inside the logger
 * (again request-context.ts). A Server Function is a POST that has already been
 * routed; there is no segment left to opt out of anything.
 *
 * KEPT SEPARATE FROM log.ts ON PURPOSE. `next/headers` cannot be imported from
 * the edge proxy or from a cached catalogue module, and log.ts is imported by
 * both kinds of caller. This module is the only one that touches it.
 *
 * WHY THE READ IS GUARDED. `headers()` does not return empty outside a request,
 * it throws:
 *
 *   `headers` was called outside a request scope.
 *
 * With five actions wrapped that was unreachable. At 74 it is not: the moment
 * contact.ts went through here, four of its unit tests stopped passing, and
 * they stopped on the wrapper rather than on anything they were testing. The
 * same call reaches the same throw from a script, from a seeder and from any
 * caller Next does not count as a request. request-context.ts already settled
 * what to do (a missing store runs `fn` unchanged) for exactly this reason, and
 * an unguarded read here quietly reversed it: losing the correlation id would
 * have turned into failing the action.
 */
export async function withActionContext<T>(action: string, fn: () => Promise<T>): Promise<T> {
  let requestId: string
  try {
    requestId = resolveRequestId(await headers())
  } catch {
    return fn()
  }
  return runWithRequestContext({ requestId, route: 'action', method: action }, fn)
}
