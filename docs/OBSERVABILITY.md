# Observability Dashboard

Unified observability system combining performance metrics, error tracking, and SLA monitoring across the entire KenyonExpress platform.

## Overview

The observability dashboard provides real-time visibility into:

- **Endpoint Performance**: P50, P95, P99 response time percentiles
- **Error Tracking**: Error rates, status codes, failure patterns
- **SLA Compliance**: Per-endpoint SLA targets (default p95<300ms, 99.9% availability)
- **Alert Management**: Critical alerts with ntfy.sh notifications
- **Health Status**: Overall system health aggregation

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Observability Dashboard                       │
│                  /admin/observability (page.tsx)                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
         ┌────────────────────────────────────────┐
         │   Metrics Library (lib/observability)  │
         ├────────────────────────────────────────┤
         │ • metrics.ts - Endpoint metrics crud   │
         │ • ntfy-alert.ts - Alert notifications │
         │ • middleware - Request tracking        │
         └────────────────────────────────────────┘
                              ↓
         ┌────────────────────────────────────────┐
         │     Database (Supabase PostgreSQL)     │
         ├────────────────────────────────────────┤
         │ • observability.endpoint_metrics       │
         │ • observability.sla_alerts             │
         │ • observability schema functions       │
         └────────────────────────────────────────┘
                              ↓
         ┌────────────────────────────────────────┐
         │   External Integrations                │
         ├────────────────────────────────────────┤
         │ • ntfy.sh - Real-time alert push       │
         │ • Sentry - Error tracking              │
         │ • PostHog - Event analytics            │
         │ • Vercel - Deployment metrics          │
         │ • Axiom - Structured logging           │
         └────────────────────────────────────────┘
```

## Features

### 1. Endpoint Metrics Tracking

Every API request is automatically tracked and recorded:

```typescript
// Automatic via middleware
recordEndpointMetric(
  '/api/products',
  'GET',
  142, // response time ms
  200  // status code
)
```

Metrics collected:
- **P50, P95, P99**: Response time percentiles
- **Total Requests**: Cumulative request count
- **Error Count**: Failed requests (status >= 400)
- **Error Rate**: Percentage of failed requests
- **Status**: ok/degraded/down

### 2. SLA Monitoring

Default SLA targets:
- **P95 Latency**: <300ms
- **Availability**: 99.9% (error rate <0.1%)

When endpoints breach SLA:
1. Alert is created in `observability.sla_alerts`
2. ntfy notification sent to `ntfy.sh/kenyon-ofir-limit`
3. Dashboard shows visual indicator
4. Admin can acknowledge/resolve alerts

### 3. Alert System

Three alert types:
- **p95_exceeded**: Endpoint response time exceeds 300ms
- **error_rate_high**: Error rate exceeds 0.1%
- **downtime**: Endpoint status is 'down'

Three severity levels:
- **info**: Minor degradation
- **warning**: SLA approach breach
- **critical**: Active SLA breach

### 4. Dashboard Features

- **Health Summary**: Endpoint status counts (ok/degraded/down)
- **Critical Alerts**: Red banner with active critical alerts
- **Slowest Endpoints**: Top 5 by P95 response time
- **Highest Error Rates**: Top 5 endpoints with errors
- **All Metrics Table**: Full endpoint metrics with sorting
- **Alert History**: Recent alerts with timestamps
- **Integration Status**: Sentry, PostHog, Axiom, Vercel status

## API Endpoints

### GET /api/health
Basic health check returning database connectivity and response latency.

```bash
curl https://kenyonexpress.com/api/health
# {
#   "ok": true,
#   "database": "ok",
#   "latency_ms": 45
# }
```

### GET /api/cron/observability-check
Scheduled cron endpoint that checks all endpoints for SLA violations and sends alerts.

Runs every 5 minutes (configured in vercel.json):
```json
{
  "crons": [
    {
      "path": "/api/cron/observability-check",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

Returns:
```json
{
  "ok": true,
  "checked": 24,
  "alerts_triggered": 2,
  "alerts_sent": 2,
  "duration_ms": 145,
  "timestamp": "2026-10-17T14:30:00Z"
}
```

## Database Schema

### observability.endpoint_metrics

Tracks performance metrics per endpoint.

```sql
endpoint_path: text          -- e.g. '/api/products'
method: text                 -- GET, POST, PUT, DELETE, PATCH, HEAD
p50_ms: integer              -- Median response time
p95_ms: integer NOT NULL     -- 95th percentile (SLA target: 300ms)
p99_ms: integer              -- 99th percentile
total_requests: bigint       -- Cumulative count
error_count: bigint          -- Failed requests (status >= 400)
error_rate_percent: numeric  -- (errors/total) * 100
sla_target_percent: numeric  -- Default 99.9
sla_breached: boolean        -- Current SLA status
status: text                 -- ok/degraded/down
last_error_at: timestamp     -- When last error occurred
last_error_message: text     -- HTTP status or error message
```

### observability.sla_alerts

Records all SLA violations and their lifecycle.

```sql
endpoint_id: uuid            -- Foreign key to endpoint_metrics
alert_type: text             -- p95_exceeded/error_rate_high/downtime
severity: text               -- info/warning/critical
metric_value: numeric        -- Current value
threshold_value: numeric     -- SLA target
triggered_at: timestamp      -- When alert was triggered
acknowledged_at: timestamp   -- When acknowledged by admin
resolved_at: timestamp       -- When resolved
notified_at: timestamp       -- When notification was sent
notification_sent: boolean   -- Delivery status
notification_target: text    -- ntfy.sh target (for routing)
```

## Configuration

### Environment Variables

```bash
# Optional: Custom ntfy topic (default: ntfy.sh/kenyon-ofir-limit)
OBSERVABILITY_NTFY_TOPIC=ntfy.sh/custom-topic

# Optional: Enable/disable observability (default: true)
OBSERVABILITY_ENABLED=true

# Optional: SLA targets (defaults)
OBSERVABILITY_P95_TARGET_MS=300
OBSERVABILITY_AVAILABILITY_TARGET=99.9
```

### SLA Thresholds

Customize per endpoint via database update:

```sql
UPDATE observability.endpoint_metrics 
SET sla_target_percent = 99.95  -- More strict
WHERE endpoint_path = '/api/checkout'
```

## Integration Examples

### Recording Custom Metrics

```typescript
import { recordEndpointMetric } from '@/lib/observability/metrics'

// In API routes
const startTime = performance.now()
const response = await handler(request)
const duration = Math.round(performance.now() - startTime)

await recordEndpointMetric(
  '/api/products',
  'GET',
  duration,
  response.status
)
```

### Sending Custom Alerts

```typescript
import { sendNtfyAlert, type NtfyAlertPayload } from '@/lib/observability/ntfy-alert'

const alert: NtfyAlertPayload = {
  endpoint: '/api/checkout',
  method: 'POST',
  alertType: 'error_rate_high',
  severity: 'critical',
  metricValue: 5.2,      // 5.2% error rate
  thresholdValue: 0.1,   // 0.1% target
  timestamp: new Date().toISOString(),
}

await sendNtfyAlert(alert)
```

### Managing Alerts

```typescript
import { acknowledgeAlert, resolveAlert } from '@/lib/observability/metrics'

// Acknowledge but don't resolve
await acknowledgeAlert(alertId)

// Resolve alert
await resolveAlert(alertId)
```

## Accessing the Dashboard

Dashboard accessible at:
```
https://kenyonexpress.com/admin/observability
```

**Requirements:**
- Must be authenticated as admin user
- RBAC role enforcement via RLS policies
- Real-time data updates every 30 seconds

## ntfy.sh Integration

Alerts are pushed to `ntfy.sh/kenyon-ofir-limit` via HTTP POST.

### Alert Format

```
Title: 🔴 P95 Latency Exceeded - /api/products
Tags: critical,observability
Priority: high

GET /api/products
⚠️ Alert: P95 Latency Exceeded
📊 Current: 450ms
🎯 Threshold: 300ms
⏰ 2026-10-17 14:30:00 IST
```

### Notification Rules

- **Critical**: High priority push notification
- **Warning**: Default priority notification  
- **Info**: Tagged but lower priority

You can subscribe to alerts at: https://ntfy.sh/kenyon-ofir-limit/subscribe

## Monitoring Checklist

Daily:
- [ ] Check dashboard for critical alerts
- [ ] Review new SLA breaches
- [ ] Acknowledge/resolve alerts as needed
- [ ] Verify health check passing

Weekly:
- [ ] Review P95 trends
- [ ] Analyze error rate patterns
- [ ] Plan optimization for slowest endpoints
- [ ] Update SLA targets if needed

## Performance Impact

- **Metrics Recording**: <1ms overhead per request
- **Dashboard Load**: ~200ms with 1000+ metrics
- **Alert Check**: ~500ms to process all endpoints
- **Database Size**: ~50 bytes per metric record

## Troubleshooting

### Dashboard Not Loading
1. Check /api/health returns 200
2. Verify CRON_SECRET env var set
3. Check browser console for errors
4. Verify user has admin role

### Alerts Not Sending
1. Check ntfy.sh is reachable: `curl https://ntfy.sh/test`
2. Verify /api/cron/observability-check runs successfully
3. Check database alert records have notification_sent=false
4. Review application logs for errors

### Missing Metrics
1. Verify endpoints are being called
2. Check middleware is recording metrics
3. Verify observability schema exists: `SELECT * FROM information_schema.tables WHERE table_schema = 'observability'`
4. Check RLS policies allow service_role writes

## Future Enhancements

- [ ] Heatmaps for response time distribution
- [ ] Anomaly detection for automatic threshold adjustment
- [ ] Custom alert rules per endpoint
- [ ] Slack/email notification routing
- [ ] Historical trend analysis
- [ ] Cost attribution per endpoint
- [ ] Real user monitoring (RUM) integration
- [ ] Distributed tracing (OpenTelemetry)

## References

- [Sentry Documentation](https://docs.sentry.io/)
- [PostHog Docs](https://posthog.com/docs)
- [Axiom Logging](https://axiom.co/)
- [Vercel Analytics](https://vercel.com/analytics)
- [ntfy.sh](https://ntfy.sh/)
