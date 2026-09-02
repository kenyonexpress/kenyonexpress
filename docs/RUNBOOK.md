# Runbook

Operational procedures for KenyonExpress. Written to be read at 3am by someone
who did not write the code.

## Kill switches

Four subsystems can be taken out of the request path without shipping code.
Each has a degraded path that is slower or emptier, never broken.

| Subsystem | Variable | Set it to | Degraded behaviour |
| --- | --- | --- | --- |
| Cache | `KILL_SWITCH_CACHE` | `1` | Reads go straight to Postgres. Slower, never wrong: everything cached is derived from the database. |
| Search | `KILL_SWITCH_SEARCH` | `1` | The search route answers an empty result set. A search box that returns nothing is a degraded shop; one that 500s is a broken one. |
| Recommendations | `KILL_SWITCH_RECS` | `1` | Recommendation strips render nothing. The page around them is unaffected. |
| Notifications | `KILL_SWITCH_NOTIFICATIONS` | `1` | Outbound email and push are skipped. The event is still recorded, so nothing is lost that cannot be resent. |

Implementation: `src/lib/resilience/kill-switches.ts`.

**Only a value that plainly says so counts as ON**: `1`, `true`, `on`, `yes`,
in any case, with surrounding whitespace tolerated. Unset, empty, `0`, `false`,
`off` and anything unrecognised all mean the subsystem is RUNNING. That
asymmetry is deliberate: a switch that is on by accident takes a working
subsystem out of the shop.

**What "without a deploy" honestly means.** The switches read `process.env` at
call time, not at module load, so a serverless instance picks up a changed
value as soon as it is given one. On Vercel that still requires the env change
to reach a new instance. It is NOT the same as a database-backed flag flipped
from an admin page and honoured by every running instance within a second.

A truly deploy-free switch needs a table, and this repository applies no
migrations from an agent, so that table does not exist. If you are in an
incident: flipping the variable is enough for the next instance, not for the
one currently serving the request that woke you.

## Dependency failures, and what actually happens

Measured behaviour, with the test that holds it. `src/lib/resilience/chaos.test.ts`.

| Dependency | On failure | Where |
| --- | --- | --- |
| Upstash (Redis) | The rate limiter fails OPEN: requests are allowed rather than refused. There is a 1s timeout on every call, and config is read per call. | `src/lib/rate-limit/upstash.ts`, `src/lib/utils/rate-limit.ts:22` |
| Meilisearch | Nothing to fall back from. Search is Postgres `ILIKE` over `name_he` + `description_he` and always has been; Meilisearch exists only as an indexer and a settings file, not in the query path. | `src/app/api/search/route.ts` |
| Cardcom | 15s timeout on every call (`CARDCOM_TIMEOUT_MS`), and ONE retry on transport failure for read-only calls only. See below. | `src/lib/payments/cardcom.ts` |
| R2 | When the R2 variables are absent, uploads fall back to Supabase Storage. | `src/lib/storage/r2.ts`, `isR2Configured()` |
| Supabase | 10s deadline on every call (`SUPABASE_TIMEOUT_MS`), applied at client construction so all seven factories and every query through them are covered. A timeout raises `SupabaseTimeoutError`, distinct from a network error. | `src/lib/supabase/timeout-fetch.ts` |

### Cardcom: why the retry is not uniform

A POST to `ChargeToken.aspx` that times out has **not** necessarily failed. The
request may have arrived, the card may be charged, and only the response lost.
The legacy `/Interface/*.aspx` interface offers no idempotency key, so a second
POST is a second charge.

Retry is therefore opt-in per call site and off by default:

| Endpoint | Retried | Why |
| --- | --- | --- |
| `GetLpResult.aspx` | yes | Read-only. This is the call the webhook depends on to decide whether the customer was charged. |
| `ListTransactions.aspx` | yes | Read-only. |
| `LowProfile.aspx` | yes | Creates a hosted page and charges nothing. A duplicate page is abandoned, not billed. |
| `ChargeToken.aspx` | **never** | Charges the card. |
| `RefundDeal.aspx` | **never** | Moves money. |
| `BillGoldPost.aspx` | **never** | Issues a document. A duplicate invoice is a real-world problem. |

The retry is for a **transport** failure only: a timeout or a thrown fetch. A
response that arrives and says something we did not like is an answer, not a
failure to reach the provider, and it is returned as-is.

### If a customer says they were charged twice

1. `select * from payment_events where order_id = '<id>' order by occurred_at` —
   the journal records `callback_received`, `callback_replay`, `verify_*` and
   `finalize_*` with the same `stage` token the Sentry alarm carries.
   A `callback_replay` row is Cardcom delivering the same event twice, which is
   the dedup working and is NOT a second charge.
2. `ListTransactions.aspx` for the terminal is the provider's own account of
   what it charged. `src/lib/payments/terminal-reconciliation.ts` compares it.
3. Two `succeeded` payment rows for one order is a real double charge. One row
   with two journal entries is not.

## Health versus ready

| Route | Meaning | 503 when |
| --- | --- | --- |
| `/api/health` | Liveness plus one HEAD count on `categories`. For an uptime ping. | Database probe fails. |
| `/api/ready` | The five named dependencies: database, redis (the rate limiter), meilisearch, r2, cardcom. Status only, no details, no terminal numbers. | Any mapped check is `down`. `not_configured` is not an outage. |

JSON logs and request ids go through Next, not Hono. This app is App Router. `src/proxy.ts` mints the id. `src/lib/observability/with-request-log.ts` binds it onto every wrapped route. `src/lib/observability/log.ts` emits one JSON object per line with `request_id`. There is no Hono process.

## Sentry

Three runtimes, one DSN, release from `SENTRY_RELEASE` or `VERCEL_GIT_COMMIT_SHA`.

| Runtime | Loaded by | Covers |
| --- | --- | --- |
| Node | `src/instrumentation.ts` then `sentry.server.config.ts` | Pages, server actions, cron routes (`src/app/api/cron/*`). Those cron routes are the workers. |
| Edge | `src/instrumentation.ts` then `sentry.edge.config.ts` | `src/proxy.ts` |
| Browser | `@sentry/nextjs` via `withSentryConfig` in `next.config.ts` | Client errors, tunnel `/monitoring` |

Source maps upload when `SENTRY_AUTH_TOKEN` is set, then delete from the deploy unless `SENTRY_KEEP_SOURCEMAPS=1`.

## Alerts

| Channel | What fires it | Who it is for |
| --- | --- | --- |
| Sentry | Any server exception. Money path tagged `area=payments`. | Searchable record. |
| ntfy money | `alertMoneyFailure` on the payment / voucher / checkout path only. | Phone. |
| ntfy health | `buildHealthAlert` when a dependency is `down`. Unconfigured never pages. | Phone. |
| `/api/health` 503 | Database unreachable. | Uptime monitor. |
| `/api/ready` 503 | A mapped dependency is down. | Deploy gate / load balancer. |

Kill switch state is on `/admin/feature-flags` (read-only) and in this file.

## Rollback

A bad deploy on `main` is reverted, not patched forward, unless the revert itself is known broken.

```bash
git revert --no-edit <sha>
git push origin main
```

Vercel ships the revert. Cron and serverless pick it up on the next instance.

If the bad change is a merge with many commits:

```bash
git revert --no-edit -m 1 <merge-sha>
git push origin main
```

Do not `db push`. Do not apply a pending migration from an agent. Schema rollback is a pending SQL file and an owner apply.

## Open

- The kill switches are env-based. A DB-backed override needs a table and a
  migration, and no migration is applied by an agent.
- A Supabase timeout surfaces as `SupabaseTimeoutError`. Callers that want a
  Hebrew message on the page rather than a thrown error have to catch it; that
  is per-page work and is not done everywhere yet.
- `payment_events` is wired into the Cardcom webhook only. The checkout,
  hosted-page, saved-card, voucher, refund, DLQ and reconciliation events have
  no emitter yet.
