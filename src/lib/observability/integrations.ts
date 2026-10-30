import { fetchWithTimeout } from '@/lib/http/fetch-with-timeout'
import { log } from './log'

/**
 * Real integration layer for Sentry, PostHog, Axiom, and Vercel Analytics
 * Fetches actual observability data from external APIs
 */

export interface SentryStats {
  totalEvents: number
  errorRate: number
  criticalErrors: number
}

export interface PostHogStats {
  activeUsers: number
  conversionRate: number
  eventVolume: number
}

export interface AxiomStats {
  logVolume: number
  avgLogLatency: number
  errorLogs: number
}

export interface VercelStats {
  deployments: number
  avgResponseTime: number
  bandwidth: number
}

export interface UnifiedObservability {
  sentry: SentryStats | null
  posthog: PostHogStats | null
  axiom: AxiomStats | null
  vercel: VercelStats | null
}

/**
 * Fetch Sentry error statistics via Sentry API
 * Requires: SENTRY_AUTH_TOKEN environment variable
 */
export async function fetchSentryStats(): Promise<SentryStats | null> {
  try {
    const sentryToken = process.env.SENTRY_AUTH_TOKEN
    const sentryOrg = process.env.NEXT_PUBLIC_SENTRY_ORG || 'kenyonexpress'
    const sentryProject = process.env.NEXT_PUBLIC_SENTRY_PROJECT || 'kenyonexpress'

    if (!sentryToken) {
      log.warn('integrations.sentry_auth_token_not_configured_skipping')
      return null
    }

    // Fetch from Sentry API: stats for last 24 hours
    const response = await fetchWithTimeout(
      `https://sentry.io/api/0/projects/${sentryOrg}/${sentryProject}/stats/`,
      {
        headers: { Authorization: `Bearer ${sentryToken}` },
      },
    )

    if (!response.ok) {
      log.error('integrations.sentry_api_error', { status: response.status })
      return null
    }

    // Parse stats (Sentry returns array of [timestamp, count] pairs)
    const data = (await response.json()) as Array<[number, number]>
    const totalEvents = data.reduce((sum, [, count]) => sum + count, 0)

    // Fetch error rate from issues
    const issuesResponse = await fetchWithTimeout(
      `https://sentry.io/api/0/projects/${sentryOrg}/${sentryProject}/issues/`,
      {
        headers: { Authorization: `Bearer ${sentryToken}` },
      },
    )

    if (!issuesResponse.ok) {
      return {
        totalEvents,
        errorRate: 0,
        criticalErrors: 0,
      }
    }

    const issues = (await issuesResponse.json()) as Array<{ id: string; level?: string }>
    const criticalCount = issues.filter((i) => i.level === 'fatal' || i.level === 'error').length

    return {
      totalEvents,
      errorRate: totalEvents > 0 ? (criticalCount / totalEvents) * 100 : 0,
      criticalErrors: criticalCount,
    }
  } catch (err) {
    log.error('integrations.failed_to_fetch_sentry_stats', { err })
    return null
  }
}

/**
 * Fetch PostHog analytics via PostHog API
 * Requires: POSTHOG_API_TOKEN environment variable
 */
export async function fetchPostHogStats(): Promise<PostHogStats | null> {
  try {
    const phToken = process.env.POSTHOG_API_TOKEN
    const phHost = process.env.POSTHOG_HOST || 'https://us.posthog.com'

    if (!phToken) {
      log.warn('integrations.posthog_api_token_not_configured_skipping')
      return null
    }

    // Fetch insights from PostHog
    const response = await fetchWithTimeout(`${phHost}/api/projects/current/insights/?limit=10`, {
      headers: {
        Authorization: `Bearer ${phToken}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      log.error('integrations.posthog_api_error', { status: response.status })
      return null
    }

    const data = (await response.json()) as {
      results?: Array<{ name?: string; result?: Array<{ data?: number }> }>
    }
    const results = data.results || []

    // Extract metrics from insights
    let eventVolume = 0
    let activeUsers = 0

    for (const insight of results) {
      if (insight.name?.toLowerCase().includes('events')) {
        const result = insight.result?.[0]?.data
        if (result) eventVolume += result
      }
      if (
        insight.name?.toLowerCase().includes('users') ||
        insight.name?.toLowerCase().includes('active')
      ) {
        const result = insight.result?.[0]?.data
        if (result) activeUsers += result
      }
    }

    return {
      activeUsers,
      conversionRate: eventVolume > 0 ? (activeUsers / eventVolume) * 100 : 0,
      eventVolume,
    }
  } catch (err) {
    log.error('integrations.failed_to_fetch_posthog_stats', { err })
    return null
  }
}

/**
 * Fetch Axiom structured logs via Axiom API
 * Requires: AXIOM_TOKEN and AXIOM_DATASET environment variables
 */
export async function fetchAxiomStats(): Promise<AxiomStats | null> {
  try {
    const axiomToken = process.env.AXIOM_TOKEN
    const axiomDataset = process.env.AXIOM_DATASET

    if (!axiomToken || !axiomDataset) {
      log.warn('integrations.axiom_token_or_axiom_dataset_not')
      return null
    }

    // Query Axiom for error logs in last hour
    const response = await fetchWithTimeout('https://api.axiom.co/v1/datasets/query', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${axiomToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        apl: `[${axiomDataset}] | where severity == "error" or severity == "fatal" | stats count() as error_count, avg(_time) as avg_latency`,
        startTime: new Date(Date.now() - 3600000).toISOString(),
        endTime: new Date().toISOString(),
      }),
    })

    if (!response.ok) {
      log.error('integrations.axiom_api_error', { status: response.status })
      return null
    }

    const data = (await response.json()) as {
      matches?: Array<{ _time?: number; error_count?: number; avg_latency?: number }>
    }
    const matches = data.matches || []

    const errorLogs = matches.reduce((sum, m) => sum + (m.error_count || 0), 0)
    const avgLatency =
      matches.length > 0
        ? matches.reduce((sum, m) => sum + (m.avg_latency || 0), 0) / matches.length
        : 0

    return {
      logVolume: matches.length,
      avgLogLatency: Math.round(avgLatency),
      errorLogs,
    }
  } catch (err) {
    log.error('integrations.failed_to_fetch_axiom_stats', { err })
    return null
  }
}

/**
 * Fetch Vercel deployment analytics via Vercel API
 * Requires: VERCEL_TOKEN, VERCEL_PROJECT_ID environment variables
 */
export async function fetchVercelStats(): Promise<VercelStats | null> {
  try {
    const vercelToken = process.env.VERCEL_TOKEN
    const vercelProjectId = process.env.VERCEL_PROJECT_ID

    if (!vercelToken || !vercelProjectId) {
      log.warn('integrations.vercel_token_or_vercel_project_id')
      return null
    }

    // Fetch deployments
    const deploymentsResponse = await fetchWithTimeout(
      `https://api.vercel.com/v6/deployments?projectId=${vercelProjectId}&limit=10`,
      {
        headers: { Authorization: `Bearer ${vercelToken}` },
      },
    )

    if (!deploymentsResponse.ok) {
      log.error('integrations.vercel_deployments_api_error', { status: deploymentsResponse.status })
      return null
    }

    const deploymentsData = (await deploymentsResponse.json()) as {
      deployments?: Array<{ id: string }>
    }
    const deploymentCount = deploymentsData.deployments?.length || 0

    // Fetch analytics
    const analyticsResponse = await fetchWithTimeout(
      `https://api.vercel.com/v1/projects/${vercelProjectId}/analytics?since=3600`,
      {
        headers: { Authorization: `Bearer ${vercelToken}` },
      },
    )

    if (!analyticsResponse.ok) {
      return {
        deployments: deploymentCount,
        avgResponseTime: 0,
        bandwidth: 0,
      }
    }

    const analyticsData = (await analyticsResponse.json()) as {
      pagesFunctionDuration?: Array<{ duration: number }>
      bandwidth?: number
    }

    const avgResponseTime =
      analyticsData.pagesFunctionDuration && analyticsData.pagesFunctionDuration.length > 0
        ? Math.round(
            analyticsData.pagesFunctionDuration.reduce((sum, d) => sum + d.duration, 0) /
              analyticsData.pagesFunctionDuration.length,
          )
        : 0

    return {
      deployments: deploymentCount,
      avgResponseTime,
      bandwidth: analyticsData.bandwidth || 0,
    }
  } catch (err) {
    log.error('integrations.failed_to_fetch_vercel_stats', { err })
    return null
  }
}

/**
 * Aggregate all observability data
 */
export async function fetchUnifiedObservability(): Promise<UnifiedObservability> {
  const [sentry, posthog, axiom, vercel] = await Promise.all([
    fetchSentryStats(),
    fetchPostHogStats(),
    fetchAxiomStats(),
    fetchVercelStats(),
  ])

  return {
    sentry,
    posthog,
    axiom,
    vercel,
  }
}
