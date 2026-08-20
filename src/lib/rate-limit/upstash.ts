import { log } from '@/lib/observability/log'

/**
 * The Upstash transport, over the REST API and over nothing else.
 *
 * WHY NO `@upstash/redis` PACKAGE. Not an aesthetic. This branch is a git
 * worktree whose `node_modules` is a SYMLINK to the main checkout's
 * (`ke-<name>/node_modules -> kenyonexpress/node_modules`, measured on
 * `ke-auth-wave`), so a `pnpm add` here rewrites the store the main checkout
 * and every other live worktree are reading. The SDK is a typed wrapper around
 * exactly the two HTTP calls below; writing them costs less than that blast
 * radius. If the dependency is ever added deliberately, `command()` is the only
 * function that has to change.
 *
 * WHY REST AND NOT A TCP CLIENT. `src/proxy.ts` runs on the edge runtime under
 * some deployments, and the edge runtime has no TCP sockets. `fetch` is the one
 * transport both runtimes have, which is the same reason `log.ts` writes
 * through `console` rather than `process.stdout`.
 */

/** Upstash answers `{"result": ...}` or `{"error": "..."}`, never both. */
type UpstashResponse = { result?: unknown; error?: string }

export type UpstashConfig = {
  url: string
  token: string
  timeoutMs: number
}

/**
 * A limiter that hangs is worse than a limiter that is off: it holds the
 * request open instead of answering it. One second is well past Upstash's
 * single-digit-millisecond p99 from a Vercel region and well under any timeout
 * a user would notice.
 */
const DEFAULT_TIMEOUT_MS = 1000

function positiveIntOr(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

/**
 * Read per call, not once at module load.
 *
 * `log.ts` caches `LOG_LEVEL` at import time and says why: the variable cannot
 * change inside a running process. That reasoning does NOT carry here, because
 * the tests for this module set and unset the two variables between cases to
 * exercise the configured and unconfigured paths, and a module-load cache would
 * make the first test to import decide the result of all the others. The read
 * is three property lookups on an object that is already in memory.
 */
export function upstashConfig(env: NodeJS.ProcessEnv = process.env): UpstashConfig | null {
  const url = env.UPSTASH_REDIS_REST_URL?.trim()
  const token = env.UPSTASH_REDIS_REST_TOKEN?.trim()
  if (!url || !token) return null
  return {
    url: url.replace(/\/+$/, ''),
    token,
    timeoutMs: positiveIntOr(env.UPSTASH_REDIS_REST_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
  }
}

export function isUpstashConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return upstashConfig(env) !== null
}

/** Thrown for every failure mode so the caller has one thing to catch. */
export class UpstashError extends Error {
  constructor(
    message: string,
    readonly kind: 'transport' | 'timeout' | 'redis' | 'protocol',
  ) {
    super(message)
    this.name = 'UpstashError'
  }
}

/**
 * Send one Redis command as `["EVAL", script, "1", key, ...]` and return the
 * decoded `result`.
 *
 * Every argument is sent as a string. Upstash's REST protocol has no integer
 * type on the way in — a JSON number and its decimal string arrive at Redis
 * identically — and stringifying here means the Lua script's `tonumber()` calls
 * are the single place a value becomes a number.
 */
export async function command(config: UpstashConfig, args: readonly string[]): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(config.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(config.timeoutMs),
      // Next fetch-patches this global and caches by default. A rate limit
      // counter served from a cache is not a rate limit counter.
      cache: 'no-store',
    })
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError'
    throw new UpstashError(
      error instanceof Error ? error.message : String(error),
      timedOut ? 'timeout' : 'transport',
    )
  }

  if (!response.ok) {
    // The body carries Upstash's reason (a bad token answers 401 with one), and
    // it is the only thing that distinguishes a misconfiguration from an
    // outage. Bounded, because it is going into a log line.
    const detail = await response.text().catch(() => '')
    throw new UpstashError(`HTTP ${response.status} ${detail.slice(0, 200)}`.trim(), 'transport')
  }

  let body: UpstashResponse
  try {
    body = (await response.json()) as UpstashResponse
  } catch (error) {
    throw new UpstashError(error instanceof Error ? error.message : String(error), 'protocol')
  }

  if (typeof body.error === 'string') throw new UpstashError(body.error, 'redis')
  return body.result
}

/**
 * The same call, reporting failure as `null` instead of throwing, for the one
 * caller that treats any failure identically.
 */
export async function tryCommand(
  config: UpstashConfig,
  args: readonly string[],
  event: string,
): Promise<unknown | null> {
  try {
    return await command(config, args)
  } catch (error) {
    log.error(event, {
      reason: error instanceof Error ? error.message : String(error),
      kind: error instanceof UpstashError ? error.kind : 'unknown',
    })
    return null
  }
}
