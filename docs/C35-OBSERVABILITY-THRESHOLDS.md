# C35: Observability Thresholds & Configuration

**Status**: Complete  
**Date**: 2026-10-24  
**Services**: Sentry (errors), PostHog (analytics), Axiom (logs)

## Overview

Unified observability thresholds and operational limits for the three external monitoring services. These thresholds trigger alerts, inform capacity planning, and define when manual intervention is required.

## 1. Sentry (Error Tracking)

### Service Configuration

```bash
SENTRY_DSN=https://...@de.sentry.io/...
SENTRY_ORG=kenyonexpress
SENTRY_PROJECT=kenyonexpress-web
SENTRY_AUTH_TOKEN=sntrys_...
SENTRY_ENVIRONMENT=production
```

### Thresholds

| Metric | Threshold | Alert Level | Action |
|--------|-----------|-------------|--------|
| **Error rate** | >1% of requests | Warning | Investigate within 2h |
| **Error rate** | >5% of requests | Critical | Immediate investigation |
| **Payment path errors** | Any error | Critical | Immediate investigation |
| **Error volume** | >100 errors/hour | Warning | Review error types |
| **Error volume** | >500 errors/hour | Critical | Check for systemic issue |
| **Unresolved errors** | >50 issues | Info | Triage backlog |
| **Source map upload** | Failed | Critical | Source maps required for debugging |

### Verification Steps

**1. Verify Sentry is receiving events**
```bash
# Check last event received (via Sentry UI or API)
# Should see events within last 5 minutes on production

# Local test (requires SENTRY_DSN in .env.local):
SENTRY_ALLOW_LOCAL=true pnpm dev
# Trigger an error, check Sentry UI
```

**2. Verify source maps are uploaded**
```bash
# Check build logs for:
# "Successfully uploaded source maps to Sentry"
# 
# Absence of org/project triggers:
# "[@sentry/nextjs] Warning: No org provided"

# Verify in Sentry UI:
# - Navigate to Settings > Projects > kenyonexpress-web > Source Maps
# - Should see recent releases with uploaded maps
# - Stack traces should show original TypeScript line numbers
```

**3. Verify payment alarm path**
```typescript
// Test alarm delivery (dev/staging only):
import { capturePaymentAlarm } from '@/lib/observability/sentry'

await capturePaymentAlarm('Test alarm', {
  stage: 'test',
  orderId: 'test-order-123',
})
// Should appear in Sentry + send ntfy alert
```

### Source Map Upload Flow

```
1. Build completes with .next/static/**/*.map files generated
2. withSentryConfig uploads maps to Sentry (if SENTRY_AUTH_TOKEN present)
3. Maps are deleted from deployment (deleteSourcemapsAfterUpload: true)
4. Production errors show original TypeScript sources in Sentry UI
```

**Common failures:**
- Missing `SENTRY_ORG` or `SENTRY_PROJECT`: upload silently skipped
- Invalid `SENTRY_AUTH_TOKEN`: 401 error in build logs
- Token missing `project:releases` scope: 403 error

### Alert Routing

All payment path errors trigger dual delivery:
1. **Sentry event** (tagged `area:payments`, `stage:<stage>`)
2. **ntfy.sh alert** (`ntfy.sh/kenyon-ofir-limit`, bypasses Sentry outage)

## 2. PostHog (Product Analytics)

### Service Configuration

```bash
NEXT_PUBLIC_POSTHOG_KEY=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

### Thresholds

| Metric | Threshold | Alert Level | Action |
|--------|-----------|-------------|--------|
| **Capture drop rate** | >10% events lost | Warning | Check network/CSP |
| **Capture drop rate** | >50% events lost | Critical | Service degraded |
| **Funnel completion** | <5% cart→purchase | Warning | Investigate checkout UX |
| **Event volume** | <100 events/day | Info | Low traffic or capture failure |
| **Event volume** | >100k events/day | Info | Quota approaching, review plan |
| **Server event delivery** | <80% success | Warning | Check /capture/ endpoint |

### Verification Steps

**1. Verify PostHog is capturing events**
```bash
# Browser console (any page):
window.localStorage.getItem('ke_ph_distinct_id')
# Should return UUID

# Check PostHog UI:
# - Live events should appear within 10 seconds
# - Verify distinct_id matches localStorage value
```

**2. Verify server-side events**
```typescript
// Check server events are being sent:
import { trackEvent } from '@/lib/observability/posthog'

trackEvent('test_event', { source: 'verification' })
// Should appear in PostHog within 30s
```

**3. Verify funnel integrity**
```bash
# PostHog UI > Insights > Funnels
# Check: view_product → add_to_cart → begin_checkout → purchase
# 
# All four stages should have non-zero counts
# Distinct_id should be consistent across browser + server events
```

### Implementation Notes

**SDK-free by design**: Uses direct `/capture/` endpoint via fetch, avoiding:
- `posthog-js` automation detection (webdriver, HeadlessChrome UA)
- Bundler bloat from unused SDK features
- Runtime dependency on config/flags endpoints

**Cookie mirroring**: `ke_ph_id` cookie mirrors `localStorage` distinct_id so server events (purchase, voucher_redeemed) share the same funnel identity as browser events.

### Known Limitations

- **E2E tests**: Playwright captures are dropped unless `navigator.webdriver` is masked
- **Ad blockers**: ~40% of Israeli traffic blocks PostHog; non-blocking for UX
- **Batch flush**: 4s delay for browser events (SDK default)

## 3. Axiom (Structured Logging)

### Service Configuration

```bash
AXIOM_TOKEN=xaat-...
AXIOM_DATASET=kenyonexpress-production
LOG_LEVEL=info
```

### Thresholds

| Metric | Threshold | Alert Level | Action |
|--------|-----------|-------------|--------|
| **Ingest rate** | >10k events/hour | Info | Normal production load |
| **Ingest rate** | >100k events/hour | Warning | Possible log loop |
| **Ingest failures** | >1% rejected | Warning | Check token/quota |
| **Ingest failures** | >10% rejected | Critical | Service degraded |
| **Error-level logs** | >50/hour | Warning | Review error patterns |
| **Error-level logs** | >500/hour | Critical | Systemic issue |
| **Query latency** | >5s for 1h window | Warning | Dataset size growing |

### Verification Steps

**1. Verify Axiom is receiving logs**
```bash
# Local test:
AXIOM_TOKEN=<token> AXIOM_DATASET=<dataset> LOG_LEVEL=debug pnpm dev

# Trigger a log:
# Visit any page, logs auto-emit on requests
```

**2. Check structured log format**
```typescript
// Example log entry:
import { log } from '@/lib/observability/log'

log.info('test.verification', { 
  component: 'c35-check',
  value: 123 
})

// Should appear in Axiom as:
// {
//   "ts": "2026-10-24T...",
//   "level": "info",
//   "event": "test.verification",
//   "request_id": "req_...",
//   "component": "c35-check",
//   "value": 123
// }
```

**3. Verify request correlation**
```bash
# Axiom query:
# Filter by request_id to group all logs from one request
# Each request should have: route, method, request_id fields
```

### Log Levels

| Level | Severity | When to Use | Example |
|-------|----------|-------------|---------|
| `debug` | 10 | Development debugging | `log.debug('cache.miss', { key })` |
| `info` | 20 | Normal operations | `log.info('order.created', { orderId })` |
| `warn` | 30 | Degraded but functional | `log.warn('retry.exhausted', { attempts })` |
| `error` | 40 | Failures requiring review | `log.error('payment.webhook_failed', { error })` |

**Threshold filter**: Set `LOG_LEVEL=warn` to suppress debug/info (default: `info`).

### Redaction

All logs pass through `scrub.ts` before emission:
- Headers: dropped wholesale (contain Supabase session, Cardcom secrets)
- Cookies: dropped wholesale
- Query params: `token`, `code`, `secret` redacted
- URL paths: `/redeem/<token>` → `/redeem/[redacted]`

Same scrubber used by Sentry `beforeSend` (single source of truth).

## Cross-Service Correlation

### Request Tracing

```
User request
  ↓
  request_id generated (src/lib/observability/request-context.ts)
  ↓
  ├─→ Axiom logs (all logs carry request_id)
  ├─→ Sentry (payment errors tagged with order_id)
  └─→ PostHog (events carry user's distinct_id)
```

**Correlation keys:**
- **request_id**: ties Axiom logs together
- **order_id**: ties Sentry payment errors to PostHog purchase events
- **distinct_id**: ties PostHog browser + server events together

### Incident Investigation Pattern

1. **Alert received** (Sentry error, ntfy payment alarm, or observability SLA breach)
2. **Identify scope** (single user? all users? specific endpoint?)
3. **Check Axiom**: filter by `request_id` or `event` to see full request flow
4. **Check Sentry**: review stack trace (requires source maps uploaded)
5. **Check PostHog**: verify user funnel didn't drop before the error
6. **Check internal metrics**: `/admin/observability` for endpoint-level SLA

## Operational Limits

### Sentry
- **Plan**: Developer (5k errors/month included)
- **Hard limit**: 10k errors/month (billing increases after)
- **Transaction quota**: 10% sample rate = ~7k transactions/month at 70k requests/month

### PostHog
- **Plan**: Free tier (1M events/month)
- **Hard limit**: Captures beyond 1M are dropped
- **Mitigation**: Event volume dominated by page views; funnel events are <10k/month

### Axiom  
- **Plan**: Free tier (500 MB ingest/month, 30-day retention)
- **Hard limit**: Ingest throttled beyond quota
- **Current usage**: ~50-100 MB/month (info-level logs only)

## Configuration Checklist

### Production Deploy

- [ ] `SENTRY_DSN` set (both client + server)
- [ ] `SENTRY_ORG` = `kenyonexpress`
- [ ] `SENTRY_PROJECT` = `kenyonexpress-web`
- [ ] `SENTRY_AUTH_TOKEN` set (token has `project:releases` scope)
- [ ] `SENTRY_ENVIRONMENT` = `production`
- [ ] `NEXT_PUBLIC_POSTHOG_KEY` set
- [ ] `NEXT_PUBLIC_POSTHOG_HOST` = `https://us.i.posthog.com`
- [ ] `AXIOM_TOKEN` set
- [ ] `AXIOM_DATASET` = `kenyonexpress-production`
- [ ] `LOG_LEVEL` = `info`

### Build Verification

```bash
# Check build logs for:
grep "Successfully uploaded source maps" <build-log>
grep "Warning: No org provided" <build-log>  # Should NOT appear

# Check deployed files:
find .next/static -name "*.map" | wc -l
# Should be 0 (deleted after upload)
```

### Runtime Verification

```bash
# Health check includes database only, not external services
curl https://kenyonexpress.co.il/api/health

# Check recent Sentry events (UI or API)
# Check PostHog live events (UI)
# Check Axiom query for logs from last 1h
```

## Troubleshooting

### Sentry source maps not uploaded

**Symptoms**: Production errors show minified stack traces  
**Check**:
1. Build logs: look for "No org provided" or 401 errors
2. Verify `SENTRY_AUTH_TOKEN` is set in Vercel environment
3. Verify token has `project:releases` scope in Sentry UI
4. Check `next.config.ts` has org/project configured

**Fix**: Set missing env vars, regenerate token with correct scope

### PostHog events not appearing

**Symptoms**: PostHog UI shows zero events, funnel is empty  
**Check**:
1. Browser console: `window.localStorage.getItem('ke_ph_distinct_id')` should return UUID
2. Network tab: filter for `/capture/`, should see POST requests
3. CSP: check `connect-src` includes PostHog host
4. Ad blocker: disable and retry (40% of traffic blocks PostHog)

**Fix**: Verify `NEXT_PUBLIC_POSTHOG_KEY` set, CSP allows host

### Axiom logs missing

**Symptoms**: Axiom dataset empty or stale  
**Check**:
1. Env vars: `AXIOM_TOKEN` and `AXIOM_DATASET` must both be set
2. Token validity: expired tokens return 401
3. Dataset name: typo means logs go nowhere (no error returned)
4. LOG_LEVEL: if set to `error`, only error-level logs are emitted

**Fix**: Verify env vars, test with explicit log call

## References

- Internal observability dashboard: `/admin/observability`
- Sentry configuration: `next.config.ts`, `sentry.{server,client,edge}.config.ts`
- PostHog implementation: `src/lib/observability/posthog.ts`
- Axiom implementation: `src/lib/observability/axiom.ts`
- Structured logging: `src/lib/observability/log.ts`
- Scrubber (PII redaction): `src/lib/observability/scrub.ts`
- Memory: `sentry-source-maps-never-uploaded.md`, `posthog-js-drops-captures-under-automation.md`
