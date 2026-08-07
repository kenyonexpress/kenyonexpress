/**
 * Reading the per-request context, from anywhere -- including modules the
 * client bundler insists on walking into.
 *
 * WHY THIS FILE HAS NO `node:async_hooks` IMPORT, WHICH IS WHERE IT STARTED.
 * The first version put the AsyncLocalStorage here and was reasoned to be safe
 * on the grounds that a `'use server'` module never reaches the browser. The
 * build disagreed, in exactly the terms worth writing down:
 *
 *   ./src/server/actions/auth.ts
 *   the chunking context (unknown) does not support external modules
 *   (request: node:async_hooks)
 *   Client Component Browser: ./src/server/actions/auth.ts [Client Component Browser]
 *
 * Turbopack does emit a client chunk item for a `'use server'` module -- the
 * action reference the browser binds a form to -- and it resolves that module's
 * imports to do it. `next/headers` survives that because it ships a client
 * stub; a Node built-in does not. So the storage lives in request-store.ts,
 * which only server entry points import, and every universal caller goes
 * through the handle below.
 *
 * The handle is on globalThis rather than a module variable because the server
 * and edge bundles are separate module instances of the same source, and a
 * per-bundle AsyncLocalStorage would give a route handler and a Server Function
 * on the same request two different empty stores.
 */

export type RequestContext = {
  requestId: string
  /** The route as written, e.g. `/api/payments/cardcom/webhook`. */
  route?: string
  /** HTTP method for a route handler; the action name for a Server Function. */
  method?: string
}

/**
 * Minimal shape of what request-store.ts installs. Structurally satisfied by
 * AsyncLocalStorage<RequestContext>, without naming the type this file cannot
 * import.
 *
 * `enterWith` is deliberately absent. AsyncLocalStorage has it; nothing reached
 * through this handle can call it, which is a stronger statement of the
 * measurement below than a comment asking people not to.
 */
export type RequestStore = {
  getStore(): RequestContext | undefined
  run<T>(context: RequestContext, fn: () => T): T
}

const HANDLE = Symbol.for('kenyonexpress.requestStore')

type GlobalWithStore = typeof globalThis & { [HANDLE]?: RequestStore }

/** Installed exactly once per process, by request-store.ts. */
export function setRequestStore(store: RequestStore): void {
  ;(globalThis as GlobalWithStore)[HANDLE] ??= store
}

export function getRequestStore(): RequestStore | undefined {
  return (globalThis as GlobalWithStore)[HANDLE]
}

export function getRequestContext(): RequestContext | undefined {
  return getRequestStore()?.getStore()
}

/** Null outside a request, which is the honest answer for a script or a test. */
export function getRequestId(): string | null {
  return getRequestContext()?.requestId ?? null
}

/**
 * Runs `fn` with the context bound, through the installed store.
 *
 * WHY THE CALLBACK FORM IS THE ONLY FORM HERE, MEASURED AND NOT ASSUMED. This
 * started as `enterWith`, which takes no callback and could therefore be one
 * line at the top of a Server Function. Two things came out of probing it:
 *
 *   await helper that enters : MISSING
 *   enter(await ...) in body : from-caller
 *   two overlapping actions  : one,two
 *   leaked into the top level: two
 *
 * The first line is the version that was written first and would have shipped:
 * `enterWith` inside an awaited async helper never reaches the caller at all,
 * because the caller resumes in the context it captured at its own await. It
 * was a no-op that returned the right id and bound it nowhere.
 *
 * The last line is why the working shape was not adopted either. `enterWith`
 * mutates the current execution context, so it escapes UPWARD into whatever
 * awaited the function that called it. A store that outlives its request is a
 * log line stamped with someone else's request id, which is worse than no id:
 * a missing correlation is visibly missing, a wrong one is not.
 *
 * `run` cannot do either. The store exists for the callback and nothing else.
 *
 * A missing store runs `fn` unchanged rather than throwing: the id is an aid to
 * reading logs, and losing it must never be able to fail a checkout.
 * `log-coverage` asserts that instrumentation.ts installs it, which is what
 * keeps that fallback from being a silent hole.
 */
export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  const store = getRequestStore()
  return store ? store.run(context, fn) : fn()
}
