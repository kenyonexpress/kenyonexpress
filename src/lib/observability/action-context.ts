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
 */
export async function withActionContext<T>(action: string, fn: () => Promise<T>): Promise<T> {
  const requestId = resolveRequestId(await headers())
  return runWithRequestContext({ requestId, route: 'action', method: action }, fn)
}
