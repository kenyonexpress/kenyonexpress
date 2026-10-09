# ARCHITECTURE-OBSERVABILITY.md


> <!-- v1-final-banner:2026-09-01 -->
> ⚠️ **This document names tables that do not exist in production.**
>
> | Named here | In production |
> |---|---|
> | `audit_events` | `audit_log` |
>
> The design below may still be sound; the schema it assumes was not built, or
> was built under another name. Verify against `docs/DATA-MODEL.md` before
> writing a query, and see `docs/SCHEMA-REALITY-CHECK.md` for the full mapping.

KenyonExpress **observability** architecture (binding logs, errors, money audit, alerts, dashboards).

Status: BINDING · worktree `/Users/ofir/kenyonexpress-web/ke-arch-observability` · branch `arch/observability` (2026-07-30)
Scope: **docs only.** Full TypeScript / SQL below is the implementation contract.
Companions: live `src/lib/observability/sentry.ts`, `src/instrumentation.ts`, `docs/ARCHITECTURE-SECURITY.md`.

Operator model: single owner with a phone. Alerts must be rare and actionable. Noise kills the channel.

Stack:

| Concern | Tool |
|---|---|
| Structured logs | **pino** (every Server Action / money Route Handler) |
| Errors | **Sentry** client + server (Node) + edge |
| Product analytics | **Vercel Analytics** (+ Speed Insights optional) |
| Money evidence | Postgres **`audit_events`** (append-only) + existing `audit_log` |
| Critical push | **Ntfy.sh** topic `kenyon-ofir-limit` |
| Dashboards | Admin money board + Sentry + Vercel + SQL views |

---

## 0. Principles

1. **Logs diagnose. DB proves.** Cardcom disputes and coupon scans are decided from append-only tables, not Vercel log lines.
2. **Money path alerts are sacred.** Prefer missing a catalog 500 over drowning SEV1 with noise.
3. **Redact always:** tokens, secrets, PAN/CVV, cookies, JWTs, `cardcom_token`. Shared scrubber for pino + Sentry.
4. **Integer agorot** in `audit_events` money columns. Never float ILS in evidence rows.
5. **Ntfy for SEV1/SEV2 only.** Topic: `kenyon-ofir-limit`.
6. No Session Replay. `tracesSampleRate` low or 0 on free tier; errors first.

### Severity

| Sev | Meaning | Channel |
|---|---|---|
| SEV1 | Customer may have been charged; finalize/redeem broken | Ntfy + Sentry |
| SEV2 | Money path degraded (webhook verify fail, rate of 5xx) | Ntfy + Sentry |
| SEV3 | Ops hygiene (cron lag, coverage) | Sentry/email digest only |

---

## 1. pino: every Server Action

### 1.1 Logger module

```typescript
// src/lib/observability/logger.ts
import pino from 'pino'

const REDACT_PATHS = [
  'password',
  'authorization',
  'cookie',
  'cardcom_token',
  'token',
  'secret',
  'cvv',
  'jwt',
  'req.headers.authorization',
  'req.headers.cookie',
]

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  base: {
    service: 'kenyonexpress',
    env: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  },
  redact: {
    paths: REDACT_PATHS,
    censor: '[redacted]',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label) {
      return { level: label }
    },
  },
})

export function actionLogger(action: string, extra?: Record<string, unknown>) {
  return logger.child({ component: 'server_action', action, ...extra })
}
```

### 1.2 Wrapper for Server Actions

```typescript
// src/lib/observability/with-action-log.ts
import { actionLogger } from '@/lib/observability/logger'
import { capturePaymentError } from '@/lib/observability/sentry'
import { notifyCritical } from '@/lib/observability/ntfy'
import { recordAuditEvent } from '@/lib/observability/audit-events'

type MoneyMeta = {
  domain: 'payment' | 'coupon' | 'webhook' | 'wallet' | 'admin' | 'cart'
  orderId?: string
  paymentId?: string
  voucherId?: string
  amountAgorot?: number
}

export function withActionLog<TArgs extends unknown[], TResult>(
  name: string,
  meta: MoneyMeta | null,
  fn: (...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs) => {
    const log = actionLogger(name, meta ?? undefined)
    const started = Date.now()
    log.info({ event: 'action.start' }, 'start')
    try {
      const result = await fn(...args)
      log.info({ event: 'action.ok', ms: Date.now() - started }, 'ok')
      return result
    } catch (error) {
      log.error({ event: 'action.err', ms: Date.now() - started, err: error }, 'failed')
      if (meta && ['payment', 'coupon', 'webhook', 'wallet'].includes(meta.domain)) {
        capturePaymentError(error, {
          stage: name,
          orderId: meta.orderId,
          paymentId: meta.paymentId,
          voucherId: meta.voucherId,
        })
        await notifyCritical({
          title: `SEV1 ${name}`,
          body: error instanceof Error ? error.message : String(error),
          tags: ['warning', 'money'],
        })
        await recordAuditEvent({
          kind: 'action_error',
          domain: meta.domain,
          severity: 'sev1',
          orderId: meta.orderId ?? null,
          paymentId: meta.paymentId ?? null,
          voucherId: meta.voucherId ?? null,
          amountAgorot: meta.amountAgorot ?? null,
          payload: { action: name, message: error instanceof Error ? error.message : String(error) },
        })
      }
      throw error
    }
  }
}
```

### 1.3 Usage in checkout

```typescript
// src/server/actions/payments/checkout.ts (excerpt)
'use server'

import { withActionLog } from '@/lib/observability/with-action-log'

async function beginCheckoutImpl(/* ... */) {
  // existing checkout body
}

export const beginCheckout = withActionLog(
  'payments.beginCheckout',
  { domain: 'payment' },
  beginCheckoutImpl,
)
```

Binding: every money Server Action and every money Route Handler entry logs `action.start` / `action.ok` / `action.err` via pino. No bare `console.log` on money paths.

---

## 2. Sentry: client + server + edge

### 2.1 Server (Node)

```typescript
// src/lib/observability/sentry.ts
import * as Sentry from '@sentry/node'
import { redact } from '@/lib/observability/redact'

const DSN = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN

let initialised = false

export function initSentry(): void {
  if (initialised || !DSN) return
  initialised = true
  Sentry.init({
    dsn: DSN,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request?.headers) event.request.headers = {}
      if (event.request?.cookies) event.request.cookies = {}
      if (event.extra) event.extra = redact(event.extra) as Record<string, unknown>
      return event
    },
  })
}

export type PaymentErrorContext = {
  stage: string
  orderId?: string | null
  paymentId?: string | null
  voucherId?: string | null
  detail?: Record<string, unknown>
}

export function capturePaymentError(error: unknown, context: PaymentErrorContext): void {
  if (!DSN) return
  try {
    Sentry.withScope((scope) => {
      scope.setTag('area', 'payments')
      scope.setTag('domain', 'payment')
      scope.setTag('stage', context.stage)
      if (context.orderId) scope.setTag('order_id', context.orderId)
      scope.setContext(
        'payment',
        redact({
          stage: context.stage,
          order_id: context.orderId ?? null,
          payment_id: context.paymentId ?? null,
          voucher_id: context.voucherId ?? null,
          ...(context.detail ?? {}),
        }) as Record<string, unknown>,
      )
      scope.setLevel('error')
      Sentry.captureException(error instanceof Error ? error : new Error(String(error)))
    })
  } catch {
    // best effort
  }
}
```

```typescript
// src/instrumentation.ts
import type { Instrumentation } from 'next'

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initSentry } = await import('@/lib/observability/sentry')
    initSentry()
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    const { initSentryEdge } = await import('@/lib/observability/sentry-edge')
    initSentryEdge()
  }
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const path = request.path ?? ''
  const onMoneyPath =
    path.startsWith('/api/payments/') ||
    path.startsWith('/api/supplier/vouchers/') ||
    path.startsWith('/api/cron/') ||
    path.startsWith('/checkout')
  if (!onMoneyPath) return
  const { capturePaymentError } = await import('@/lib/observability/sentry')
  capturePaymentError(error, {
    stage: `request:${context.routeType}`,
    detail: { path, method: request.method, route: context.routePath },
  })
}
```

### 2.2 Edge

```typescript
// src/lib/observability/sentry-edge.ts
import * as Sentry from '@sentry/node'

const DSN = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN
let ok = false

export function initSentryEdge(): void {
  if (ok || !DSN) return
  ok = true
  Sentry.init({
    dsn: DSN,
    environment: process.env.VERCEL_ENV ?? 'edge',
    tracesSampleRate: 0,
    sendDefaultPii: false,
  })
}
```

### 2.3 Client

```typescript
// src/instrumentation-client.ts
import * as Sentry from '@sentry/browser'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  enabled: process.env.NODE_ENV === 'production',
  tracesSampleRate: 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  sendDefaultPii: false,
})
```

```tsx
// src/app/global-error.tsx
'use client'

import * as Sentry from '@sentry/browser'
import { useEffect } from 'react'

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="he" dir="rtl">
      <body>
        <h1>משהו השתבש</h1>
        <p>נרשמה תקלה. נסו לרענן.</p>
      </body>
    </html>
  )
}
```

---

## 3. Vercel Analytics

```tsx
// src/app/layout.tsx (excerpt)
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
```

Rules:

- Analytics is product traffic, not money evidence.
- Never send voucher codes, emails, or card metadata as custom events.
- Allowed custom events: `add_to_cart`, `begin_checkout`, `purchase_ok` (order id prefix only).

```typescript
// src/lib/observability/analytics.ts
import { track } from '@vercel/analytics'

export function trackPurchaseOk(orderId: string) {
  track('purchase_ok', { order_prefix: orderId.slice(0, 8) })
}
```

---

## 4. `audit_events` (money evidence)

Distinct from general `audit_log` (admin UI). `audit_events` is the money timeline for alerts and forensics.

### 4.1 Migration

```sql
-- 088_audit_events_money.sql
CREATE TABLE IF NOT EXISTS public.audit_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  kind            text NOT NULL,
  domain          text NOT NULL CHECK (domain IN (
                    'payment', 'coupon', 'webhook', 'wallet', 'admin', 'cart', 'system'
                  )),
  severity        text NOT NULL DEFAULT 'info'
                    CHECK (severity IN ('info', 'sev3', 'sev2', 'sev1')),
  actor_user_id   uuid,
  order_id        uuid,
  payment_id      uuid,
  voucher_id      uuid,
  amount_agorot   integer,
  currency        text NOT NULL DEFAULT 'ILS',
  idempotency_key text,
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT audit_events_amount_nonneg CHECK (amount_agorot IS NULL OR amount_agorot >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS audit_events_idempotency_uniq
  ON public.audit_events (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS audit_events_created_idx
  ON public.audit_events (created_at DESC);

CREATE INDEX IF NOT EXISTS audit_events_domain_sev_idx
  ON public.audit_events (domain, severity, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_events_order_idx
  ON public.audit_events (order_id)
  WHERE order_id IS NOT NULL;

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_events_admin_select ON public.audit_events;
CREATE POLICY audit_events_admin_select ON public.audit_events
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.audit_events_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_events_immutable ON public.audit_events;
CREATE TRIGGER trg_audit_events_immutable
  BEFORE UPDATE OR DELETE ON public.audit_events
  FOR EACH ROW EXECUTE FUNCTION public.audit_events_immutable();
```

### 4.2 Writer

```typescript
// src/lib/observability/audit-events.ts
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/observability/logger'

export type AuditEventInput = {
  kind: string
  domain: 'payment' | 'coupon' | 'webhook' | 'wallet' | 'admin' | 'cart' | 'system'
  severity?: 'info' | 'sev3' | 'sev2' | 'sev1'
  actorUserId?: string | null
  orderId?: string | null
  paymentId?: string | null
  voucherId?: string | null
  amountAgorot?: number | null
  idempotencyKey?: string | null
  payload?: Record<string, unknown>
}

export async function recordAuditEvent(input: AuditEventInput): Promise<void> {
  try {
    const admin = createAdminClient()
    const { error } = await admin.from('audit_events').insert({
      kind: input.kind,
      domain: input.domain,
      severity: input.severity ?? 'info',
      actor_user_id: input.actorUserId ?? null,
      order_id: input.orderId ?? null,
      payment_id: input.paymentId ?? null,
      voucher_id: input.voucherId ?? null,
      amount_agorot: input.amountAgorot ?? null,
      idempotency_key: input.idempotencyKey ?? null,
      payload: input.payload ?? {},
    })
    if (error) logger.error({ err: error, event: 'audit_events.write_fail' }, 'audit write failed')
  } catch (err) {
    logger.error({ err, event: 'audit_events.write_fail' }, 'audit write failed')
  }
}
```

### 4.3 Mandatory money kinds

| kind | When |
|---|---|
| `checkout_started` | beginCheckout |
| `payment_initiated` | Low Profile / token charge created |
| `webhook_received` | raw webhook stored |
| `webhook_signature_invalid` | SEV1 |
| `payment_settled` | finalize success |
| `payment_finalize_failed` | SEV1 |
| `voucher_issued` | mint after pay |
| `voucher_redeem_success` | scan used |
| `voucher_redeem_refused` | already_used / wrong shop / etc. |
| `refund_executed` | admin refund |
| `action_error` | withActionLog catch |

---

## 5. Ntfy.sh alerts

Topic (binding): **`kenyon-ofir-limit`**

```typescript
// src/lib/observability/ntfy.ts
import { logger } from '@/lib/observability/logger'

const TOPIC = process.env.NTFY_TOPIC ?? 'kenyon-ofir-limit'
const BASE = process.env.NTFY_BASE_URL ?? 'https://ntfy.sh'
const TOKEN = process.env.NTFY_TOKEN

export async function notifyCritical(input: {
  title: string
  body: string
  tags?: string[]
  priority?: 3 | 4 | 5
}): Promise<void> {
  try {
    const headers: Record<string, string> = {
      Title: input.title,
      Priority: String(input.priority ?? 5),
      Tags: (input.tags ?? ['rotating_light']).join(','),
    }
    if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`

    const res = await fetch(`${BASE}/${TOPIC}`, {
      method: 'POST',
      headers,
      body: input.body.slice(0, 4000),
    })
    if (!res.ok) {
      logger.error({ status: res.status, event: 'ntfy.fail' }, 'ntfy publish failed')
    }
  } catch (err) {
    logger.error({ err, event: 'ntfy.fail' }, 'ntfy publish failed')
  }
}
```

Call sites (must):

- Invalid Cardcom webhook signature
- Finalize failure after charge
- `redeem_voucher` infrastructure error (not business refusal)
- Cron reconcile unmatched payment
- Rate of payment 5xx above threshold (alerts cron)

Phone: install ntfy app, subscribe to `kenyon-ofir-limit`.

---

## 6. Alerts cron + dashboards

### 6.1 Cron route

```typescript
// src/app/api/cron/alerts/route.ts
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyCritical } from '@/lib/observability/ntfy'
import { recordAuditEvent } from '@/lib/observability/audit-events'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('unauthorized', { status: 401 })
  }

  const admin = createAdminClient()
  const since = new Date(Date.now() - 15 * 60_000).toISOString()
  const { count } = await admin
    .from('audit_events')
    .select('id', { count: 'exact', head: true })
    .eq('kind', 'webhook_signature_invalid')
    .gte('created_at', since)

  if ((count ?? 0) >= 3) {
    await notifyCritical({
      title: 'SEV2 Cardcom signature failures',
      body: `${count} invalid signatures in 15m`,
      tags: ['cardcom', 'warning'],
      priority: 4,
    })
    await recordAuditEvent({
      kind: 'alert_fired',
      domain: 'webhook',
      severity: 'sev2',
      payload: { count, window: '15m' },
    })
  }

  return Response.json({ ok: true, checked: ['webhook_signature_invalid'] })
}
```

### 6.2 SQL dashboard views

```sql
CREATE OR REPLACE VIEW public.v_money_alarms AS
SELECT
  kind,
  domain,
  severity,
  count(*) AS n,
  max(created_at) AS last_seen
FROM public.audit_events
WHERE created_at > now() - interval '24 hours'
  AND severity IN ('sev1', 'sev2')
GROUP BY 1, 2, 3
ORDER BY n DESC;

CREATE OR REPLACE VIEW public.v_payments_funnel_24h AS
SELECT
  date_trunc('hour', created_at) AS hour,
  kind,
  count(*) AS n,
  coalesce(sum(amount_agorot), 0) AS amount_agorot
FROM public.audit_events
WHERE domain = 'payment'
  AND created_at > now() - interval '24 hours'
GROUP BY 1, 2
ORDER BY 1 DESC;
```

### 6.3 Admin UI board

```tsx
// src/app/(admin)/admin/observability/page.tsx
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminSession } from '@/lib/admin/rbac'

export const metadata = { title: 'ניטור' }

export default async function ObservabilityPage() {
  await requireAdminSession()
  const admin = createAdminClient()
  const { data: alarms } = await admin.from('v_money_alarms').select('*').limit(50)
  const { data: recent } = await admin
    .from('audit_events')
    .select('created_at, kind, domain, severity, amount_agorot, order_id')
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <main dir="rtl" className="p-6">
      <h1 className="text-2xl font-bold">ניטור כסף</h1>
      <section className="mt-6">
        <h2 className="text-lg font-semibold">התראות 24ש</h2>
        <ul>
          {(alarms ?? []).map((a) => (
            <li key={`${a.kind}-${a.severity}`}>
              {a.severity} · {a.domain}/{a.kind}: {a.n}
            </li>
          ))}
        </ul>
      </section>
      <section className="mt-6">
        <h2 className="text-lg font-semibold">אירועים אחרונים</h2>
        <table>
          <thead>
            <tr>
              <th>זמן</th>
              <th>סוג</th>
              <th>חומרה</th>
              <th>סכום (אגורות)</th>
            </tr>
          </thead>
          <tbody>
            {(recent ?? []).map((r) => (
              <tr key={`${r.created_at}-${r.kind}-${r.order_id}`}>
                <td>{r.created_at}</td>
                <td>
                  {r.domain}/{r.kind}
                </td>
                <td>{r.severity}</td>
                <td>{r.amount_agorot ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="mt-4 text-sm text-gray-600">
        Sentry + Vercel Analytics + Ntfy topic kenyon-ofir-limit
      </p>
    </main>
  )
}
```

External dashboards:

| Board | What to watch |
|---|---|
| Sentry | `area:payments` errors |
| Vercel | p95 / errors on `/api/payments/*` |
| ntfy | phone subscription to `kenyon-ofir-limit` |
| Admin `/admin/observability` | `v_money_alarms` |

---

## 7. Shared redact helper

```typescript
// src/lib/observability/redact.ts
const PATTERNS = ['token', 'secret', 'password', 'authorization', 'cookie', 'key', 'card', 'cvv', 'jwt']

function shouldRedact(key: string): boolean {
  const lower = key.toLowerCase()
  return PATTERNS.some((p) => lower.includes(p))
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[truncated]'
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((e) => redact(e, depth + 1))
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = shouldRedact(k) ? '[redacted]' : redact(v, depth + 1)
  }
  return out
}
```

---

## 8. Env / Vercel secrets

| Name | Public? |
|---|---|
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | server / client DSN |
| `SENTRY_ENVIRONMENT` | no |
| `LOG_LEVEL` | no |
| `NTFY_TOPIC` (default `kenyon-ofir-limit`) | no |
| `NTFY_TOKEN` | no |
| `NTFY_BASE_URL` | no |
| `CRON_SECRET` | no |
| `SUPABASE_SERVICE_ROLE_KEY` | no (audit writes) |

---

## 9. Acceptance

- [ ] pino child logger on every money Server Action
- [ ] Sentry init on Node + client; edge stub safe without DSN
- [ ] Vercel `<Analytics />` in root layout
- [ ] `audit_events` append-only with FORCE RLS
- [ ] Ntfy publishes to `kenyon-ofir-limit` on SEV1/SEV2
- [ ] Admin observability dashboard reads views
- [ ] No secrets in logs or Sentry payloads
- [ ] Webhook bad signature leads to audit_event + ntfy

---

## 10. Related paths

```
src/lib/observability/logger.ts
src/lib/observability/with-action-log.ts
src/lib/observability/sentry.ts
src/lib/observability/sentry-edge.ts
src/lib/observability/redact.ts
src/lib/observability/ntfy.ts
src/lib/observability/audit-events.ts
src/lib/observability/analytics.ts
src/instrumentation.ts
src/instrumentation-client.ts
src/app/global-error.tsx
src/app/api/cron/alerts/route.ts
src/app/(admin)/admin/observability/page.tsx
supabase/migrations/088_audit_events_money.sql
```

---

## 11. Open questions

1. Adopt `@sentry/nextjs` full SDK vs keep narrow `@sentry/node` money-only?
2. Dual-write `audit_log` + `audit_events` or migrate admin UI to `audit_events` for money rows?
3. Ntfy public topic vs access token (prefer token in production)?
