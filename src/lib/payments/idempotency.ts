/** Canonical Stripe PaymentIntent idempotency key (ADR-006). */
export function paymentAttemptIdempotencyKey(paymentAttemptId: string): string {
  return `pi:${paymentAttemptId}`
}

export function refundIdempotencyKey(paymentAttemptId: string, suffix = 'full'): string {
  return `re:${paymentAttemptId}:${suffix}`
}
