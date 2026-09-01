import { log } from '@/lib/observability/log'

/**
 * A timeout on every Supabase call, applied once at client construction.
 *
 * WHY HERE AND NOT AT THE CALL SITES. There are hundreds of Supabase reads and
 * writes in this application and exactly seven places where a client is built.
 * Passing `global.fetch` at construction gives every query made through that
 * client a timeout without editing a single call site, and -- more importantly
 * -- without the next call site anyone adds being the one that forgot.
 *
 * WHAT GOES WRONG WITHOUT IT. `supabase-js` issues plain `fetch` calls with no
 * deadline. A Supabase that accepts the connection and answers slowly, or not
 * at all, holds the request open until the platform kills it. On a serverless
 * function that is the full execution ceiling spent on one stalled query, and
 * the customer sees a spinner rather than an error the page can handle.
 *
 * WHY THE INCOMING SIGNAL IS COMPOSED RATHER THAN REPLACED. `supabase-js`
 * passes its own `AbortSignal` for `.abortSignal()` queries and for realtime
 * teardown. Overwriting it would silently break cancellation, so the timeout
 * and the caller's signal are combined: whichever fires first wins.
 */

/**
 * Read per call rather than pinned at module load, for the same reason the
 * Upstash config and the Cardcom timeout are: a value read once survives for
 * the life of a warm instance.
 *
 * 10s is well past a healthy query from a Vercel region to Supabase and well
 * under the platform's own request ceiling, which leaves the caller room to
 * turn the failure into a page rather than a timeout of its own.
 */
export function supabaseTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env.SUPABASE_TIMEOUT_MS)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 10_000
}

/** Thrown in place of a bare `AbortError`, so a caller can tell the two apart. */
export class SupabaseTimeoutError extends Error {
  readonly timeoutMs: number
  constructor(timeoutMs: number) {
    super(`Supabase request exceeded ${timeoutMs}ms`)
    this.name = 'SupabaseTimeoutError'
    this.timeoutMs = timeoutMs
  }
}

/**
 * `fetch`, with a deadline.
 *
 * Exported as a factory so a test can inject its own `fetch` and its own clock
 * without touching globals.
 */
export function createTimeoutFetch(
  baseFetch?: typeof fetch,
  env: NodeJS.ProcessEnv = process.env,
): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    // RESOLVED AT CALL TIME, NOT CAPTURED AT CONSTRUCTION. Defaulting the
    // parameter to `fetch` binds whatever `fetch` was when this module was
    // imported, and two things replace it afterwards: Next instruments
    // `globalThis.fetch` for its own caching, and tests stub it. Binding early
    // silently bypasses both -- it broke `anon.test.ts`, which stubs the global
    // and then asserts on the recorded calls.
    const doFetch = baseFetch ?? globalThis.fetch
    const timeoutMs = supabaseTimeoutMs(env)
    const controller = new AbortController()

    // The caller's signal, if there is one, still has to work. Whichever fires
    // first aborts the request.
    const callerSignal = init?.signal
    if (callerSignal) {
      if (callerSignal.aborted) controller.abort(callerSignal.reason)
      else
        callerSignal.addEventListener('abort', () => controller.abort(callerSignal.reason), {
          once: true,
        })
    }

    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeoutMs)

    try {
      return await doFetch(input, { ...init, signal: controller.signal })
    } catch (err) {
      if (timedOut) {
        // Loud, because a Supabase timeout is a dependency being slow rather
        // than a bug in the query, and the two are indistinguishable in a
        // stack trace.
        log.error('supabase.timeout', {
          timeoutMs,
          url: typeof input === 'string' ? input.split('?')[0] : String(input).split('?')[0],
        })
        throw new SupabaseTimeoutError(timeoutMs)
      }
      throw err
    } finally {
      // Always, including the success path: an uncleared timer holds a
      // reference to the controller and keeps the event loop alive.
      clearTimeout(timer)
    }
  }
}

/** The shared instance every server-side client is built with. */
export const timeoutFetch: typeof fetch = createTimeoutFetch()
