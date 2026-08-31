# ARCHITECTURE-OBSERVABILITY.md

What is recorded, what wakes somebody up, and how to tell the difference.

Status: BINDING. Branch `docs/architecture-night`, 2026-08-19.
Scope: **docs only.** No `src/`, no existing migration, no SQL executed.
Supersedes, where they disagree: `docs/ARCHITECTURE-OBSERVABILITY.md`,
`docs/ARCHITECTURE-OPS.md`, `docs/ARCHITECTURE-PRODUCTION-OPS.md`.
Code this describes: `src/lib/observability/` (log, alert, sentry, scrub,
request-id, with-request-log, action-context), `sentry.server.config.ts`,
`sentry.edge.config.ts`, `instrumentation-client.ts`, `src/lib/health/checks.ts`,
`src/app/api/cron/*`, `vercel.json`.

---

## 0. The governing rule

> **Capture broadly in Sentry. Alert narrowly on ntfy. Only for money.**

Sentry is **the record**. ntfy is **the interrupt**.

The audience for an interrupt is one operator with one phone. An alert that does
not lead to an action is noise that kills the channel, and a phone that buzzes
for a crawler hitting a dead URL is a phone whose owner stops looking at it.
Then the one alert that mattered arrives to an audience of nobody.

Everything in this document is downstream of that sentence.

---

## 1. Structured logs

`src/lib/observability/log.ts`. **One JSON object per line, correlated by
request id.**

### 1.1 What it replaced, and why the old thing was not enough

Thirty-four call sites of the shape:

```
console.error('search DLQ insert failed:', error.message)
console.error('[supplier] getSupplierSales', ...)
```

Eight different ad-hoc prefix conventions, a free-text message a log drain can
only grep, and, the part that actually cost something, **no way to tell which
lines came from the same request**. A checkout that half-fails writes from the
webhook, from the voucher email and from the settlement recorder, in three
modules that never learn each other's names, interleaved with every other
request the process is serving. Grouping them was a guess about timestamps.

### 1.2 Three decisions inside it

**`console`, not `process.stdout`.** `process.stdout` does not exist on the edge
runtime, and `src/proxy.ts` runs there under some deployments. `console` is the
one sink both runtimes have and it is what Vercel's log drain reads.
`console.error` is also what **marks a line as an error** there, which is why
the level chooses the method rather than only filling in a field.

**Every field goes through `redact()`.** These call sites pass Supabase error
objects and webhook payloads straight in. Reusing `scrub.ts` means the logger
cannot drift from what Sentry redacts.

**The threshold is read once, at module load.** A per-call `process.env` lookup
on a path every request touches buys nothing: the variable cannot change inside
a running process.

### 1.3 Correlation

```
request-id.ts        mints or accepts an id per request
request-store.ts     AsyncLocalStorage, so no module has to thread it
request-context.ts   what log.ts reads
with-request-log.ts  the route wrapper
action-context.ts    the server-action wrapper
```

Every route handler is wrapped (`withRequestLog('/api/...', handler)`) and every
server action is wrapped (`withActionContext('checkout.begin', ...)`). The
result is that a single failed checkout is **one `grep` on one id** across the
webhook, the finalize, the voucher email and the settlement recorder.

### 1.4 Event naming

`namespace.event_snake_case`, e.g. `cardcom.webhook_unauthenticated`,
`search.record_failed`, `search.recent_record_threw`. The namespace is the
subsystem, the event is greppable, and the fields carry the variables. **No
free-text messages**, because a message is a string a future refactor renames
and a dashboard silently stops matching.

---

## 2. Sentry

### 2.1 Scoped to the money path, deliberately

`capturePaymentError` and `capturePaymentAlarm` report **payment and redemption
failures**, not every caught exception in the app. The whole value of an alert
on this path is that it is rare and always means a customer was charged and
something afterwards went wrong. **A channel that also carries render errors
from the catalogue is a channel nobody reads.**

### 2.2 Configuration, and the reasoning behind each value

```ts
dsn:              process.env.SENTRY_DSN
environment:      SENTRY_ENVIRONMENT ?? NODE_ENV
release:          SENTRY_RELEASE ?? VERCEL_GIT_COMMIT_SHA
tracesSampleRate: 0
sendDefaultPii:   false
```

| Setting | Why |
|---|---|
| `release` tied to the commit | a stack trace can be read against the exact source it came from. The local fallback keeps a self-hosted build from reporting no release at all |
| `tracesSampleRate: 0` | tracing is high-volume by nature, and this project is one operator with a phone. What is wanted is **every error**, not a sample of every request |
| `sendDefaultPii: false` | PII here would be customer emails and addresses **in a third-party system**, and the money path already carries everything an investigation needs through the tagged context |

**Entirely inert without `SENTRY_DSN`.** `init` is skipped, every capture returns
immediately, nothing is queued. That is what keeps tests, CI and local dev free
of both network calls and configuration ceremony.

`initSentry()` remains as a **no-op** so existing callers do not break. Real
initialisation lives in `sentry.server.config.ts` / `sentry.edge.config.ts`,
loaded per runtime by `instrumentation.ts`. Calling `Sentry.init()` a second
time from application code would replace the configured client and **silently
drop the scrubber with it**.

### 2.3 Never throws

```ts
try { Sentry.withScope(...) } catch { /* best effort by definition */ }
```

Every call site is already on a failure branch. **An error thrown while
reporting an error becomes the error the customer sees.**

---

## 3. The scrubber

`src/lib/observability/scrub.ts`. **One implementation**, in a module with no
SDK import, because `sentry.edge.config.ts` cannot load `@sentry/node` and three
copies would drift.

### 3.1 Key-based redaction

```
token, secret, password, authorization, cookie, key, card, cvv, jwt
```

Matched **by substring**, so `p_idempotency_key` and `CARDCOM_API_PASSWORD` are
caught by the same rule.

`key` is deliberately the bare word rather than `api_key`. It also catches
`idempotency_key`, which is not itself a credential, but **the cost of losing
one from an error report is nothing, and the cost of a field named `*_key` being
added later and quietly shipping out is a great deal more.**

Recursion is **depth-limited to 4**: an unbounded walk over an
attacker-influenced payload is its own denial of service, and the Cardcom `raw`
blobs that reach these contexts are shallow anyway.

### 3.2 What key-based redaction cannot see, and the two fixes

**Headers and cookies are dropped wholesale**, not filtered key by key. They
carry the Supabase session and the Cardcom shared secret, and an allowlist there
is one header away from being wrong.

**A voucher token lives in the PATH**, where no key-based scrubber can reach it:

```ts
url.replace(/\/redeem\/[^/?#]+/, '/redeem/[redacted]')
   .replace(/([?&])(token|code|secret)=[^&]*/gi, '$1$2=[redacted]')
```

An error thrown on `/redeem/<token>` would otherwise put **a live coupon** into
Sentry's retained event.

### 3.3 The standing rule

Anything added to a Sentry context, a log field or an alert body must be assumed
to be **retained by a third party**. The list in §3.1 is a floor, not a ceiling,
and `payment_webhook_events.payload` remains the one place a raw callback body
belongs, because that table is service-key only.

---

## 4. Alerts: ntfy, and only five of them

`src/lib/observability/alert.ts`. **A single POST with a text body**, over plain
fetch. No SDK, no auth handshake, **no dependency that can break the alert about
the thing that broke.**

```
POST https://ntfy.sh/${NTFY_TOPIC ?? 'kenyon-ofir-limit'}
Title:    English, ASCII      <- ntfy reads these as ASCII; Hebrew arrives mangled
Priority: high
Tags:     warning
body:     the Hebrew message
timeout:  4000 ms
```

### 4.1 The timeout is load-bearing

`AbortSignal.timeout(4000)`. **A hung alert must not hold a webhook open**:
Cardcom retries on timeout, and a retry storm caused by our own alerting is
worse than a missed push.

### 4.2 Never throws, never rejects

Same rule as Sentry, same reason.

### 4.3 What is alerted

| # | Condition | Why it is an interrupt |
|---|---|---|
| 1 | Payment verified, `finalizeOrder` failed | card charged, order open. The worst state in the system |
| 2 | Cardcom callback for a payment we do not hold | a customer may be charged with no order and no order number to cite in a ticket |
| 3 | Cardcom reported success, `GetLpResult` disagreed | somebody is wrong about whether the card was charged |
| 4 | Amount mismatch | either our pricing is wrong or we were charged something we did not ask for |
| 5 | Voucher redemption failed for a paid voucher | a customer is standing at a till |

Plus two infrastructure conditions that reach the same channel because they
disable the five above: the webhook journal insert failing (503 path), and a
Cardcom callback that parses but matches no accepted secret.

### 4.4 What is deliberately NOT alerted

Catalogue render errors, 404s, validation failures, rate limits, search index
job failures, crawler traffic. **Those are Sentry's job.**

`ALERTS_ENABLED=false` turns the channel off entirely, for local dev and tests.

### 4.5 Why `alert.ts` has no `server-only` marker

Deliberate. The module makes one outbound fetch and reads two env vars; the
marker would buy nothing and would put the alerting path beyond the reach of a
unit test. **The alerting path is the one part of an incident response that has
to be known to work before the incident.**

---

## 5. Health checks

`src/lib/health/checks.ts`, served by `/api/health` and polled by
`/api/cron/health` every 5 minutes.

Seven dependencies, each reporting `ok | down | not_configured`:

| Check | What it proves |
|---|---|
| `database` | Supabase answers a trivial query |
| `rate_limiter` | the limiter store is reachable |
| `search` | Meilisearch answers, or is honestly `not_configured` |
| `cardcom` | credentials are present and the endpoint resolves |
| `email` | Resend is configured |
| `storage` | R2 or Supabase Storage is reachable |
| `scheduler` | crons have run recently |

### 5.1 `not_configured` is a first-class state

Not an error and not `ok`. A local machine with no Meilisearch is healthy; a
production deployment with no Meilisearch is not. **The same code returns the
same value and the alerting rule differs by environment**, which is the only way
a health check can be honest in both places.

`buildHealthAlert` decides whether the report is worth a push, so the health
cron does not become a sixth alert that fires every five minutes.

---

## 6. Cron

Ten scheduled jobs (`vercel.json`), all in `fra1`:

| Path | Schedule | Purpose |
|---|---|---|
| `/api/cron/notifications` | `*/5 * * * *` | outbound notification queue |
| `/api/cron/health` | `*/5 * * * *` | §5 |
| `/api/cron/invoices` | `*/10 * * * *` | invoice generation |
| `/api/cron/stock` | `*/10 * * * *` | stock recalculation, low-stock signals |
| `/api/cron/stranded-payments` | `*/10 * * * *` | **charged but not finalized.** §6.2 |
| `/api/cron/abandoned-cart` | `0 * * * *` | hourly |
| `/api/cron/subscriptions` | `30 2 * * *` | daily, pending PENDING-109 |
| `/api/cron/reap-carts` | `40 3 * * *` | daily guest-cart cleanup |
| `/api/cron/reconcile` | `0 4 * * *` | **daily terminal reconciliation.** §6.3 |
| `/api/cron/expire-vouchers` | `15 23 * * *` | daily, just before midnight |

### 6.1 Every one is gated by `CRON_SECRET`

Without it **no cron runs at all**, which means: no voucher expires, no stranded
payment is found, no reconciliation happens, and no invoice is issued. It is one
of the eight secrets `STATE.md` lists as blocking launch, and it is the one
whose absence is **silent**: nothing errors, the jobs simply never do anything.

### 6.2 `stranded-payments`, every ten minutes

The safety net under both the webhook and the return page. It finds payments
that verified but whose order never closed, and replays `finalizeOrder`, which
is idempotent. This is the automated half of F9 in
`ARCHITECTURE-CHECKOUT-CARDCOM-E2E.md` §6; `webhook-dlq.ts` is the other half.

### 6.3 `reconcile`, daily at 04:00

Compares our `payments` rows against the Cardcom terminal's own transaction
list. Three outcomes:

| Outcome | Meaning |
|---|---|
| matched | nothing to do |
| `missing_locally` | **Cardcom has a deal we have no payment for.** A customer was charged and has no order |
| `missing_remotely` | we have a payment Cardcom does not. Usually a `failed` we recorded optimistically |

`missing_locally` is the one that costs money and it is the reason this job
exists. It catches F2 hours after the webhook alarm did, and it catches the
second charge of a double payment that no webhook ever reported.

### 6.4 Cron observability requirements

- Each run emits a structured log line with the job name, duration and a count
  of what it did.
- A job that **finds nothing** must still log, because "the reconciliation has
  not run in three days" is otherwise indistinguishable from "there was nothing
  to reconcile".
- A job that throws must not silently retry into the next slot.
- **`scheduler` in §5 exists to detect the case where cron itself has stopped.**

---

## 7. Product analytics

| Tool | What it answers |
|---|---|
| Vercel Analytics (`@vercel/analytics/next`) | page views, referrers, geography |
| Vercel Speed Insights (`@vercel/speed-insights/next`) | field Core Web Vitals from real browsers |
| `AnalyticsProvider` + `src/server/analytics/track.ts` | funnel events, order attribution |

`AnalyticsProvider` calls `usePathname`, which under `cacheComponents` forces
its subtree dynamic. It is isolated in the layout for that reason, and the
isolation is a rendering constraint rather than a style preference.

`stampOrderAttribution` and `linkAnalyticsIdentity` connect an anonymous session
to a user at OAuth callback and to an order at checkout, which is what makes
"which channel produced revenue" answerable rather than "which channel produced
sessions".

### 7.1 Field data is the only Core Web Vitals data that counts here

Recorded because this repo has been burned by the alternative:

> **Lighthouse LCP on localhost is simulated.** It is Lantern over a graph
> containing the whole page. A 2.7 second real improvement showed up as noise.

Speed Insights is therefore the metric, and a local Lighthouse run is a
debugging aid, never a measurement.

---

## 8. Dashboards

Four, and no more, because a dashboard nobody opens is worse than none.

### 8.1 Money (the one that matters)

| Panel | Query |
|---|---|
| orders paid, last 24h | `count(*) from orders where paid_at > now() - interval '24 hours'` |
| **open orders older than an hour** | `orders where status='pending' and created_at < now() - interval '1 hour'` |
| **unprocessed webhook events** | `payment_webhook_events where processed_at is null` |
| payments `succeeded` with an unsettled line | the F9 detector, as a query |
| refunds past their deadline | `refunds where refund_due_by < now() and state <> 'completed'` (draft 121) |
| reconciliation deltas, last 7 days | `missing_locally` count per day |

Rows 2 and 3 are the two numbers to look at first on any morning. **Both should
be zero.**

### 8.2 Vouchers

Issued, redeemed, expired, and outstanding value. Plus scan outcomes broken down
by `voucher_scan_outcome`: a rise in `invalid_signature` is somebody probing,
and a rise in `wrong_supplier` is usually a supplier with two accounts rather
than an attack.

### 8.3 Catalogue and search

Empty-result searches (`search_events where empty_results > 0`, which is what
`search_events_empty_idx` exists for), index backlog, and products active
without an image.

### 8.4 Infrastructure

Health check history, cron last-run times, error rate by route from the
structured logs, and p95 latency on `/api/payments/cardcom/webhook`.

---

## 9. SLOs

Stated as objectives with a stated measurement, because an SLO with no
measurement is a slogan.

| # | Objective | Target | Measured by |
|---|---|---|---|
| 1 | **A charged card results in a closed order** | 99.9% within 5 minutes | `payment_webhook_events` with `processed_at` null, aged |
| 2 | **A closed order results in a delivered voucher** | 99.5% within 5 minutes | voucher rows vs. coupon line quantity |
| 3 | Checkout availability | 99.5% monthly | health check + route error rate |
| 4 | Voucher scan latency | p95 under 2 s | scan endpoint timing |
| 5 | Search availability | 99% | health check, with `not_configured` excluded |
| 6 | Refunds inside the statutory deadline | **100%** | `refunds.refund_due_by` (draft 121) |
| 7 | LCP on the product page | p75 under 2.5 s | Speed Insights field data, **not** Lighthouse |

**SLO 1 is the only one with an error budget of essentially zero**, because its
failure mode is a customer whose money is gone and whose order does not exist.
SLO 6 has no error budget at all, because its failures are regulatory rather
than technical.

---

## 10. Gaps

| Gap | Consequence | Fix |
|---|---|---|
| No log drain configured | structured logs live only in Vercel's retention window | route to a drain; the format is already JSON |
| `tracesSampleRate: 0` | no latency attribution when checkout is slow | deliberate today; revisit only with a specific question |
| SLOs are not computed anywhere | every number in §9 is a manual query | one cron writing a daily snapshot table |
| No alert on cron silence | §6.4 names the requirement; `scheduler` partially covers it | assert last-run age per job, not just "some cron ran" |
| No alert on search index backlog | a stale index is invisible | needs `search_index_outbox` (draft 122) to have a backlog to measure |
| Sentry only covers the money path | a catalogue-wide render failure is found by a customer | this is the deliberate trade in §0. Revisit when there is more than one operator |

The last row is the one to re-examine first after launch. The narrowness is
correct for one operator with one phone; it stops being correct the moment there
is a second person who could triage.
