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

If migration 137 has been applied by the time you read this, `23514` on a scan
may instead be its transition guard. **The guard forbidding `paid -> redeemed`
was the defect that blocked 137's first version**, and the failure mode is a
scan that fails *after* the customer was charged. If that is what you are
seeing, the guard was applied in its unfixed form. Roll it back (§5.3).

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

### 5.3 Reversing migration 137, if it has been applied

137 adds transition guards as trigger functions. It is **not applied today**, so
this is contingency. Reversal is a forward migration dropping the triggers it
created. The guard is enforcement only, so dropping it restores the previous
behaviour exactly and loses nothing but the enforcement.

Confirm the current state before acting:

```sql
select version, name from supabase_migrations.schema_migrations
order by version desc limit 20;
```

If `137` does not appear, it is not applied.

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
6. Apply migration 137, or decide not to. It is pending, and nothing in the live
   database enforces transition rules today.
7. Add the two missing foreign key indexes on the money path
   (`docs/INDEX-USAGE-REPORT.md` §3).
8. Re-run the index usage report one week after real traffic starts. Do not drop
   unused indexes before then.
