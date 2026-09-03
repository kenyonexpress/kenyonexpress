import { isAxiomEnabled, shipAxiomEvent } from './axiom'
import { getRequestContext } from './request-context'
import { redact } from './scrub'

/**
 * Structured logging. One JSON object per line, correlated by request id.
 *
 * WHAT THIS REPLACES, AND WHY IT WAS NOT ENOUGH. The 34 call sites this took
 * over were `console.error('search DLQ insert failed:', error.message)` and
 * `console.error('[supplier] getSupplierSales', ...)`: eight different ad-hoc
 * prefix conventions, a free-text message that a log drain can only grep, and
 * -- the part that actually cost something -- no way to tell which lines came
 * from the same request. A checkout that half-fails writes from the webhook,
 * from the voucher email and from the settlement recorder, in three modules
 * that never learn each other's names, interleaved with every other request the
 * process is serving. Grouping them was a guess about timestamps.
 *
 * WHY console AND NOT process.stdout. `process.stdout` does not exist on the
 * edge runtime, and `src/proxy.ts` runs there under some deployments. console
 * is the one sink both runtimes have, and it is what Vercel's log drain reads;
 * `console.error` is also what marks a line as an error there, which is why the
 * level chooses the method rather than only filling in a field.
 *
 * WHY EVERY FIELD GOES THROUGH redact(). These call sites pass Supabase error
 * objects and webhook payloads straight in. `scrub.ts` already owns the list of
 * key substrings that must never leave the process, and reusing it means the
 * logger cannot drift from what Sentry redacts (SEC-SCRUB).
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const SEVERITY: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

/**
 * Read once, at module load. A per-call `process.env` lookup on a path that
 * every request touches buys nothing: the variable cannot change inside a
 * running process.
 */
function configuredThreshold(): number {
  const configured = process.env.LOG_LEVEL?.toLowerCase()
  if (configured && configured in SEVERITY) return SEVERITY[configured as LogLevel]
  return SEVERITY.info
}

const THRESHOLD = configuredThreshold()

/** A stack is worth having and is not worth 40 frames of framework internals. */
const MAX_STACK = 2000

type Fields = Record<string, unknown>

function serializeError(error: Error): Fields {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack ? error.stack.slice(0, MAX_STACK) : undefined,
    // Server Component errors carry no message worth reading; `digest` is the
    // only handle that ties one to its Sentry event, so it is preserved by name.
    digest: (error as Error & { digest?: string }).digest,
  }
}

/**
 * Errors first, then redaction. An Error has no enumerable own properties, so
 * handing one to `redact()` directly yields `{}` -- the failure would be logged
 * as the absence of a failure.
 */
function normalize(fields: Fields): Fields {
  const output: Fields = {}
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue
    output[key] = value instanceof Error ? serializeError(value) : value
  }
  return (redact(output) as Fields) ?? {}
}

function emit(level: LogLevel, event: string, fields: Fields): void {
  if (SEVERITY[level] < THRESHOLD) return

  try {
    const context = getRequestContext()
    const entry = {
      ts: new Date().toISOString(),
      level,
      // The one required field, and the reason this is not a message string:
      // `voucher.redeem_failed` is something a drain can alert on, count and
      // chart. "redeem_voucher rpc failed:" is something it can only grep.
      event,
      request_id: context?.requestId ?? null,
      route: context?.route,
      method: context?.method,
      ...normalize(fields),
    }
    const line = JSON.stringify(entry)

    if (level === 'error') console.error(line)
    else if (level === 'warn') console.warn(line)
    else console.log(line)

    // The Axiom leg (marathon step 14): the SAME redacted entry, shipped
    // fire-and-forget. Inert without AXIOM_TOKEN/AXIOM_DATASET; nothing here
    // is awaited or allowed to throw, so the console transport above remains
    // the source of truth and this is strictly additive.
    if (isAxiomEnabled()) void shipAxiomEvent(entry)
  } catch {
    // A logger that throws turns a handled failure into an unhandled one, and
    // every error call site here is already on a failure branch. JSON.stringify
    // on a circular Supabase client would do exactly that.
  }
}

export const log = {
  debug: (event: string, fields: Fields = {}) => emit('debug', event, fields),
  info: (event: string, fields: Fields = {}) => emit('info', event, fields),
  warn: (event: string, fields: Fields = {}) => emit('warn', event, fields),
  error: (event: string, fields: Fields = {}) => emit('error', event, fields),
}
