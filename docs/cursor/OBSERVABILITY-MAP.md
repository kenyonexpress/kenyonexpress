# Observability map

This pack lives under
`docs/cursor/`
on branch
`ke-cursor-docs`.
It is markdown only.

At 03:00 you have a symptom, not a file name. This page maps **question → sink → event**.

Sinks are additive. Console JSON is the source of truth. Everything else is inert without env.

---

## 1. Sinks

| Sink | Env / path | What it is | What it is not |
|---|---|---|---|
| Vercel logs | `console.*` via
`src/lib/observability/log.ts` | One JSON object per line:
`ts`,
`level`,
`event`,
`request_id`,
`route`,
`method`,
fields (redacted) | A search engine. You grep
`event`. |
| Axiom | `AXIOM_TOKEN` +
`AXIOM_DATASET`.
Same object, fire-and-forget | Searchable copy of the log line | Allowed to fail a checkout (it cannot; errors swallowed) |
| Sentry EU | `SENTRY_DSN` /
`NEXT_PUBLIC_SENTRY_DSN`.
Tunnel
`/monitoring`
first in
`src/proxy.ts` | Exceptions +
`capturePaymentError`
(tag
`area=payments`,
`stage`,
`order_id`) | A pager. Broad capture would kill the channel. |
| ntfy | `NTFY_TOPIC`
default
`kenyon-ofir-limit`,
`ALERTS_ENABLED` | Phone interrupt for **money** only (
`alertMoneyFailure`) | Catalogue 404s. Titles English; body Hebrew; **no amounts**. |
| PostHog | `NEXT_PUBLIC_POSTHOG_KEY`
HTTP `/capture/`, no SDK | Product analytics | Source of truth for money |
| First-party analytics | `analytics_events`
via
`fn_ingest_analytics_events` | Client 8 + server 4 names | Server four **silently skipped** until 169 |
| Vercel Analytics / Speed Insights | layout import | Web vitals vendor | Duplicate of
`web_vital`
event |
| Postgres journals | `payment_events`
(append-only),
`audit_log`,
`voucher_redemptions`,
`notification_outbox` | Durable facts | Not in Sentry. Query them. |
| Health | `/api/health`,
`/api/ready`,
cron
`/api/cron/health` | Liveness / dependency probes | Not a substitute for stranded-payment cron |

`request_id`:
`src/lib/observability/request-id.ts`
+
`withRequestLog`
on routes,
`withActionContext`
on actions. If a checkout has no id, the wrapper was skipped (there is a coverage test).

`redact()`
(`src/lib/observability/scrub.ts`):
substring keys
`token|secret|password|authorization|cookie|key|card|cvv|jwt`.
Depth 4. Edge-safe (no `@sentry/node`).

Raw
`console.*`
in
`src/`
is forbidden except
`log.ts`
and
`app/error.tsx`
(
`log-coverage.test.ts`).

---

## 2. First-party events (analytics)

Client (
`CLIENT_EVENT_NAMES`):
`page_view`,
`view_product`,
`view_category`,
`add_to_cart`,
`remove_from_cart`,
`checkout_step`,
`web_vital`,
`whatsapp_click`.

Server (
`SERVER_EVENT_NAMES`,
never from a browser):
`begin_checkout`,
`purchase`,
`voucher_redeemed`,
`order_refunded`.

Client required props: see
`REQUIRED_PROPS`
in
`src/lib/analytics/events.ts`.
Batch max 20, props ≤4KB, PII-free by convention.

**169 not applied:** ingest whitelist is the 151 client eight. Server names are **dropped with no row**. Admin dashboard showing 0 purchases is not a closed till. Log
`analytics.event_rejected`
/
`analytics.track_failed`.

GA4 helper
`sendGaEvent`
exists on redeem; it is not the ledger.

---

## 3. Log `event` names you actually grep

Prefixes. Not exhaustive (coverage test forbids new
`console.error`,
not a frozen event enum).

### 3.1 Money

| Event | When | 03:00 question |
|---|---|---|
| `checkout.*` | beginCheckout reads, reserve, gift, replay | Why did Pay not start? |
| `finalize.stock_consume_failed` | After pay, stock RPC failed | Charged; fulfilment risk. **Must not un-pay.** |
| `finalize.token_not_saved` | Tokenisation failed after charge | Next recurring / one-click broken; charge may be ok |
| `finalize.cashback_notify_failed` | Wallet credit notify | Cashback missing; order still paid |
| `finalize.billing_read_failed` | Invoice inputs | Receipt missing |
| `analytics.server_purchase_threw` | Purchase event threw | Funnel hole, money may be fine |
| webhook route (Cardcom) | 401 / 23505 / finalize | Paid card, no order |
| `invoices.*` | Issue / mirror / dead | No PDF; Cardcom may still have doc 4 |
| `gifts.*` | Gift mail | Recipient has no claim link |

Money failures should also Sentry
`stage`
+ ntfy
`KE money path: <stage>`.
If ntfy is silent and Sentry is empty, check
`SENTRY_DSN`
and
`ALERTS_ENABLED=false`.

### 3.2 Auth and account

| Event | When | Question |
|---|---|---|
| `auth.error_unmapped` | Supabase English not in
`ERROR_MAP` | Why does the form say generic Hebrew? |
| `account.delete_*` | Anonymize path | Deletion half-finished (satellites vs auth) |
| `account.delete_fallback_no_rpc` | 150 missing | Fallback non-atomic delete ran |

### 3.3 Search and cron

| Event | When | Question |
|---|---|---|
| search DLQ / index-job | Meili drain | Why is `/search` stale vs admin? |
| `retention.sweep_failed` / `retention.swept` | Monthly IP null | Audit IPs still there? 157 pending → cron
`ok: true, pending` |
| `subscriptions.table_absent` | 135 missing | Recurring UI empty |
| `admin_reports.not_installed` | Report RPC missing | Dashboard empty, not denied |

Cron auth failure is **401 empty JSON**, by design. Operator: secret, not the job.

---

## 4. Durable tables (when logs are gone)

| Table | Question it answers |
|---|---|
| `payment_events` | What Cardcom said, in order. Append-only trigger. Replay-safe. |
| `payments` | Our row: amount agorot, status, Low Profile id, account id |
| `orders` /
`order_items` | Snapshot percent, commission, supplier due. Settlement status. |
| `vouchers` /
`voucher_redemptions` | Issued vs scanned; every attempt including
`not_found` |
| `notification_outbox` | Email kind, attempts, dead, Resend id |
| `audit_log` | Who changed role/catalogue. IPs until 157 ages them. |
| `wallet_entries` | Cashback / refund-to-wallet / spend. Idempotency keys. |
| `split_executions` | Settlement split happened |
| `analytics_events` | Funnel (after 169 for server names) |
| `rate_limits` | Who is 429 |

`payment_events.detail`
may contain provider blobs. Redact in logs; the table is the legal journal. Deletion policy:
`docs/cursor/DATA-RETENTION.md`.

---

## 5. Playbook: symptom → first grep

### Customer: "I paid, no coupon"

1. ntfy / Sentry
   `stage`
   in the last hour.
2. Vercel:
   `request_id`
   from
   `/api/payments/cardcom/webhook`.
3. SQL:
   `payments`
   for the email / time;
   `paid_at`
   on
   `orders`;
   `vouchers`
   for
   `order_id`.
4. If payment captured, order not paid: **do not refund from panic**. Finalize is replay-safe. Re-POST is ok if secret matches. Then
   `stranded-payments`
   cron.
5. If paid + no voucher:
   `VoucherIssueError`
   /
   `42703`
   generation probe.

### Till: "code not found"

1. `voucher_redemptions`
   outcome (including collapsed
   `wrong_supplier`).
2. `vouchers.status`
   and
   `expires_at`.
3. QR secret rotation (all codes die).
4. Member session (wrong business).

### "No purchase in analytics"

1. Is 169 applied? If not, this is expected.
2. `analytics.event_rejected`
3. Do not halt the till.

### "No voucher email"

1. `notification_outbox`
   status / dead.
2. Resend 400 invalid key (H1).
3. Cron
   `notifications`
   401 →
   `CRON_SECRET`.

### "Site down"

1. `/api/health`
   vs `/api/ready`.
2. Vercel deployment, not Cloudflare staged zone.
3. Supabase status.

### "Images 404 after DNS"

Not a log event. R2 migration (H2). WordPress
`/wp-content/uploads`
is gone.

---

## 6. Metrics (thin on purpose)

| Metric | Where | Action |
|---|---|---|
| LCP/CLS/INP/TTFB/FCP | `web_vital` + Speed Insights | Field only; ignore laptop Lighthouse 70 |
| Outbox dead count | Admin queues +
`invoices.dead_alert_*` | Retry / Resend |
| Cron job success | GitHub Actions
`cron.yml` | 401 vs 500 vs
`pending` |
| Rate limit 429 rate | `rate_limits` | Abuse vs Redis down |
| Sentry error rate on
`area=payments` | Sentry | Wake up |

There is no Datadog. There is no Prometheus. Adding one is a post-launch luxury (
`docs/cursor/POST-LAUNCH-ROADMAP.md`
does not list it; do not sneak it into launch).

---

## 7. Rules that keep 03:00 possible

- New route:
  `withRequestLog('/path', handler)`.
- New action:
  `withActionContext`.
- New money failure:
  `capturePaymentError` +
  `alertMoneyFailure`.
  Identifiers only on ntfy.
- Never return
  `error.message`
  on a public JSON route.
- Never log PAN, tokens, webhook secrets (scrubber is substring; do not name a field
  `payload`
  and stuff a card into it).

Guest cart correlation: the browser shows
`ke_session_id`.
`analytics_events.anonymous_id`
is that UUID. The database
`carts.session_id`
is the same UUID, reached via a **different** cookie name on the PostgREST call. Grepping Vercel for
`ke_session_id`
will not hit Postgres logs.
