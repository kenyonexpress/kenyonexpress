/**
 * P95 Latency Monitoring Cron
 * Runs every 15 minutes to check for sustained high-latency routes
 * Creates GitHub issues for performance investigation when needed
 * Requires CRON_SECRET authentication via Bearer token
 */

import { log } from '@/lib/observability/log'
import { sendNtfyAlert } from '@/lib/observability/ntfy-alert'
import {
  checkSustainedViolations,
  cleanupOldSamples,
  createPerformanceTicket,
} from '@/lib/observability/p95-monitor'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { bearerMatches } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

async function handleGET(request: NextRequest) {
  const startedAt = performance.now()

  // Verify cron authentication (constant-time; an unset secret closes the route)
  if (!bearerMatches(request.headers.get('authorization'), process.env.CRON_SECRET ?? '')) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      {
        status: 401,
        headers: { 'cache-control': 'no-store' },
      },
    )
  }

  try {
    // Check for sustained p95 violations
    const violations = await checkSustainedViolations()

    const admin = createAdminClient()
    const githubToken = process.env.GITHUB_TOKEN
    const githubRepo = process.env.GITHUB_REPO || 'kenyonexpress/kenyonexpress-web'

    let ticketsCreated = 0
    const createdIssues: string[] = []

    // Process each violation
    for (const violation of violations) {
      // Check if ticket already exists for this violation
      const { data: existingTicket, error: existingTicketError } = await admin
        .from('observability.perf_tickets')
        .select('*')
        .eq('endpoint_path', violation.endpoint_path)
        .eq('method', violation.method)
        .is('resolved_at', null)
        .limit(1)

      if (existingTicketError) {
        // Opening a second ticket for a violation that already has one is the
        // failure this guards against; try again on the next run.
        log.error('p95_monitor.ticket_lookup_failed', {
          endpoint: violation.endpoint_path,
          error: existingTicketError,
        })
        continue
      }

      if (existingTicket && existingTicket.length > 0) {
        // Update existing ticket with new observation
        await admin
          .from('observability.perf_tickets')
          .update({
            last_observed_at: new Date().toISOString(),
            p95_ms: violation.p95_ms,
            duration_minutes: violation.duration_minutes,
          })
          .eq('id', existingTicket[0].id)

        continue
      }

      // Create new GitHub issue
      if (githubToken) {
        const issueNum = await createPerformanceTicket(violation, githubToken, githubRepo)

        if (issueNum) {
          ticketsCreated++
          createdIssues.push(issueNum)

          // Record in database
          await admin.from('observability.perf_tickets').insert({
            endpoint_path: violation.endpoint_path,
            method: violation.method,
            p95_ms: violation.p95_ms,
            duration_minutes: violation.duration_minutes,
            github_issue_number: Number.parseInt(issueNum.replace('#', ''), 10),
            triggered_at: violation.started_at,
            last_observed_at: new Date().toISOString(),
          })

          // Send ntfy alert
          await sendNtfyAlert(
            {
              endpoint: violation.endpoint_path,
              method: violation.method,
              alertType: 'p95_exceeded',
              severity: 'critical',
              metricValue: violation.p95_ms,
              thresholdValue: 500,
              timestamp: new Date().toISOString(),
            },
            'ntfy.sh/kenyon-ofir-limit',
          )
        }
      }
    }

    // Clean up old samples (keep 30 days)
    await cleanupOldSamples(30)

    const duration = Math.round(performance.now() - startedAt)

    return NextResponse.json(
      {
        ok: true,
        violations_detected: violations.length,
        tickets_created: ticketsCreated,
        created_issues: createdIssues,
        duration_ms: duration,
        timestamp: new Date().toISOString(),
      },
      { headers: { 'cache-control': 'no-store' } },
    )
  } catch (err) {
    log.error('p95_monitor.error', { err })
    const message = err instanceof Error ? err.message : 'Unknown error'

    return NextResponse.json(
      {
        ok: false,
        error: message,
        timestamp: new Date().toISOString(),
      },
      {
        status: 500,
        headers: { 'cache-control': 'no-store' },
      },
    )
  }
}

export const GET = withRequestLog('/api/cron/p95-monitor', handleGET)
