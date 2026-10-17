'use client'

import { getEndpointMetrics, getUnresolvedAlerts } from '@/lib/observability/metrics'
import type { EndpointMetric, SLAAlert } from '@/lib/observability/metrics'
import { useEffect, useState } from 'react'

/**
 * Unified observability dashboard combining:
 * - Endpoint performance metrics (p95, p99, error rates)
 * - SLA alert status and history
 * - Health status aggregation
 * - Integration placeholders for Sentry, PostHog, Axiom, Vercel
 */
export default function ObservabilityPage() {
  const [metrics, setMetrics] = useState<EndpointMetric[]>([])
  const [alerts, setAlerts] = useState<SLAAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 30000) // Refresh every 30s
    return () => clearInterval(interval)
  }, [])

  async function loadData() {
    try {
      setError(null)
      const [metricsData, alertsData] = await Promise.all([
        getEndpointMetrics(),
        getUnresolvedAlerts(),
      ])

      setMetrics(metricsData)
      setAlerts(alertsData)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load observability data'
      setError(message)
      console.error('[dashboard] Error:', err)
    } finally {
      setLoading(false)
    }
  }

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

  if (loading && metrics.length === 0 && alerts.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
          <p className="text-gray-600">Loading observability dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div dir="ltr" className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 text-white">
      {/* Header */}
      <header className="bg-black bg-opacity-50 border-b border-gray-700 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Observability Dashboard</h1>
              <p className="text-gray-400 mt-1">Real-time system health & SLA monitoring</p>
            </div>
            <button
              type="button"
              onClick={loadData}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition"
              disabled={loading}
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 bg-red-900 bg-opacity-50 border border-red-700 rounded-lg">
            <p className="font-semibold">Error loading dashboard</p>
            <p className="text-sm text-gray-300 mt-1">{error}</p>
          </div>
        )}

        {/* Health Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
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
          <section className="mb-8 p-6 bg-red-900 bg-opacity-20 border border-red-700 rounded-lg">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
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

        {/* Two-column layout for metrics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Worst Performing Endpoints */}
          <section>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <span className="text-2xl">⚡</span> Slowest Endpoints (P95)
            </h2>
            <div className="space-y-3">
              {worstEndpoints.length > 0 ? (
                worstEndpoints.map((metric) => <EndpointCard key={metric.id} metric={metric} />)
              ) : (
                <p className="text-gray-400">No endpoints tracked yet</p>
              )}
            </div>
          </section>

          {/* Highest Error Rates */}
          <section>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <span className="text-2xl">⚠️</span> Highest Error Rates
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

        {/* All Metrics Table */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-4">All Endpoint Metrics</h2>
          <div className="overflow-x-auto bg-gray-800 rounded-lg border border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-900 border-b border-gray-700">
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
                        <span className="inline-block px-2 py-1 bg-blue-900 rounded text-xs font-semibold">
                          {metric.method}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={
                            metric.p95_ms > 300 ? 'text-red-400 font-semibold' : 'text-green-400'
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
                              ? 'text-red-400 font-semibold'
                              : 'text-green-400'
                          }
                        >
                          {metric.error_rate_percent.toFixed(3)}%
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
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

        {/* Alert History */}
        {alerts.length > 0 && (
          <section>
            <h2 className="text-xl font-bold mb-4">Recent Alerts ({alerts.length})</h2>
            <div className="space-y-3">
              {alerts.slice(0, 10).map((alert) => (
                <AlertItem key={alert.id} alert={alert} />
              ))}
            </div>
          </section>
        )}

        {/* Integration Status */}
        <section className="mt-12 p-6 bg-gray-800 rounded-lg border border-gray-700">
          <h2 className="text-xl font-bold mb-4">External Integrations</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <IntegrationStatus name="Sentry" status="connected" info="Error tracking active" />
            <IntegrationStatus name="PostHog" status="connected" info="Event analytics active" />
            <IntegrationStatus name="Axiom" status="configured" info="Structured logging" />
            <IntegrationStatus name="Vercel Analytics" status="connected" info="Performance data" />
          </div>
        </section>
      </main>
    </div>
  )
}

/**
 * Summary card component
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
    <div className={`p-6 rounded-lg border border-gray-700 ${bgColor}`}>
      <p className="text-sm text-gray-400 mb-2">{label}</p>
      <p className={`text-3xl font-bold ${textColor}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-1">{percentage}% of endpoints</p>
    </div>
  )
}

/**
 * Endpoint metric card component
 */
function EndpointCard({ metric }: { metric: EndpointMetric }) {
  return (
    <div className="p-4 bg-gray-800 rounded-lg border border-gray-700 hover:border-gray-600 transition">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <p className="font-mono text-xs text-gray-400 mb-1">{metric.endpoint_path}</p>
          <p className="text-sm font-semibold">{metric.method}</p>
        </div>
        <span
          className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
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
          <p className="text-gray-400 text-xs">P95 Response Time</p>
          <p className={metric.p95_ms > 300 ? 'text-red-400 font-semibold' : 'text-green-400'}>
            {metric.p95_ms}ms
          </p>
        </div>
        <div>
          <p className="text-gray-400 text-xs">Error Rate</p>
          <p
            className={
              metric.error_rate_percent > 0.1 ? 'text-red-400 font-semibold' : 'text-green-400'
            }
          >
            {metric.error_rate_percent.toFixed(3)}%
          </p>
        </div>
      </div>

      {metric.last_error_message && (
        <p className="text-xs text-red-400 mt-3 pt-3 border-t border-gray-700">
          Last error: {metric.last_error_message}
        </p>
      )}
    </div>
  )
}

/**
 * Alert item component
 */
function AlertItem({ alert }: { alert: SLAAlert }) {
  const severityColor = {
    info: 'bg-blue-900',
    warning: 'bg-yellow-900',
    critical: 'bg-red-900',
  }[alert.severity]

  const typeEmoji = {
    p95_exceeded: '⚡',
    error_rate_high: '⚠️',
    downtime: '🔴',
  }[alert.alert_type]

  return (
    <div className={`p-4 rounded-lg border border-gray-700 ${severityColor} bg-opacity-30`}>
      <div className="flex items-start justify-between mb-2">
        <p className="font-semibold flex items-center gap-2">
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
        <p className="text-xs text-green-400 mt-2">✅ Resolved at {alert.resolved_at}</p>
      )}
    </div>
  )
}

/**
 * External integration status component
 */
function IntegrationStatus({
  name,
  status,
  info,
}: {
  name: string
  status: 'connected' | 'configured' | 'pending'
  info: string
}) {
  const statusColor = {
    connected: 'text-green-400',
    configured: 'text-blue-400',
    pending: 'text-yellow-400',
  }[status]

  const statusIcon = {
    connected: '✅',
    configured: '⚙️',
    pending: '⏳',
  }[status]

  return (
    <div className="p-3 bg-gray-700 rounded border border-gray-600">
      <p className="font-semibold flex items-center gap-2">
        <span className={statusColor}>{statusIcon}</span>
        {name}
      </p>
      <p className="text-xs text-gray-400 mt-1">{info}</p>
    </div>
  )
}
