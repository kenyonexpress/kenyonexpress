import { checkRateLimit, getClientIp } from '@/lib/utils/rate-limit'
import { NextResponse } from 'next/server'

/**
 * Per-IP ceiling for a public route handler. Returns the 429 to send back, or
 * null when the request may proceed. checkRateLimit fails open by design, so a
 * limiter outage degrades to the previous behaviour instead of breaking the route.
 */
export async function limitByIp(
  scope: string,
  maxRequests: number,
  windowSeconds: number,
): Promise<NextResponse | null> {
  const ip = await getClientIp()
  if (await checkRateLimit(`${scope}:${ip}`, maxRequests, windowSeconds)) return null
  return NextResponse.json(
    { error: 'rate_limited' },
    { status: 429, headers: { 'Retry-After': String(windowSeconds) } },
  )
}
