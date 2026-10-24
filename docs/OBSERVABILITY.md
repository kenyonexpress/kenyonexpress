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
         │ • Sentry - Error tracking + source maps│
         │ • PostHog - Event analytics (SDK-free) │
         │ • Vercel - Deployment metrics          │
         │ • Axiom - Structured logging drain     │
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

## External Observability Services

### Sentry (Error Tracking)

Production error tracking with source map support for readable stack traces.

**Configuration:**
```bash
SENTRY_DSN=https://...@de.sentry.io/...
SENTRY_ORG=kenyonexpress  # Hardcoded default in next.config.ts
SENTRY_PROJECT=kenyonexpress-web  # Hardcoded default
SENTRY_AUTH_TOKEN=sntrys_...  # Must have project:releases scope
SENTRY_ENVIRONMENT=production
```

**Thresholds:**
| Metric | Threshold | Alert Level | Action |
|--------|-----------|-------------|--------|
| Error rate | >1% of requests | Warning | Investigate within 2h |
| Error rate | >5% of requests | Critical | Immediate investigation |
| Payment path errors | Any error | Critical | Immediate (dual: Sentry + ntfy) |
| Error volume | >100 errors/hour | Warning | Review error types |
| Source map upload | Failed | Critical | Required for debugging |

**Key features:**
- Payment path errors tagged `area:payments`, dual delivery (Sentry + ntfy bypass)
- PII scrubber redacts headers, cookies, tokens before upload
- 10% transaction sampling for performance traces
- Source maps uploaded then deleted from deployment

**Verification:**
```bash
# Check build logs for:
grep "Successfully uploaded source maps" <build-log>
# Should NOT see: "[@sentry/nextjs] Warning: No org provided"

# Test stack traces show TypeScript line numbers in Sentry UI
```

**Common failures:**
- Missing org/project: upload silently skipped (fixed with hardcoded defaults)
- Invalid token: 401 error in build logs
- Token missing `project:releases` scope: 403 error

### PostHog (Product Analytics)

SDK-free product analytics using direct `/capture/` endpoint (no posthog-js).

**Configuration:**
```bash
NEXT_PUBLIC_POSTHOG_KEY=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

**Thresholds:**
| Metric | Threshold | Alert Level | Action |
|--------|-----------|-------------|--------|
| Capture drop rate | >10% events lost | Warning | Check network/CSP |
| Capture drop rate | >50% events lost | Critical | Service degraded |
| Funnel completion | <5% cart→purchase | Warning | Investigate checkout UX |
| Event volume | >100k events/day | Info | Quota approaching |
| Server event delivery | <80% success | Warning | Check /capture/ endpoint |

**Why SDK-free:**
- Avoids automation detection (navigator.webdriver, HeadlessChrome UA)
- No bundler bloat from unused features
- Works across all runtimes (server, edge, browser)

**Key features:**
- Browser events: `view_product`, `add_to_cart`, `checkout_step`
- Server events: `purchase`, `voucher_redeemed` (reliable across navigation)
- Cookie mirroring: `ke_ph_id` syncs distinct_id between client/server
- Funnel integrity: same user ID from browse → purchase
- ~40% Israeli traffic blocks PostHog (ad blockers), non-blocking for UX

**Verification:**
```bash
# Browser console:
window.localStorage.getItem('ke_ph_distinct_id')  # Should return UUID

# Check PostHog UI: live events appear within 10s
# Verify distinct_id matches localStorage value
```

### Axiom (Structured Logging)

Log drain for structured JSON logs with request correlation.

**Configuration:**
```bash
AXIOM_TOKEN=xaat-...
AXIOM_DATASET=kenyonexpress-production
LOG_LEVEL=info  # Optional, defaults to 'info'
```

**Thresholds:**
| Metric | Threshold | Alert Level | Action |
|--------|-----------|-------------|--------|
| Ingest rate | >10k events/hour | Info | Normal production load |
| Ingest rate | >100k events/hour | Warning | Possible log loop |
| Ingest failures | >1% rejected | Warning | Check token/quota |
| Ingest failures | >10% rejected | Critical | Service degraded |
| Error-level logs | >50/hour | Warning | Review error patterns |
| Error-level logs | >500/hour | Critical | Systemic issue |

**Key features:**
- Every log line carries `request_id` for correlation
- Dual output: console (Vercel drain) + Axiom HTTP ingest
- Same PII scrubber as Sentry (single source of truth)
- Level filtering: debug(10), info(20), warn(30), error(40)
- Redaction: headers/cookies dropped, tokens/secrets redacted

**Log levels:**
- `debug`: Development debugging only
- `info`: Normal operations (default threshold)
- `warn`: Degraded but functional
- `error`: Failures requiring review

**Verification:**
```typescript
import { log } from '@/lib/observability/log'

log.info('test.verification', { component: 'c35', value: 123 })

// Should appear in Axiom as:
// { "ts": "...", "level": "info", "event": "test.verification",
//   "request_id": "req_...", "component": "c35", "value": 123 }
```

## Service Thresholds & Operational Limits

### Cross-Service Correlation

**Request tracing:**
- `request_id`: ties all Axiom logs from one request together
- `order_id`: ties Sentry payment errors to PostHog purchase events
- `distinct_id`: ties PostHog browser + server events together

**Incident investigation pattern:**
1. Alert received (Sentry, ntfy, or SLA breach)
2. Check Axiom: filter by `request_id` or `event` for full flow
3. Check Sentry: review stack trace (requires source maps uploaded)
4. Check PostHog: verify funnel didn't drop before error
5. Check `/admin/observability`: endpoint-level SLA metrics

### Operational Limits

**Sentry:**
- Plan: Developer (5k errors/month included)
- Hard limit: 10k errors/month (billing increases after)
- Transaction quota: 10% sample rate ≈ 7k transactions/month

**PostHog:**
- Plan: Free tier (1M events/month)
- Hard limit: Captures beyond 1M dropped
- Current: <10k funnel events/month (page views dominate)

**Axiom:**
- Plan: Free tier (500 MB/month, 30-day retention)
- Hard limit: Ingest throttled beyond quota
- Current: ~50-100 MB/month (info-level only)

## Troubleshooting External Services

### Sentry source maps not uploaded
**Symptoms**: Production errors show minified stack traces  
**Check**: Build logs for "No org provided" or 401 errors  
**Fix**: Verify `SENTRY_AUTH_TOKEN` set, token has `project:releases` scope

### PostHog events not appearing
**Symptoms**: PostHog UI shows zero events  
**Check**: Browser console `localStorage.getItem('ke_ph_distinct_id')` returns UUID  
**Fix**: Verify `NEXT_PUBLIC_POSTHOG_KEY` set, CSP allows host, disable ad blocker

### Axiom logs missing
**Symptoms**: Axiom dataset empty or stale  
**Check**: Both `AXIOM_TOKEN` and `AXIOM_DATASET` must be set  
**Fix**: Verify env vars, test with explicit log.info() call

## References

- **Sentry**: https://docs.sentry.io/ (error tracking, source maps)
- **PostHog**: https://posthog.com/docs (product analytics, funnels)
- **Axiom**: https://axiom.co/docs (structured logging, retention)
- **Vercel**: https://vercel.com/docs/observability (deployment logs)
- **ntfy.sh**: https://ntfy.sh/ (push notifications)
