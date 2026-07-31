import * as Sentry from '@sentry/nextjs'
import { redact } from './scrub'

// Re-exported so the scrubber keeps its existing test and its existing callers
// after moving to scrub.ts, where the edge runtime can also reach it.
export { redact }

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
 * Kept as a no-op so existing callers do not break.
 *
 * Initialisation moved to sentry.server.config.ts / sentry.edge.config.ts,
 * which instrumentation.ts loads per runtime. Calling Sentry.init() a second
 * time from application code would replace the configured client and silently
 * drop the scrubber with it.
 */
export function initSentry(): void {}

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
