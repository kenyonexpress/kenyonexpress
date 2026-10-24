/**
 * The caller address for a route handler that already holds the Request.
 *
 * Same read, and the same trust assumption, as `getClientIp` in
 * `lib/utils/rate-limit.ts` (see the warning there: the header is an identity
 * only because Vercel's proxy overwrites it). This variant takes the Request
 * rather than calling `headers()`, so a handler stays callable outside a Next
 * request scope, which is how every route test invokes one.
 */
export function requestIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  return forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'
}
