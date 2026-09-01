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

## Open

- The kill switches are env-based. A DB-backed override needs a table and a
  migration, and no migration is applied by an agent.
- `payment_events` is wired into the Cardcom webhook only. The checkout,
  hosted-page, saved-card, voucher, refund, DLQ and reconciliation events have
  no emitter yet.
