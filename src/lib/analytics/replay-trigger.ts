/**
 * "Buggy session" signals, the third gate on session replay.
 *
 * The recorder (components/analytics/PostHogReplay.tsx) used to run for the
 * whole visit once the shopper had consented and opted in. That records a lot
 * of ordinary shopping to find the one minute that went wrong. Now the SDK is
 * mounted under the same two gates but RECORDING starts only when the page
 * says something broke: an uncaught error, an unhandled promise rejection, or
 * a React error boundary rendering. From that moment the rest of the session
 * is recorded, and the flag survives navigations and reloads within the tab
 * (sessionStorage) so a "retry" after the error is on tape too.
 *
 * What is lost on purpose: the seconds BEFORE the first error. posthog-js can
 * buffer those when a trigger is configured remotely in the project, but a
 * remote setting is one more thing that can silently be absent, and a
 * recorder that only starts after an explicit local signal is the version of
 * "buggy sessions only" that holds without checking a dashboard.
 *
 * Everything here is best effort and never throws: it runs inside error
 * handlers, where a second failure would hide the first.
 */

export const BUGGY_SESSION_EVENT = 'ke:session-buggy'

/** sessionStorage key; the value is the reason the session was first flagged. */
export const BUGGY_SESSION_STORAGE_KEY = 'ke_replay_buggy'

export const BUG_SIGNAL_REASONS = [
  'uncaught_error',
  'unhandled_rejection',
  'error_boundary',
  'global_error_boundary',
] as const
export type BugSignalReason = (typeof BUG_SIGNAL_REASONS)[number]

export function isBugSignalReason(value: unknown): value is BugSignalReason {
  return typeof value === 'string' && (BUG_SIGNAL_REASONS as readonly string[]).includes(value)
}

/**
 * The noise Sentry already ignores (instrumentation-client.ts), kept in step:
 * a browser extension throwing inside the page or Chrome's two ResizeObserver
 * messages are not the site breaking, and a recording of them would be
 * exactly the ordinary shopping this gate exists to avoid.
 */
const IGNORED_MESSAGES = [
  'ResizeObserver loop limit exceeded',
  'ResizeObserver loop completed with undelivered notifications',
]
const IGNORED_SOURCES = [/^chrome-extension:\/\//, /^moz-extension:\/\//, /^safari-extension:\/\//]

export function isIgnorableError(
  message: string | null | undefined,
  source?: string | null,
): boolean {
  if (message && IGNORED_MESSAGES.some((noise) => message.includes(noise))) return true
  if (source && IGNORED_SOURCES.some((pattern) => pattern.test(source))) return true
  return false
}

/** The reason this tab was flagged, or null when nothing has gone wrong yet. */
export function readBuggySession(): BugSignalReason | null {
  if (typeof window === 'undefined') return null
  try {
    const stored = window.sessionStorage.getItem(BUGGY_SESSION_STORAGE_KEY)
    return isBugSignalReason(stored) ? stored : null
  } catch {
    return null
  }
}

/**
 * Flags the session and tells a mounted recorder. Idempotent: the first
 * reason sticks (it is the one that explains the recording), and a repeat
 * signal still dispatches so a recorder mounted after the flag was set can
 * react, but it does not rewrite the reason.
 *
 * Returns the reason now on record, or null when there is no window.
 */
export function markSessionBuggy(reason: BugSignalReason): BugSignalReason | null {
  if (typeof window === 'undefined') return null
  let recorded: BugSignalReason = reason
  try {
    const existing = readBuggySession()
    if (existing) recorded = existing
    else window.sessionStorage.setItem(BUGGY_SESSION_STORAGE_KEY, reason)
  } catch {
    // Storage blocked: the recorder still hears the event for this page; the
    // flag just will not survive a reload.
  }
  try {
    window.dispatchEvent(new CustomEvent(BUGGY_SESSION_EVENT, { detail: { reason: recorded } }))
  } catch {
    // Dispatch failing must not surface inside an error handler.
  }
  return recorded
}

/** Clears the flag; only tests and a support "stop recording" should need it. */
export function clearBuggySession(): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(BUGGY_SESSION_STORAGE_KEY)
  } catch {
    // Nothing to clear where nothing could be stored.
  }
}

/**
 * The global listeners. Bound once by the recorder component (the only
 * consumer that needs them, and only after both consent gates pass, so a
 * visitor who declined pays for no listener at all). Returns the unbind.
 */
export function bindBugSignals(target: Window = window): () => void {
  const onError = (event: ErrorEvent) => {
    if (isIgnorableError(event.message, event.filename)) return
    markSessionBuggy('uncaught_error')
  }
  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason
    const message =
      reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : null
    if (isIgnorableError(message)) return
    markSessionBuggy('unhandled_rejection')
  }
  target.addEventListener('error', onError)
  target.addEventListener('unhandledrejection', onRejection)
  return () => {
    target.removeEventListener('error', onError)
    target.removeEventListener('unhandledrejection', onRejection)
  }
}
