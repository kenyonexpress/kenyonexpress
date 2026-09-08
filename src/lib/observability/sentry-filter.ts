/**
 * Who may report to Sentry, and what is not worth reporting.
 *
 * This project's Sentry is deliberately narrow. `sentry.ts` puts it plainly:
 * "the whole value of an alert on this path is that it is rare and always means
 * a customer was charged and something afterwards went wrong", and "a channel
 * that also carries render errors from the catalogue is a channel nobody
 * reads". Two things were quietly undoing that.
 *
 * MEASURED 2026-09-08. A new issue arrived at 42 events in 41 minutes:
 * `Error: The destination stream closed early`, from
 * `PassThrough` inside Next's app-page turbo runtime. Its tags say what it was:
 * `environment: development`, `server_name: MacBook-Air.local`, a stack path
 * under /Users/ofir/, `POST /product/<slug>` with
 * `render_source: react-server-components-payload`. It was this laptop's own
 * Playwright sweeps, aborting RSC streams as the browser moved on.
 *
 * So a developer machine was filling the money-path channel, and the header of
 * sentry.server.config.ts said that could not happen - "inert without
 * SENTRY_DSN ... local development makes no network call" - which is true only
 * while the DSN is unset, and .env.local sets it.
 */

/** Environment names that mean "someone's machine", not a deployment. */
const LOCAL_ENVIRONMENTS = new Set(['development', 'test', 'local'])

/**
 * A stream that ended because the CLIENT went away.
 *
 * Not a defect at either end: a visitor who navigates mid-stream, closes the
 * tab, or whose connection drops produces exactly this, and there is nothing to
 * fix and no one to tell. It is listed by exact message rather than by pattern
 * so that a genuinely new streaming failure still reports.
 */
const CLIENT_DISCONNECT_MESSAGES = [
  'The destination stream closed early.',
  'The destination stream closed early',
]

/**
 * Whether this process should send events at all.
 *
 * @param options.dsn the configured DSN, if any
 * @param options.environment the resolved Sentry environment
 * @param options.allowLocal explicit opt-in, for debugging the reporting itself
 */
export function shouldReportToSentry(options: {
  dsn?: string | undefined
  environment?: string | undefined
  allowLocal?: string | undefined
}): boolean {
  if (!options.dsn) return false
  if (options.allowLocal === 'true') return true
  return !LOCAL_ENVIRONMENTS.has((options.environment ?? 'development').toLowerCase())
}

/** Whether an event is a client disconnect and should be dropped. */
export function isClientDisconnect(message: string | undefined | null): boolean {
  if (!message) return false
  return CLIENT_DISCONNECT_MESSAGES.includes(message.trim())
}
