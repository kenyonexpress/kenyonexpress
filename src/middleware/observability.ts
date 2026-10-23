/**
 * Middleware to track endpoint metrics and performance
 * Records response times and status codes for all API routes
 * This middleware runs on all requests and feeds data into observability system
 */

import { log } from '@/lib/observability/log'
import { recordEndpointMetric } from '@/lib/observability/metrics'
import type { NextResponse } from 'next/server'

/**
 * Records endpoint metrics for monitoring and alerting
 * Called via x-observability-track header in API responses
 */
export async function recordMetrics(
  endpoint: string,
  method: string,
  responseTimeMs: number,
  statusCode: number,
) {
  // Fire and forget - don't block request
  recordEndpointMetric(endpoint, method, responseTimeMs, statusCode).catch((err) => {
    log.error('middleware.failed_to_record_metric', { err })
  })
}

/**
 * Helper to measure request duration
 */
export function createTimingHelper() {
  const startTime = performance.now()

  return {
    getDuration: () => Math.round(performance.now() - startTime),
    recordMetric: (endpoint: string, method: string, statusCode: number) => {
      const duration = Math.round(performance.now() - startTime)
      recordMetrics(endpoint, method, duration, statusCode)
    },
  }
}

/**
 * Response wrapper that adds timing header
 */
export function addTimingHeader(response: NextResponse, durationMs: number) {
  response.headers.set('X-Response-Time-Ms', String(durationMs))
  return response
}
