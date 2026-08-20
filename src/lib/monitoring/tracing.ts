/**
 * Performance tracing: the sample rate, and the paths that never earn a trace.
 *
 * WHY THIS IS A MODULE AND NOT THREE `tracesSampleRate` LITERALS. The three
 * runtimes (browser, node, edge) each get their own `Sentry.init`, and a
 * literal in each is three chances to disagree about what is traced. Worse,
 * there is a FOURTH place that has to agree: `compiler.define` in
 * next.config.ts sets `__SENTRY_TRACING__`, which decides at build time whether
 * the span code is in the bundle at all. A sample rate the bundler has already
 * shaken the spans out from governs nothing, silently. One module, read by all
 * four.
 *
 * NO IMPORTS, DELIBERATELY. This is read from `sentry.edge.config.ts` (no Node
 * built-ins available), from `instrumentation-client.ts` (ships to the browser)
 * and from `next.config.ts` (runs in the bundler, before the app exists). Any
 * dependency here would have to be safe in all three.
 *
 * OFF BY DEFAULT, AND WHY THAT IS NOT A DISABLED FEATURE. Tracing is
 * high-volume by nature: every request becomes an event. The rate is therefore
 * a deployment decision rather than a source one, read from the environment, so
 * that turning it up on production does not need a code change and turning it
 * off during an incident does not need a deploy. Unset means 0, which is what
 * keeps `pnpm test`, CI and a laptop free of both cost and network calls.
 */

/**
 * The rate for the Node and edge runtimes, and for the bundler.
 *
 * WHY THE VARIABLE IS SPELLED OUT RATHER THAN INDEXED. `process.env[NAME]` is
 * not the same thing as `process.env.NAME` here. Next substitutes the literal
 * member expression at build time -- for the browser bundle it is the ONLY way
 * a value gets in at all, and the edge bundle is compiled the same way. An
 * indexed read survives type-checking, passes review, and resolves to
 * `undefined` in exactly the two runtimes that matter.
 */
export function serverTracesSampleRate(): number {
  return resolveSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE)
}

/**
 * The browser's rate. `NEXT_PUBLIC_` is not decoration: a non-public variable
 * is not in the client bundle at all, so the browser SDK would read undefined
 * and never sample.
 */
export function clientTracesSampleRate(): number {
  return resolveSampleRate(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE)
}

/**
 * Paths whose traces would be pure volume.
 *
 * A cron path is hit on a schedule forever and its duration is already recorded
 * by the job itself; `/api/health` is polled every thirty seconds by an uptime
 * monitor; `/monitoring` is the Sentry tunnel, so tracing it means tracing the
 * act of reporting, which is a loop. None of them is a customer waiting for a
 * page, and a trace budget spent on them is a trace budget not spent on
 * checkout.
 */
const UNTRACED_PREFIXES = ['/api/health', '/api/cron/', '/monitoring', '/_next/', '/favicon']

/**
 * Reads a rate from a raw environment string.
 *
 * Anything that is not a number in [0, 1] becomes 0 rather than throwing. A
 * typo in a sampling knob must not be able to stop a server from booting, and
 * `tracesSampleRate: NaN` is worse than off: the SDK compares against it and
 * every comparison with NaN is false, so it looks configured and samples
 * nothing.
 */
export function resolveSampleRate(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return 0
  const value = Number(raw)
  if (!Number.isFinite(value)) return 0
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value
}

/** True when a build or a runtime has tracing turned on at all. */
export function tracingEnabled(raw: string | undefined): boolean {
  return resolveSampleRate(raw) > 0
}

/**
 * Whether a path is worth a trace. Exported for the test, and used by the
 * sampler below.
 */
export function isTracedPath(path: string): boolean {
  return !UNTRACED_PREFIXES.some((prefix) => path.startsWith(prefix))
}

/**
 * The shape of what Sentry hands a `tracesSampler`, named structurally rather
 * than imported.
 *
 * `@sentry/nextjs` exports the real type, and importing it here would pull the
 * SDK into next.config.ts's module graph and into the edge bundle for the sake
 * of a type that erases at compile time. The two fields below are the ones this
 * sampler reads; the SDK's own object satisfies them.
 */
export type SamplingContext = {
  /** For an HTTP server span this is like `GET /api/health`. */
  name?: string
  attributes?: Record<string, unknown>
  /** Set when an upstream service already decided. */
  parentSampled?: boolean
}

/**
 * Builds the sampler for a given rate.
 *
 * WHY A SAMPLER AND NOT JUST A RATE. A flat rate samples the noise at the same
 * proportion as the checkout, so at 10% the traces that arrive are mostly cron
 * and health, and the one transaction anybody wants to look at is the one that
 * was probably dropped.
 *
 * `parentSampled` is honoured first and unconditionally: breaking a trace in
 * the middle produces two half-traces that nothing joins, which is worse than
 * either keeping or dropping the whole thing.
 */
export function makeTracesSampler(rate: number): (context: SamplingContext) => number {
  return (context) => {
    if (context.parentSampled !== undefined) return context.parentSampled ? 1 : 0

    const path = pathFromContext(context)
    if (path && !isTracedPath(path)) return 0

    return rate
  }
}

/**
 * The request path, from whichever field carries it.
 *
 * The span name is `GET /api/health` on a server transaction and a bare URL on
 * a browser pageload, and `http.route` / `url.path` are the OpenTelemetry
 * attributes the SDK sets when it has them. Reading all of them means the
 * sampler keeps working when a future SDK version stops filling in one.
 */
function pathFromContext(context: SamplingContext): string | null {
  const attributes = context.attributes ?? {}
  for (const key of ['http.route', 'url.path', 'http.target']) {
    const value = attributes[key]
    if (typeof value === 'string' && value.startsWith('/')) return value
  }

  const name = context.name
  if (!name) return null
  // `GET /api/health` -> `/api/health`; a bare `/api/health` is left alone.
  const spaced = name.indexOf(' ')
  const candidate = spaced === -1 ? name : name.slice(spaced + 1)
  return candidate.startsWith('/') ? candidate : null
}
