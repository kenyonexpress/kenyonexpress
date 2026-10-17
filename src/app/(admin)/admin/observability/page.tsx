import { requireSection } from '@/lib/admin/rbac'
import { fetchUnifiedObservability } from '@/lib/observability/integrations'
import { getEndpointMetrics, getUnresolvedAlerts } from '@/lib/observability/metrics'
import { AlertCircle, BarChart3, Zap } from 'lucide-react'

export const metadata = { title: 'Observability Dashboard' }

/**
 * Server-rendered observability dashboard combining all integration data
 * Displays endpoint metrics, SLA status, and alerts with real-time data
 */
export default async function ObservabilityPage() {
  // Guard: require admin access to observability dashboard
  await requireSection('observability')

  // Fetch all data in parallel
  const [metrics, alerts, integrations] = await Promise.all([
    getEndpointMetrics(),
    getUnresolvedAlerts(),
    fetchUnifiedObservability(),
  ])

  // Calculate health summary
  const healthyCount = metrics.filter((m) => m.status === 'ok').length
  const degradedCount = metrics.filter((m) => m.status === 'degraded').length
  const downCount = metrics.filter((m) => m.status === 'down').length
  const criticalAlerts = alerts.filter((a) => a.severity === 'critical').length

  // Get worst performing endpoints
  const worstEndpoints = [...metrics].sort((a, b) => (b.p95_ms || 0) - (a.p95_ms || 0)).slice(0, 5)

  // Get highest error rates
  const highestErrors = [...metrics]
    .filter((m) => m.error_rate_percent > 0)
    .sort((a, b) => b.error_rate_percent - a.error_rate_percent)
    .slice(0, 5)

  return (
    <div dir="ltr" className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 text-white">
      {/* Header */}
      <header className="border-b border-gray-700 bg-black bg-opacity-50 sticky top-0 z-10">
        <div className="mx-auto max-w-7xl px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Observability Dashboard</h1>
              <p className="mt-1 text-gray-400">Unified system health & SLA monitoring</p>
            </div>
            <div className="text-sm text-gray-400">
              Last updated: {new Date().toLocaleTimeString('en-IL', { timeZone: 'Asia/Jerusalem' })}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Health Summary Cards */}
        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          <SummaryCard
            label="Healthy Endpoints"
            value={healthyCount}
            color="green"
            total={metrics.length}
          />
          <SummaryCard
            label="Degraded Endpoints"
            value={degradedCount}
            color="yellow"
            total={metrics.length}
          />
          <SummaryCard
            label="Down Endpoints"
            value={downCount}
            color="red"
            total={metrics.length}
          />
          <SummaryCard
            label="Critical Alerts"
            value={criticalAlerts}
            color={criticalAlerts > 0 ? 'red' : 'green'}
            total={alerts.length}
          />
        </div>

        {/* Critical Alerts Section */}
        {criticalAlerts > 0 && (
          <section className="mb-8 rounded-lg border border-red-700 bg-red-900 bg-opacity-20 p-6">
            <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
              <span className="text-2xl">🔴</span> Critical Alerts ({criticalAlerts})
            </h2>
            <div className="space-y-3">
              {alerts
                .filter((a) => a.severity === 'critical')
                .slice(0, 5)
                .map((alert) => (
                  <AlertItem key={alert.id} alert={alert} />
                ))}
            </div>
          </section>
        )}

        {/* Integrations Grid */}
        <section className="mb-8">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
            <span className="text-2xl">🔗</span> Integration Status
          </h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <IntegrationCard
              name="Endpoint Metrics"
              value={metrics.length}
              icon="📊"
              status={metrics.length > 0 ? 'connected' : 'pending'}
            />
            {integrations.sentry && (
              <IntegrationCard
                name="Sentry Errors"
                value={integrations.sentry.totalEvents}
                icon="🚨"
                status={integrations.sentry.totalEvents > 0 ? 'connected' : 'configured'}
              />
            )}
            {integrations.posthog && (
              <IntegrationCard
                name="PostHog Events"
                value={integrations.posthog.eventVolume}
                icon="📈"
                status={integrations.posthog.eventVolume > 0 ? 'connected' : 'configured'}
              />
            )}
            {integrations.vercel && (
              <IntegrationCard
                name="Vercel Analytics"
                value={integrations.vercel.deployments}
                icon="▲"
                status={integrations.vercel.deployments > 0 ? 'connected' : 'configured'}
              />
            )}
          </div>
        </section>

        {/* Metrics Two-Column */}
        <div className="mb-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Slowest Endpoints */}
          <section>
            <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
              <Zap className="h-5 w-5" />
              Slowest Endpoints (P95)
            </h2>
            <div className="space-y-3">
              {worstEndpoints.length > 0 ? (
                worstEndpoints.map((metric) => <EndpointCard key={metric.id} metric={metric} />)
              ) : (
                <p className="text-gray-400">No endpoints tracked yet</p>
              )}
            </div>
          </section>

          {/* Error Rates */}
          <section>
            <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
              <AlertCircle className="h-5 w-5" />
              Highest Error Rates
            </h2>
            <div className="space-y-3">
              {highestErrors.length > 0 ? (
                highestErrors.map((metric) => <EndpointCard key={metric.id} metric={metric} />)
              ) : (
                <p className="text-gray-400">All endpoints performing well</p>
              )}
            </div>
          </section>
        </div>

        {/* Metrics Table */}
        <section className="mb-8">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
            <BarChart3 className="h-5 w-5" />
            All Endpoint Metrics
          </h2>
          <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-800">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-700 bg-gray-900">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Endpoint</th>
                  <th className="px-4 py-3 text-left font-semibold">Method</th>
                  <th className="px-4 py-3 text-right font-semibold">P95 (ms)</th>
                  <th className="px-4 py-3 text-right font-semibold">Requests</th>
                  <th className="px-4 py-3 text-right font-semibold">Error Rate</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-left font-semibold">SLA</th>
                </tr>
              </thead>
              <tbody>
                {metrics.length > 0 ? (
                  metrics.map((metric) => (
                    <tr key={metric.id} className="border-b border-gray-700 hover:bg-gray-700">
                      <td className="px-4 py-3 font-mono text-xs">{metric.endpoint_path}</td>
                      <td className="px-4 py-3">
                        <span className="inline-block rounded bg-blue-900 px-2 py-1 text-xs font-semibold">
                          {metric.method}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={
                            metric.p95_ms > 300 ? 'font-semibold text-red-400' : 'text-green-400'
                          }
                        >
                          {metric.p95_ms}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">{metric.total_requests.toString()}</td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={
                            metric.error_rate_percent > 0.1
                              ? 'font-semibold text-red-400'
                              : 'text-green-400'
                          }
                        >
                          {metric.error_rate_percent.toFixed(3)}%
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded px-2 py-1 text-xs font-semibold ${
                            metric.status === 'ok'
                              ? 'bg-green-900 text-green-300'
                              : metric.status === 'degraded'
                                ? 'bg-yellow-900 text-yellow-300'
                                : 'bg-red-900 text-red-300'
                          }`}
                        >
                          {metric.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={metric.sla_breached ? 'text-red-400' : 'text-green-400'}>
                          {metric.sla_breached ? '❌' : '✅'} {metric.sla_target_percent}%
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                      No endpoint metrics collected yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Integration Details */}
        <section className="rounded-lg border border-gray-700 bg-gray-800 p-6">
          <h2 className="mb-6 text-xl font-bold">Integration Details</h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {integrations.sentry && (
              <IntegrationDetail
                name="Sentry"
                data={{
                  'Total Events': integrations.sentry.totalEvents,
                  'Error Rate': `${integrations.sentry.errorRate.toFixed(2)}%`,
                  'Critical Errors': integrations.sentry.criticalErrors,
                }}
              />
            )}
            {integrations.posthog && (
              <IntegrationDetail
                name="PostHog"
                data={{
                  'Active Users': integrations.posthog.activeUsers,
                  'Conversion Rate': `${integrations.posthog.conversionRate.toFixed(2)}%`,
                  'Event Volume': integrations.posthog.eventVolume,
                }}
              />
            )}
            {integrations.axiom && (
              <IntegrationDetail
                name="Axiom Logs"
                data={{
                  'Log Volume': integrations.axiom.logVolume,
                  'Avg Latency': `${integrations.axiom.avgLogLatency.toFixed(0)}ms`,
                  'Error Logs': integrations.axiom.errorLogs,
                }}
              />
            )}
            {integrations.vercel && (
              <IntegrationDetail
                name="Vercel Analytics"
                data={{
                  Deployments: integrations.vercel.deployments,
                  'Avg Response': `${integrations.vercel.avgResponseTime.toFixed(0)}ms`,
                  Bandwidth: `${(integrations.vercel.bandwidth / 1024 / 1024).toFixed(2)}GB`,
                }}
              />
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

/**
 * Summary Card Component
 */
function SummaryCard({
  label,
  value,
  color,
  total,
}: {
  label: string
  value: number
  color: 'green' | 'yellow' | 'red'
  total: number
}) {
  const percentage = total > 0 ? Math.round((value / total) * 100) : 0

  const bgColor = {
    green: 'bg-green-900 bg-opacity-30',
    yellow: 'bg-yellow-900 bg-opacity-30',
    red: 'bg-red-900 bg-opacity-30',
  }[color]

  const textColor = {
    green: 'text-green-400',
    yellow: 'text-yellow-400',
    red: 'text-red-400',
  }[color]

  return (
    <div className={`rounded-lg border border-gray-700 p-6 ${bgColor}`}>
      <p className="mb-2 text-sm text-gray-400">{label}</p>
      <p className={`text-3xl font-bold ${textColor}`}>{value}</p>
      <p className="mt-1 text-xs text-gray-500">{percentage}% of endpoints</p>
    </div>
  )
}

/**
 * Endpoint Metric Card
 */
function EndpointCard({
  metric,
}: {
  metric: {
    id: string
    endpoint_path: string
    method: string
    p95_ms: number
    error_rate_percent: number
    status: string
    last_error_message: string | null
  }
}) {
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-4 hover:border-gray-600 transition">
      <div className="mb-3 flex items-start justify-between">
        <div className="flex-1">
          <p className="mb-1 font-mono text-xs text-gray-400">{metric.endpoint_path}</p>
          <p className="text-sm font-semibold">{metric.method}</p>
        </div>
        <span
          className={`inline-block rounded px-2 py-1 text-xs font-semibold ${
            metric.status === 'ok'
              ? 'bg-green-900 text-green-300'
              : metric.status === 'degraded'
                ? 'bg-yellow-900 text-yellow-300'
                : 'bg-red-900 text-red-300'
          }`}
        >
          {metric.status.toUpperCase()}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-xs text-gray-400">P95 Response Time</p>
          <p className={metric.p95_ms > 300 ? 'font-semibold text-red-400' : 'text-green-400'}>
            {metric.p95_ms}ms
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Error Rate</p>
          <p
            className={
              metric.error_rate_percent > 0.1 ? 'font-semibold text-red-400' : 'text-green-400'
            }
          >
            {metric.error_rate_percent.toFixed(3)}%
          </p>
        </div>
      </div>

      {metric.last_error_message && (
        <p className="border-t border-gray-700 pt-3 text-xs text-red-400 mt-3">
          Last error: {metric.last_error_message}
        </p>
      )}
    </div>
  )
}

/**
 * Alert Item
 */
function AlertItem({
  alert,
}: {
  alert: {
    id: string
    alert_type: string
    severity: string
    metric_value: number | string
    threshold_value: number | string
    triggered_at: string
    resolved_at: string | null
  }
}) {
  const severityColor = {
    info: 'bg-blue-900',
    warning: 'bg-yellow-900',
    critical: 'bg-red-900',
  }[alert.severity]

  const emojiMap = {
    p95_exceeded: '⚡',
    error_rate_high: '⚠️',
    downtime: '🔴',
  } as const
  const typeEmoji = emojiMap[alert.alert_type as keyof typeof emojiMap] || '❓'

  return (
    <div className={`rounded-lg border border-gray-700 p-4 ${severityColor} bg-opacity-30`}>
      <div className="mb-2 flex items-start justify-between">
        <p className="flex items-center gap-2 font-semibold">
          <span>{typeEmoji}</span>
          {alert.alert_type.replace(/_/g, ' ').toUpperCase()}
        </p>
        <span className="text-xs text-gray-400">
          {new Date(alert.triggered_at).toLocaleString('en-IL', {
            timeZone: 'Asia/Jerusalem',
          })}
        </span>
      </div>
      <p className="text-sm text-gray-300">
        Current: <span className="font-semibold">{alert.metric_value}</span> / Threshold:{' '}
        <span className="font-semibold">{alert.threshold_value}</span>
      </p>
      {alert.resolved_at && (
        <p className="mt-2 text-xs text-green-400">✅ Resolved at {alert.resolved_at}</p>
      )}
    </div>
  )
}

/**
 * Integration Card
 */
function IntegrationCard({
  name,
  value,
  icon,
  status,
}: {
  name: string
  value: number
  icon: string
  status: 'connected' | 'configured' | 'pending'
}) {
  const statusColor = {
    connected: 'text-green-400',
    configured: 'text-blue-400',
    pending: 'text-yellow-400',
  }[status]

  const bgColor = {
    connected: 'bg-green-900 bg-opacity-20',
    configured: 'bg-blue-900 bg-opacity-20',
    pending: 'bg-yellow-900 bg-opacity-20',
  }[status]

  return (
    <div className={`rounded-lg border border-gray-700 p-4 ${bgColor}`}>
      <p className="flex items-center gap-2 font-semibold">
        <span className="text-2xl">{icon}</span>
      </p>
      <p className="mt-2 text-xs text-gray-400">{name}</p>
      <p className={`mt-1 text-lg font-bold ${statusColor}`}>{value.toLocaleString()}</p>
      <p className={`text-xs font-semibold ${statusColor}`}>● {status}</p>
    </div>
  )
}

/**
 * Integration Detail Panel
 */
function IntegrationDetail({
  name,
  data,
}: {
  name: string
  data: Record<string, number | string>
}) {
  return (
    <div>
      <h3 className="mb-3 font-semibold">{name}</h3>
      <div className="space-y-2">
        {Object.entries(data).map(([key, value]) => (
          <div key={key} className="flex items-center justify-between text-sm">
            <span className="text-gray-400">{key}</span>
            <span className="font-semibold">{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
