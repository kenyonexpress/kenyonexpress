import * as Sentry from '@sentry/node'

/**
 * Sentry, scoped to the money path.
 *
 * Deliberately narrow. The whole value of an alert on this path is that it is
 * rare and always means a customer was charged and something afterwards went
 * wrong, so this reports payment and redemption failures rather than every
 * caught exception in the app. A channel that also carries render errors from
 * the catalogue is a channel nobody reads.
 *
 * Entirely inert without SENTRY_DSN: `init` is skipped, every capture returns
 * immediately, and nothing is queued. That is what keeps tests, CI and local
 * dev free of both network calls and configuration ceremony.
 */

const DSN = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN

/**
 * Keys whose values must never leave the server. `cardcom_token` is a
 * chargeable instrument, `webhook_secret` authenticates callbacks, and the
 * JWT/service keys are total account access. Matched by substring so
 * `p_idempotency_key` and `CARDCOM_API_PASSWORD` are caught by the same rule.
 */
const REDACT_PATTERNS = [
  'token',
  'secret',
  'password',
  'authorization',
  'cookie',
  // Deliberately the bare word rather than 'api_key'. It also catches
  // `idempotency_key`, which is not itself a credential - but the cost of
  // losing one from an error report is nothing, and the cost of a field named
  // `*_key` being added later and quietly shipping out is a great deal more.
  'key',
  'card',
  'cvv',
  'jwt',
]

function shouldRedact(key: string): boolean {
  const lower = key.toLowerCase()
  return REDACT_PATTERNS.some((pattern) => lower.includes(pattern))
}

/**
 * Recursive redaction. Depth-limited because an unbounded walk over an
 * attacker-influenced payload is its own denial of service, and because the
 * Cardcom `raw` blobs that end up in these contexts are shallow anyway.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[truncated]'
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((entry) => redact(entry, depth + 1))

  const output: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    output[key] = shouldRedact(key) ? '[redacted]' : redact(entry, depth + 1)
  }
  return output
}

let initialised = false

/** Called once from instrumentation.register(). Safe to call again. */
export function initSentry(): void {
  if (initialised || !DSN) return
  initialised = true

  Sentry.init({
    dsn: DSN,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    // The money path is low-volume by nature; sampling it would mean losing
    // the one event that mattered. Performance tracing stays off, since that
    // IS high-volume and is not what this is for.
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request?.headers) event.request.headers = {}
      if (event.request?.cookies) event.request.cookies = {}
      if (event.extra) event.extra = redact(event.extra) as Record<string, unknown>
      if (event.contexts?.payment) {
        event.contexts.payment = redact(event.contexts.payment) as Record<string, unknown>
      }
      return event
    },
  })
}

export type PaymentErrorContext = {
  /** Where in the money path this happened, e.g. 'cardcom_webhook'. */
  stage: string
  orderId?: string | null
  paymentId?: string | null
  voucherId?: string | null
  /** Anything else worth seeing. Redacted before it leaves the process. */
  detail?: Record<string, unknown>
}

/**
 * Reports a failure on the money path. Never throws and never rejects: an
 * error in the reporting of an error must not become the error the customer
 * sees, and every call site here is already on a failure branch.
 */
export function capturePaymentError(error: unknown, context: PaymentErrorContext): void {
  if (!DSN) return
  try {
    Sentry.withScope((scope) => {
      scope.setTag('area', 'payments')
      scope.setTag('stage', context.stage)
      if (context.orderId) scope.setTag('order_id', context.orderId)
      scope.setContext('payment', {
        stage: context.stage,
        order_id: context.orderId ?? null,
        payment_id: context.paymentId ?? null,
        voucher_id: context.voucherId ?? null,
        ...((redact(context.detail ?? {}) as Record<string, unknown>) ?? {}),
      })
      scope.setLevel('error')
      Sentry.captureException(error instanceof Error ? error : new Error(String(error)))
    })
  } catch {
    // Reporting is best effort by definition.
  }
}

/**
 * A money-path condition that is not an exception but still must not pass
 * silently: an amount that does not match, a verification that came back
 * negative for a payment we believe succeeded.
 */
export function capturePaymentAlarm(message: string, context: PaymentErrorContext): void {
  if (!DSN) return
  try {
    Sentry.withScope((scope) => {
      scope.setTag('area', 'payments')
      scope.setTag('stage', context.stage)
      if (context.orderId) scope.setTag('order_id', context.orderId)
      scope.setContext('payment', {
        stage: context.stage,
        order_id: context.orderId ?? null,
        payment_id: context.paymentId ?? null,
        voucher_id: context.voucherId ?? null,
        ...((redact(context.detail ?? {}) as Record<string, unknown>) ?? {}),
      })
      Sentry.captureMessage(message, 'error')
    })
  } catch {
    // Best effort.
  }
}
