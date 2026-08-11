// The single scrubber (R39), alone in a module with no SDK import.
//
// sentry.server.config.ts, sentry.edge.config.ts and the payment helpers all
// need it, and the edge runtime cannot load @sentry/node. Keeping it here means
// one implementation rather than three that drift.

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
