/**
 * P95 Latency Monitoring Module
 * Tracks p95 latency per route over 15-minute rolling windows
 * Detects sustained high-latency conditions and triggers perf investigations
 */

import { fetchWithTimeout } from '@/lib/http/fetch-with-timeout'
import { createAdminClient } from '@/lib/supabase/admin'
import { log } from './log'

export interface P95LatencySample {
  endpoint_path: string
  method: string
  p95_ms: number
  sample_time: string
}

export interface P95Violation {
  endpoint_path: string
  method: string
  p95_ms: number
  duration_minutes: number
  started_at: string
  sustained: boolean
}

/**
 * Record p95 latency sample for a route
 * Stores in a time-series optimized table
 */
export async function recordP95Sample(
  endpointPath: string,
  method: string,
  p95Ms: number,
): Promise<boolean> {
  try {
    const admin = createAdminClient()

    const { error } = await admin.from('observability.p95_latency_samples').insert({
      endpoint_path: endpointPath,
      method,
      p95_ms: p95Ms,
      sample_time: new Date().toISOString(),
    })

    if (error) {
      log.warn('p95_monitor.failed_to_record_sample', { error })
      return false
    }

    return true
  } catch (err) {
    log.error('p95_monitor.error_recording_p95_sample', { err })
    return false
  }
}

/**
 * Check for sustained p95 violations (>500ms for 15 minutes)
 * Returns list of routes with sustained high latency
 */
export async function checkSustainedViolations(): Promise<P95Violation[]> {
  try {
    const admin = createAdminClient()

    // Get all unique routes with recent samples
    const { data: routes, error: routesError } = await admin
      .from('observability.p95_latency_samples')
      .select('endpoint_path, method')
      .gte('sample_time', new Date(Date.now() - 15 * 60 * 1000).toISOString())

    if (routesError) {
      log.error('p95_monitor.failed_to_fetch_routes', { error: routesError })
      return []
    }

    const violations: P95Violation[] = []

    // Check each route for sustained violation
    if (routes) {
      for (const route of routes) {
        // Get p95 samples for the past 15 minutes
        const { data: samples, error: samplesError } = await admin
          .from('observability.p95_latency_samples')
          .select('p95_ms, sample_time')
          .eq('endpoint_path', route.endpoint_path)
          .eq('method', route.method)
          .gte('sample_time', new Date(Date.now() - 15 * 60 * 1000).toISOString())
          .order('sample_time', { ascending: true })

        if (samplesError) {
          log.warn('p95_monitor.failed_to_fetch_samples_for_route', { error: samplesError })
          continue
        }

        if (!samples || samples.length === 0) continue

        // Check if all samples exceed 500ms
        const allViolated = samples.every((s) => s.p95_ms > 500)

        if (allViolated && samples.length >= 3) {
          // At least 3 samples over 15 minutes indicates sustained condition
          const firstSampleTime = samples[0]?.sample_time
          const lastSampleTime = samples[samples.length - 1]?.sample_time

          if (firstSampleTime && lastSampleTime) {
            const firstSample = new Date(firstSampleTime)
            const lastSample = new Date(lastSampleTime)
            const durationMinutes = Math.round(
              (lastSample.getTime() - firstSample.getTime()) / 60000,
            )

            if (durationMinutes >= 15) {
              violations.push({
                endpoint_path: route.endpoint_path,
                method: route.method,
                p95_ms: Math.round(samples.reduce((sum, s) => sum + s.p95_ms, 0) / samples.length),
                duration_minutes: durationMinutes,
                started_at: firstSampleTime,
                sustained: true,
              })
            }
          }
        }
      }
    }

    return violations
  } catch (err) {
    log.error('p95_monitor.error_checking_violations', { err })
    return []
  }
}

/**
 * Get recent p95 samples for a route (last 24 hours)
 */
export async function getP95Samples(
  endpointPath: string,
  method: string,
  limitMinutes = 1440,
): Promise<P95LatencySample[]> {
  try {
    const admin = createAdminClient()

    const { data, error } = await admin
      .from('observability.p95_latency_samples')
      .select('endpoint_path, method, p95_ms, sample_time')
      .eq('endpoint_path', endpointPath)
      .eq('method', method)
      .gte('sample_time', new Date(Date.now() - limitMinutes * 60 * 1000).toISOString())
      .order('sample_time', { ascending: false })

    if (error) {
      log.error('p95_monitor.failed_to_fetch_samples', { error })
      return []
    }

    return (data || []) as P95LatencySample[]
  } catch (err) {
    log.error('p95_monitor.error_fetching_samples', { err })
    return []
  }
}

/**
 * Get summary statistics for p95 latency
 */
async function getP95Statistics(
  endpointPath: string,
  method: string,
  limitMinutes = 1440,
): Promise<{
  min_ms: number
  max_ms: number
  avg_ms: number
  sample_count: number
} | null> {
  try {
    const admin = createAdminClient()

    const { data, error } = await admin.rpc('observability.get_p95_stats', {
      p_endpoint_path: endpointPath,
      p_method: method,
      p_limit_minutes: limitMinutes,
    })

    if (error) {
      log.error('p95_monitor.failed_to_fetch_statistics', { error })
      return null
    }

    return data as {
      min_ms: number
      max_ms: number
      avg_ms: number
      sample_count: number
    } | null
  } catch (err) {
    log.error('p95_monitor.error_fetching_statistics', { err })
    return null
  }
}

/**
 * Create a GitHub issue for performance investigation
 * Called when sustained p95 violation is detected
 */
export async function createPerformanceTicket(
  violation: P95Violation,
  githubToken: string,
  githubRepo: string,
): Promise<string | null> {
  try {
    const [owner, repo] = githubRepo.split('/')

    const title = `🚀 Performance Alert: ${violation.endpoint_path} p95 latency sustained at ${violation.p95_ms}ms`

    const body = `## Performance Investigation Required

**Route:** \`${violation.method} ${violation.endpoint_path}\`
**P95 Latency:** ${violation.p95_ms}ms
**Duration:** ${violation.duration_minutes} minutes
**Started:** ${new Date(violation.started_at).toISOString()}

### Details
This route has sustained p95 latency above 500ms for the entire 15-minute monitoring window, indicating a systemic performance degradation.

### Investigation Steps
1. Review recent deployments to this endpoint
2. Check database query performance (slow logs)
3. Verify upstream service latency (Supabase, payment providers, etc.)
4. Monitor resource utilization (CPU, memory, disk I/O)
5. Check for connection pool exhaustion
6. Review error rates alongside latency

### Remediation
- If new deployment caused regression, consider rollback
- If data-driven, optimize queries or implement caching
- If upstream service issue, contact provider or implement retry logic
- If resource-constrained, scale infrastructure

**Auto-generated by kenyon-loop.sh observability monitor**
`

    const labels = ['perf', 'auto-generated', 'p95-monitor']

    const response = await fetchWithTimeout(
      `https://api.github.com/repos/${owner}/${repo}/issues`,
      {
        method: 'POST',
        headers: {
          Authorization: `token ${githubToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/vnd.github.v3+json',
        },
        body: JSON.stringify({
          title,
          body,
          labels,
        }),
      },
    )

    if (!response.ok) {
      log.error('p95_monitor.failed_to_create_github_issue', { detail: response.statusText })
      return null
    }

    const issue = (await response.json()) as { number: number }

    return `#${issue.number}`
  } catch (err) {
    log.error('p95_monitor.error_creating_github_issue', { err })
    return null
  }
}

/**
 * Clean up old p95 samples (keep only last 30 days)
 */
export async function cleanupOldSamples(daysToKeep = 30): Promise<boolean> {
  try {
    const admin = createAdminClient()

    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000)

    const { error } = await admin
      .from('observability.p95_latency_samples')
      .delete()
      .lt('sample_time', cutoffDate.toISOString())

    if (error) {
      log.warn('p95_monitor.failed_to_cleanup_old_samples', { error })
      return false
    }

    return true
  } catch (err) {
    log.error('p95_monitor.error_cleaning_up_samples', { err })
    return false
  }
}
