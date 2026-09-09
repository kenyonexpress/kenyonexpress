import { runReadyChecks } from '@/lib/health/ready'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { NextResponse } from 'next/server'

/**
 * Readiness for a load balancer or a deploy gate.
 *
 * Distinct from `/api/health`, which is liveness plus one database probe.
 * This one answers whether the five named dependencies are reachable or at
 * least honestly unconfigured. 503 only when something is `down`.
 *
 * Never cached, never verbose. A cached ready check is a lie with a timestamp,
 * and a detailed one is a public inventory of the stack.
 */
async function handleGET() {
  const report = await runReadyChecks()
  return NextResponse.json(report, {
    status: report.ok ? 200 : 503,
    headers: { 'cache-control': 'no-store' },
  })
}

export const GET = withRequestLog('/api/ready', handleGET)
