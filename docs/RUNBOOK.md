# Operations Runbook

What to do when something breaks. Written to be read at 3am by someone who did
not build this.

Verified against production (`ixvwfbuvfxxsjiywhbbb`) and the code on this branch
on **2026-09-01**.

Companion documents: `docs/ARCHITECTURE-OVERVIEW.md` (what the system is),
`docs/PAYMENT-FLOW.md` (money states), `docs/CRON-EXTERNAL.md` (scheduler
options), `docs/DISASTER-RECOVERY.md` (data loss).

---

## 0. Read this first

Three facts change how you should interpret every alert below.

1. **No scheduler is running.** Ten cron routes exist, are correct, and are
   never called. See §2. Until this is fixed, anything that depends on a
   scheduled job silently does not happen, and there is no alert for it because
   the thing that would alert is itself a cron job.

2. **The system is pre-launch.** Zero vouchers, zero payment events, four
   orders. Most "nothing is happening" symptoms are correct.

3. **`finalize.ts` has a known column bug on the money path.** It selects
   `orders.cashback_applied_agorot` and `order_items.unit_price_agorot`, neither
   of which exists in production. The first real payment will hit `42703`. See
   §4.1. This is the single most likely launch-day incident.

---

## 1. Alerting: what exists and what it can tell you

| Channel | What it carries | Where |
|---|---|---|
| **Sentry** | Unhandled errors, payment alarms | `@sentry/nextjs`, EU region |
| **ntfy** | Operator pages, health failures | topic `kenyon-ofir-limit`, `NTFY_TOPIC` overrides |
| **`GET /api/health`** | Liveness + database reachability | unauthenticated, coarse on purpose |
| **`GET /api/cron/health`** | Full per-dependency report | requires `Bearer CRON_SECRET` |
| **`payment_events`** | Append-only payment forensics | database table, 38 event types |
| **`payment_webhook_events`** | Cardcom callback log and DLQ | database table, server-only |
| **`notification_outbox`** | Outbound customer messaging | database table |

### Why there are two health endpoints

`/api/health` is unauthenticated by necessity, because an uptime monitor cannot
hold a session. Everything it returns is therefore public, and a detailed health
endpoint is a free inventory for an attacker of what you run and what is
currently broken. So it stays coarse: `ok` plus a reason. Its database probe is
a `HEAD` count against `categories` through the admin client, a table that
always has rows and is not on the money path.

`/api/cron/health` names every dependency and therefore sits behind
`CRON_SECRET`. It checks seven: `database`, `rate_limiter`, `search`,
`cardcom`, `email`, `storage`, `scheduler`.

**Only a dependency that is DOWN pages. A dependency that was never configured
does not.** Several are waiting on keys that only Ofir holds, and a check that
paged every five minutes about them would be an alert nobody reads within a day,
which costs you the alerts that matter.

### Checking health by hand

```bash
curl -s https://<host>/api/health | jq
curl -s -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/health | jq
```

---

## 2. INCIDENT: nothing scheduled is running

**This is the current state, not a hypothetical.**

### Symptoms

Vouchers never expire. Expiry warnings are never sent. **Voucher emails are
never delivered** (`notifications` is the only sender). Invoices are not issued.
Abandoned carts are never reaped. Payment reconciliation never runs. Stranded
payments are never detected.

### Cause

The ten cron routes were **deliberately removed from `vercel.json`**. Vercel's
cron allowance is a plan feature: on Hobby it is two jobs at daily granularity.
This project needs ten, four of them at five- or ten-minute intervals.

Declaring all ten anyway does not fail the build and does not warn. The platform
runs the ones the plan covers and **silently ignores the rest**, which is how a
payment reconciler comes to be believed to be running when it is not. Removing
them was the honest choice.

### The ten routes

```
abandoned-cart   expire-vouchers   health        invoices    notifications
reap-carts       reconcile         stock         stranded-payments
subscriptions
```

All ten are `GET` and all ten require `Authorization: Bearer <CRON_SECRET>`,
with no default and no fallback. A missing secret means every route answers 401.

Three are on the money path: `invoices`, `reconcile`, `stranded-payments`.
`notifications` is the only thing that ever sends a customer their voucher
email.

### Fix

Two candidate schedulers are written down and **neither is switched on**:

- `.github/workflows/cron.yml` needs `CRON_SECRET` in Actions secrets
  (`gh secret list` currently returns nothing) plus an enabling variable.
  **Caveat: a scheduled workflow only fires from the default branch.** A `cron:`
  workflow committed to a feature branch never runs, and `gh workflow run`
  answers 404 for it.
- cron-job.org needs a person in a browser.

Details in `docs/CRON-EXTERNAL.md`.

### Manual stopgap

Any route can be driven by hand:

```bash
for job in notifications expire-vouchers invoices reconcile stranded-payments; do
  echo "== $job"
  curl -s -H "Authorization: Bearer $CRON_SECRET" \
       "https://<host>/api/cron/$job" | jq -c
done
```

`notifications` is the one to run first if customers are waiting on vouchers.

---

## 3. INCIDENT: a customer paid and has no order

**This is the worst state in the system: the money moved and the order did
not.** Treat it as P0.

### Detecting it

A dead letter is a row of `payment_webhook_events` in exactly this state:

```sql
select id, created_at, external_event_id, payload->>'LowProfileId' as lp
from payment_webhook_events
where verified_against_api = true
  and processed_at is null
order by created_at desc;
```

That pair is reachable one way only. The route persists the event, re-checks it
against Cardcom's own API, writes `verified_against_api`, and stamps
`processed_at` **only once `finalizeOrder` has closed the order**. So a row in
this state means precisely: Cardcom charged the customer, we confirmed the
charge with Cardcom directly, and our own finalize did not complete.

> This used to be undetectable. `processed_at` was stamped one statement
> *before* finalize ran, so a finalize failure left a row claiming to be
> handled. Nothing could enumerate the damage afterwards, let alone replay it.
> If you are reading an old document that describes that ordering, it is stale.

### Diagnosing it

`payment_events` is the forensic record. Search these four first, because they
exist purely to record disagreement between sources:

```sql
select occurred_at, event_type, stage, detail
from payment_events
where order_id = '<order-uuid>'
order by occurred_at;
```

| Event type | Meaning |
|---|---|
| `verify_contradicted_callback` | Cardcom's callback and its API disagree. Trust the API. |
| `amount_mismatch` | Verified amount is not the order total. Do not finalize. Escalate. |
| `reconciliation_amount_differs` | Ledger and provider disagree on a settled charge. |
| `reconciliation_missing_remotely` | We think we charged; Cardcom has no record. |
| `finalize_failed` | The replay target. Read `detail` for the reason. |

### Fixing it

**Replay is safe to run repeatedly.** `finalizeOrder` is idempotent on
`orders.status` and `payments.status`; a row that succeeds on retry is stamped
and leaves the queue. Nothing re-charges anything, because the charge already
happened, which is the whole problem being cleaned up.

Drive the replay through the DLQ path in `src/server/payments/webhook-dlq.ts`.
Confirm afterwards:

```sql
select id, status, paid_at from orders where id = '<order-uuid>';
select id, settlement_status, item_status from order_items where order_id = '<order-uuid>';
select id, code, status from vouchers where order_id = '<order-uuid>';
```

Expect `orders.status = 'paid'` with `paid_at` set, lines at `split_executed`,
and one voucher per purchased unit.

### If replay keeps failing

Read the `finalize_failed` detail. If it names a column, you have hit §4.1.

---

## 4. Common failures

### 4.1 `42703 undefined_column` on the money path

**Expect this on the first real payment.**

`src/server/payments/finalize.ts` selects `orders.cashback_applied_agorot` and
`order_items.unit_price_agorot` as literals rather than through the generation
probe in `src/lib/commerce/order-money-columns.ts`. Both were confirmed absent
from production on 2026-09-01. The live names are `orders.cashback_applied_ils`
and `order_items.unit_price_ils_agorot`.

Symptom: `finalize_failed` in `payment_events`, a dead letter in
`payment_webhook_events`, a charged customer with no order.

**There is no operational workaround.** The fix is a code change, out of scope
for this branch. Until then, every payment lands in §3 and must be replayed by
hand after the fix ships.

Verify the column names before believing any document:

```sql
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'orders'
  and column_name like '%cashback%';
```

### 4.2 `22P02 invalid_input_value` on an enum

Something wrote a status the enum does not carry. The live sets are in
`docs/PAYMENT-FLOW.md` §2. The usual cause is code written against a design
document rather than against production, most often omitting `platform_settled`
or assuming `escrow_held` is writable.

### 4.3 `23514 check_violation` on a voucher scan

A conservation CHECK was violated:

```sql
vouchers_conservation  face_value = coupon_price + remaining_amount_due
```

**Migration 137 is applied, so `23514` on a scan now has two possible sources.**
Read the message before assuming which:

| Message | Source | What it means |
|---|---|---|
| names a constraint, e.g. `vouchers_conservation` | a CHECK | the amounts on the row do not add up |
| `illegal order_items.settlement_status transition: X -> Y` | `fn_order_items_settlement_status_guard` | the move itself was refused |

If you see the second form on a scan, note which move it names. The applied
guard permits `paid -> redeemed`, `split_executed -> redeemed` and
`platform_settled -> redeemed`, which is `REDEEMABLE_SETTLEMENT_STATUSES`
exactly, so a scan of a normally-paid line cannot trip it. **A `23514` naming
`paid -> redeemed` means the guard in the database is not the version that
shipped** — that was the defect that blocked 137's first draft, and the failure
mode is a scan failing *after* the customer was charged. Verify the live body
before touching anything:

```sql
select prosrc from pg_proc
where proname = 'fn_order_items_settlement_status_guard';
```

If `('paid','redeemed')` is missing from the permitted list, roll back (§5.3).

### 4.4 Search returns results but no facets and no typo tolerance

Expected. `MEILISEARCH_HOST` and `MEILISEARCH_API_KEY` are **not set in
production**, so search falls back to a Postgres `ILIKE` query. That is a
working search, not a broken one, but it has no typo tolerance, no synonyms and
no facets, and nothing in the UI says so.

Confirm which engine answered: the search outcome carries
`engine: 'meilisearch' | 'database'`.

### 4.5 Rate limiter behaving differently than expected

`UPSTASH_REDIS_REST_URL` unset falls back to the Postgres `check_rate_limit`
path. `check_rate_limit` is `service_role` only since
`127_revoke_check_rate_limit_execute`; before that an anonymous caller chose
both the rate-limit key and the threshold, which meant five calls could lock a
known phone number out of OTP sign-in.

### 4.6 Server actions silently fail in local testing

You browsed `127.0.0.1` against a server started on `localhost`. Next 16 blocks
server actions on the origin mismatch and says nothing useful. **Use
`localhost`.**

### 4.7 A local server serves stale code

A previous `pnpm start` still holds the port and is serving the old build. Kill
it before concluding a fix did not work. Related: `pnpm start` runs with
`NODE_ENV=production` on a laptop, which is how Lighthouse and Playwright are
measured, so production-only boot guards apply. `ALLOW_INCOMPLETE_ENV` is the
escape hatch.

### 4.x A merge you did not start, with conflict markers already staged

**Symptom.** `git status` looks like an ordinary large staged change.
`git diff --diff-filter=U` returns nothing, so git believes every conflict is
resolved. The build, `pnpm start`, `compare.mjs` and the three lint gates are
all down, usually with a JSON parse error naming a byte offset in
`package.json`.

**What has actually happened.** Something ran `git add` across a conflicted
tree, staging the raw `<<<<<<<` / `=======` / `>>>>>>>` lines as if they were
the resolution. Once markers are staged, git no longer counts the path as
unmerged and **neither `git status` nor `--diff-filter=U` will warn you.**
Seen 2026-09-06: a merge of `feat/product-type` with 155 files staged, 41 of
them carrying markers, including `CLAUDE.md`, `.github/workflows/ci.yml`,
`biome.json`, `src/types/database.ts`, `src/server/payments/finalize.ts` and
`scripts/compare.mjs`. The reflog showed `checkout: moving from
closeout/v1-final to main` immediately before it, and
`~/Library/LaunchAgents/com.kenyonexpress.autopilot.plist` is loaded and drives
tmux.

**Detect it. `git status` is not enough:**

```bash
ls .git/MERGE_HEAD 2>/dev/null && echo "a merge is in progress"
git grep -lE '^(<<<<<<< |>>>>>>> |={7}$)' -- '*.ts' '*.tsx' '*.json' '*.mjs' '*.css' '*.yaml' '*.yml' '*.md'
```

Run both before every commit, not only when something looks wrong.

**Decide before you resolve.** Do not hand-resolve a merge nobody reviewed.
Check first that abandoning it is lossless -- the source branch must still
exist at origin:

```bash
git ls-remote --heads origin <branch>
```

If it does, every commit survives and the merge can be redone deliberately
later. A conflicted `finalize.ts` on the money path, or a conflicted
`compare.mjs`, makes every number measured afterwards unattributable, which is
worse than a re-merge.

**Two traps in the abort itself.**

1. `git merge --abort` **refuses** if you have already hand-edited a staged
   file: `error: Entry 'package.json' not uptodate. Cannot merge.` The fix is
   to `git add` the very file you just fixed, so the index and the worktree
   agree, and then abort. This is the moment somebody reaches for
   `git reset --hard`; do not.
2. Abort hard-resets the worktree. Files that were new but got swept into the
   index are reset **out of existence**, not left untracked. If another agent
   or another window has work in progress, back it up first and tell them
   before you run it.

**After the abort**, confirm the tree rather than assuming: no `.git/MERGE_HEAD`,
the marker grep returns nothing, `node -e "require('./package.json')"` parses,
then `pnpm test`, `pnpm type-check` and `pnpm lint`.

---

## 5. Rollback

### 5.1 Application

Vercel keeps every deployment. Promote the previous one from the dashboard.

**The Vercel CLI is reachable locally but there is no project link and no
token**, so `vercel rollback` cannot be run from this checkout. Rollback is a
dashboard action, and a production push is one of the four stop-and-ask
situations regardless.

### 5.2 Database: the general rule

**`db push` is forbidden.** A schema change is a file in `migrations/pending/`
and is applied through MCP `apply_migration` after explicit approval.

Postgres has no undo for DDL. Reversing a migration means writing and applying a
second, forward migration. Before applying anything to production, have that
reverse migration written.

### 5.3 Reversing migration 137

**137 is applied.** It added three transition guards as trigger functions, and
reversal is a forward migration dropping them. The guards are enforcement only:
dropping them restores the previous behaviour exactly and loses nothing but the
enforcement. No data is touched and no state is rewritten.

Confirm what is actually live before acting:

```sql
select tgname, c.relname, pg_get_triggerdef(t.oid)
from pg_trigger t join pg_class c on c.oid = t.tgrelid
where tgname in (
  'tg_orders_status_guard',
  'tg_order_items_settlement_status_guard',
  'tg_payments_status_guard'
);
```

The rollback, written as a forward migration:

```sql
DROP TRIGGER IF EXISTS tg_orders_status_guard ON public.orders;
DROP FUNCTION IF EXISTS public.fn_orders_status_guard();
DROP TRIGGER IF EXISTS tg_order_items_settlement_status_guard ON public.order_items;
DROP FUNCTION IF EXISTS public.fn_order_items_settlement_status_guard();
DROP TRIGGER IF EXISTS tg_payments_status_guard ON public.payments;
DROP FUNCTION IF EXISTS public.fn_payments_status_guard();
```

**Drop the trigger before the function**, or the `DROP FUNCTION` fails on the
dependency. Dropping only one of the three is legitimate: they are independent,
and if only voucher scanning is failing, only the `order_items` guard is
implicated.

**Prefer disabling to dropping while you are still diagnosing.**
`ALTER TABLE public.order_items DISABLE TRIGGER tg_order_items_settlement_status_guard;`
is reversible in one statement and keeps the function body available to read.

### 5.4 What cannot be rolled back

A Cardcom charge. A refund is a **new** payment row with `kind = 'refund'`, not
an edit to the original. A redeemed voucher: `redeemed` is terminal by design
and there is no un-redeem. Restoring value after a terminal state is a wallet
credit, which is a different money movement against a different table.

---

## 6. Search index drift

### Symptom

Products appear in the catalogue but not in search, or deleted products remain
searchable.

### Diagnosis

```sql
-- work waiting in the outbox
select count(*) filter (where done_at is null) as pending,
       count(*) filter (where attempts > 3)    as struggling,
       min(enqueued_at) filter (where done_at is null) as oldest
from search_index_outbox;

-- what failed permanently
select * from search_index_dlq order by id desc limit 20;
```

A non-zero `pending` with an old `oldest` means the drain is not running. Note
that the drain is one of the things a scheduler would call, so §2 is the likely
root cause.

### The two paths

The webhook is the fast path and can be missed. The outbox is the durable floor:
its row is written in the **same transaction** as the product change, by the
`enqueue_search_index()` trigger, so it cannot be lost even if the webhook never
fires.

`search_index_outbox.product_id` is **deliberately not a foreign key**. A DELETE
of the product must leave the "remove this document" instruction behind; `ON
DELETE CASCADE` would delete exactly the row carrying the work.

### Fix

Drain by hand with `claim_search_index_jobs(p_limit)` and re-run the worker.
Claiming is `FOR UPDATE SKIP LOCKED`, so running several workers concurrently
is safe.

If Meilisearch is unconfigured, every job is a **successful no-op** and the
outbox drains without indexing anything. That is by design, not a failure.

---

## 7. Database access and the trust boundary

### The thing to know before you write any SQL

**`authenticated` still holds INSERT, UPDATE and DELETE on 56 tables in
production**, including `orders`, `order_items`, `payments`, `vouchers`,
`refunds` and every wallet table. Migration `126_revoke_authenticated_dml` is in
the applied ledger, but that grant is still there.

```sql
select grantee, privilege_type, count(distinct table_name)
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon','authenticated')
  and privilege_type in ('INSERT','UPDATE','DELETE')
group by grantee, privilege_type;
```

**RLS is therefore the only thing standing between a logged-in user and those
tables, not RLS plus a grant.** Treat a missing or over-broad write policy on
them as a live vulnerability, not a defence-in-depth gap. In practice the
policies do hold the line: writes to `orders`, `order_items` and the wallet
tables are gated on `is_admin()`.

The server-only tables *were* revoked properly and are deny-all:
`payment_webhook_events`, `rate_limits`, `search_index_outbox`,
`user_rate_limits` carry zero policies; `legacy_percent_archive_112`,
`referral_signals`, `search_index_dlq`, `settlement_events` and
`stock_reservations` carry a `RESTRICTIVE` deny-all.

### Proving a write works without leaving rows

To test an INSERT against production through MCP without persisting anything,
wrap it in a `DO` block that raises at the end so the transaction rolls back.
You get the constraint and policy verdict without the row.

---

## 8. Escalation

| Situation | Action |
|---|---|
| Customer charged, no order | §3. Replay. Safe to repeat. |
| Amount mismatch on verify | **Do not finalize.** Escalate to Ofir. |
| `reconciliation_missing_remotely` | We think we charged, Cardcom has no record. Escalate. |
| Suspected RLS hole on a money table | Treat as live. §7. |
| Anything requiring a production migration | Stop and ask. |

**The four stop-and-ask situations**, from `CLAUDE.md`, hold during an incident
as much as outside one:

1. A production push to Vercel.
2. Deleting a database or files.
3. Running a migration against production.
4. A second code agent on the same repository.

---

## 9. Pre-launch checklist

Ordered by what breaks worst if skipped.

1. **Fix `finalize.ts`'s two column names** (§4.1). Without this no payment can
   complete.
2. **Switch on a scheduler** (§2). Without it no customer receives a voucher
   email.
3. Set `CRON_SECRET` wherever the scheduler runs, and confirm the routes answer
   200 rather than 401.
4. Decide on Meilisearch. If it stays unconfigured, that is a choice; make it
   knowingly (§4.4).
5. Run `/api/cron/health` and confirm each of the seven dependencies is either
   `ok` or knowingly unconfigured.
6. ~~Apply migration 137.~~ **Done, 2026-09-01.** The three transition guards
   are live. Nothing to decide.
7. Add the two missing foreign key indexes on the money path
   (`docs/INDEX-USAGE-REPORT.md` §3).
8. Re-run the index usage report one week after real traffic starts. Do not drop
   unused indexes before then.

---

# Resilience appendix (merged 2026-09-02)

The sections below were written on the closeout branch after the runbook above
was frozen on 2026-09-01, and are merged rather than rewritten: the two halves
describe different layers and neither replaces the other.

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

## Rotate `SUPABASE_SECRET_KEY` before production traffic

**Status: REQUIRED, not done.** The secret key currently in `.env.local` was
exposed during setup on 2026-09-04. It works — it authenticates against project
`ixvwfbuvfxxsjiywhbbb` — and that is exactly why it has to be replaced: it is a
working key that bypasses every RLS policy on the database, and it has been
handled outside a secret store.

A secret key is not scoped. It reads and writes every table, every user row,
every order and every voucher, and it can mint tokens for any user. There is no
partial exposure of one.

### Steps

1. **Mint the replacement first.** Supabase Dashboard → project
   `ixvwfbuvfxxsjiywhbbb` → Project Settings → API Keys → *Create new secret
   key*. Name it with the date so the next rotation knows what it is replacing.
   Do not revoke the old one yet: revoking before the new key is in place takes
   the site down.

2. **Put it where the app reads it.**
   - Local: `SUPABASE_SECRET_KEY=` in `.env.local` (gitignored; never commit it).
   - Vercel: `vercel env add SUPABASE_SECRET_KEY production` and again for
     `preview`. **Blocked today** — the Vercel project for this repo does not
     exist; see blocker 0 in `STATE.md`.

3. **Verify before revoking.** Boot the server and read the log:

   ```bash
   PORT=3311 pnpm start
   # then, in the log:  "event":"env.probe_ok"
   ```

   `src/lib/env-probe.ts` asks `/auth/v1/settings` with the key at boot. If it
   reports `env.probe_failed` naming `SUPABASE_SECRET_KEY`, the new key is not
   right and the old one must stay until it is.

4. **Then revoke the old key**, in the same dashboard screen. Not before step 3
   passes.

5. **Confirm the paths that use it actually work**, because they are the ones
   that fail silently rather than loudly: add an item to the cart as a guest,
   reach the checkout address step, and open a wallet balance. A guest
   add-to-cart with a bad key returns HTTP 200, sets a session cookie and writes
   no row — which is how the first bad key survived unnoticed.

6. **Record it** in `STATE.md` with the date, so the next person can tell an
   un-rotated key from a rotated one.

### While it is not done

Treat the current key as compromised: it is fine for local development against
this project, and it must not be the key that serves production traffic.

## Apply the pending migrations (needs Ofir's approval first)

Five are pending. The full review, with what each changes and why, is in
`docs/MIGRATION-REVIEW.md`. **Nothing below has been run.**

None of the five depends on another, so this order is by urgency, not by
dependency. Batch A can be applied today. Batch B cannot be applied at all until
the Vercel project exists.

### Batch A — four migrations, no external preconditions

Apply in this order. Each is independently reversible and each has its rollback
written at the foot of its own file.

| Step | File | Precondition | Verify after |
|---|---|---|---|
| A1 | `172_hide_master_product_test_row.sql` | none | `select stock_quantity from products where id = '9bb347f8-03ec-48ce-8ff2-2503fb74c895';` → `0` |
| A2 | `169_analytics_server_event_names.sql` | none | RPC `fn_ingest_analytics_events` with `{"event_name":"purchase"}` → inserts, does not return `0` |
| A3 | `170_composite_indexes_top_queries.sql` | run `preflight_170.sql` first | `select count(*) from pg_indexes where indexname like 'products_active%';` → `4` |
| A4 | `171_category_name_shekel_order.sql` | none | `select name_he from categories where slug = 'under-99';` → digits before the glyph |

**A1 first, deliberately.** It is the only one with a live money consequence: the
row is purchasable at ₪1 with ten in stock right now, and every hour it stays
that way is an hour somebody can buy it.

**A3 takes a write lock** on each table it indexes — reads are unaffected. On
today's row counts (largest is `carts` at 1813) that is milliseconds. If `orders`
has grown large by the time this runs, switch to
`CREATE INDEX CONCURRENTLY`, which must then be applied one statement at a time
because it cannot run inside a transaction block.

**After the batch:** move each applied file to `migrations/applied/`, add its
sha256 to `migrations/applied/CHECKSUMS.sha256`, add a row to the APPLIED IN
PRODUCTION table in that directory's README, and update
`src/__tests__/pending-migrations-inventory.test.ts` — the inventory test asserts
the exact file list in both directories and will fail until it agrees.

### Batch B — 162, blocked

`162_cron_schedule.sql` schedules twelve pg_cron jobs. Its own first statement
refuses to run unless the vault carries `cron_secret` and `app_url`, and that
guard is correct: without them the jobs would POST into the void every five
minutes.

Neither can be seeded honestly today, because **there is no deployed URL and no
deployment to hold a matching `CRON_SECRET`**. The chain, in order:

1. Create the Vercel project (blocker 0 in `STATE.md`) and deploy.
2. Take the deployment URL and the `CRON_SECRET` from its environment.
3. Seed both into the vault:
   ```sql
   select vault.create_secret('<CRON_SECRET>', 'cron_secret');
   select vault.create_secret('https://<the real host>', 'app_url');
   ```
4. Run `preflight_162.sql` block by block and read each result.
5. Apply `162`, then verify:
   ```sql
   select jobname, schedule, active from cron.job order by jobname;
   ```
   Twelve rows, all `active = true`.

**Rollback:** `cron.unschedule` on the same twelve job names.
