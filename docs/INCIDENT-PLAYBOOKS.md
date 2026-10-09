# Incident Playbooks

Five named incidents, with steps. Written to be followed by someone who did not
build this, at an hour when they are not at their best.

Verified against this branch and production (`ixvwfbuvfxxsjiywhbbb`) on
**2026-09-01**.

Companion documents: `docs/RUNBOOK.md` (general on-call),
`docs/OPERATIONS-CALENDAR.md`, `docs/SECURITY-POSTURE.md`,
`docs/DEPLOYMENT.md` §5 (rollback).

---

## 0. Before any of them

**Three facts change how you should read every alert.**

1. **No scheduler is running.** Nothing expires, reconciles, invoices or emails.
   If your symptom is "X never happened", check `docs/OPERATIONS-CALENDAR.md`
   before investigating anything else.
2. **The system is pre-launch.** Zero vouchers, zero payment events, four
   orders. "Nothing is happening" is usually correct.
3. **`finalize.ts` has a known column bug**, so the first real payment raises
   `42703`. See playbook 1.

**The four stop-and-ask actions hold during an incident too:** a production push
to Vercel, deleting a database or files, running a migration against production,
and a second code agent on the same repository.

**First move in almost any bad-deploy incident: promote the previous Vercel
deployment.** Diagnose afterwards. It is the fastest and safest lever available.

---

## Playbook 1: Payment provider down, or payments failing

### Symptoms

Checkout hangs at the iframe. `payment_events` fills with
`low_profile_failed` or `verify_failed`. Customers report being charged with no
confirmation.

### Triage: which of three is it?

```sql
select event_type, count(*), max(occurred_at)
from payment_events
where occurred_at > now() - interval '1 hour'
group by event_type order by 2 desc;
```

| Dominant event | Meaning | Go to |
|---|---|---|
| `low_profile_failed`, `low_profile_requested` with no pair | Cardcom unreachable | §1a |
| `verify_failed`, `callback_provider_failure` | Cardcom partially up | §1b |
| `finalize_failed` | **Our bug, not theirs** | §1c |

### 1a. Cardcom is down

No charge is being taken, so **no customer is out of pocket**. This is the
benign version.

1. Confirm externally (Cardcom status, a manual `GetLpResult` on a known id).
2. Set `CHECKOUT_ENABLED=false` to stop new attempts and show a maintenance
   state, rather than letting customers hit a broken iframe repeatedly.
3. When it recovers, unset it and drain any dead letters (§2).

### 1b. Cardcom is partially up: charges succeed, callbacks fail

**The dangerous version.** Money moves; our record may not.

1. Do **not** disable checkout blindly. Determine first whether charges are
   completing.
2. Enumerate the damage:

```sql
select id, created_at, external_event_id
from payment_webhook_events
where verified_against_api = true and processed_at is null
order by created_at desc;
```

3. Every row is a charged customer with no order. Replay each (§2).
4. If the count is growing, then disable checkout.

### 1c. `finalize_failed` with a column error

**This is the expected first-payment failure.** `src/server/payments/finalize.ts`
selects `orders.cashback_applied_agorot` and `order_items.unit_price_agorot`.
Neither exists in production; the live names are `orders.cashback_applied_ils`
and `order_items.unit_price_ils_agorot`.

```sql
select detail from payment_events
where event_type = 'finalize_failed' order by occurred_at desc limit 5;
-- look for 42703 / "column ... does not exist"
```

**There is no operational workaround.** It is a code fix, out of scope for the
documentation branch.

Immediate action: **set `CHECKOUT_ENABLED=false`.** Every further purchase
charges a customer and produces no order. Then replay the accumulated dead
letters once the fix ships.

### Never do

- Never re-charge to "fix" a failed finalize. The charge already happened; that
  is the whole problem being cleaned up.
- Never trust the callback body for the amount. Re-fetch `GetLpResult`.

---

## Playbook 2: A customer paid and has no order

**P0. The worst state in the system: the money moved and the order did not.**

### Detect

```sql
select id, created_at, external_event_id, payment_id
from payment_webhook_events
where verified_against_api = true and processed_at is null
order by created_at desc;
```

That pair is reachable exactly one way. The route persists the event, re-checks
it against Cardcom's own API, writes `verified_against_api`, and stamps
`processed_at` **only after `finalizeOrder` closes the order**. So a row in this
state means: Cardcom charged the customer, we confirmed the charge with Cardcom
directly, and our finalize did not complete.

### Diagnose

```sql
select occurred_at, event_type, stage, detail
from payment_events where order_id = '<uuid>' order by occurred_at;
```

Four event types exist purely to record disagreement between sources. Search
them first:

| Event | Meaning |
|---|---|
| `verify_contradicted_callback` | callback and API disagree. **Trust the API.** |
| `amount_mismatch` | verified amount ≠ order total. **Do not finalize. Escalate.** |
| `reconciliation_amount_differs` | ledger and provider disagree on a settled charge |
| `reconciliation_missing_remotely` | we think we charged; Cardcom has no record. **Escalate.** |

### Fix

**Replay is safe to run repeatedly.** `finalizeOrder` is idempotent on
`orders.status` and `payments.status`; a row that succeeds is stamped and leaves
the queue. Nothing re-charges.

Drive it through the admin action `retryDeadLetter`, or `retryFinalizePayment`
for a specific payment.

### Verify

```sql
select id, status, paid_at from orders where id = '<uuid>';
select id, settlement_status, item_status from order_items where order_id = '<uuid>';
select id, code, status from vouchers where order_id = '<uuid>';
```

Expect `paid` with `paid_at` set, lines at `split_executed`, and **one voucher
per purchased unit**. Then run `notifications` by hand so the customer actually
receives it, since no scheduler will:

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/notifications
```

---

## Playbook 3: Database at capacity or unresponsive

### Symptoms

`/api/health` returns `{"ok":false,"database":"down"}`. Timeouts across the
site. Supabase dashboard shows connection or storage pressure.

### Triage

```sql
select count(*) as conns, state from pg_stat_activity group by state;

select query, state, now() - query_start as age
from pg_stat_activity
where state <> 'idle' and now() - query_start > interval '30 seconds'
order by age desc;

select relname, pg_size_pretty(pg_total_relation_size(relid)) as size
from pg_stat_user_tables where schemaname = 'public'
order by pg_total_relation_size(relid) desc limit 10;
```

### Likely causes here specifically

1. **Connection exhaustion from serverless.** Each Vercel function can open its
   own connection. This is the most likely cause at this scale, since the data
   is tiny (2.4 MB of tables).
2. **`profiles` sequential scans.** 212,800 seq scans against 10 index scans on
   the table that `is_admin()`, `has_role()`, `current_user_role()` and
   `is_support()` all read, from **RLS policies**, once per query. At 10 rows the
   planner is right to choose a seq scan. At 10,000 it is not, and the cost lands
   on **every RLS-protected query simultaneously**. It presents as general
   slowness, not one slow query, which makes it hard to diagnose from the
   symptom. See `docs/INDEX-USAGE-REPORT.md` §4.
3. **An outbox growing without bound**, because nothing drains it.

```sql
select count(*) from notification_outbox where status <> 'sent';
select count(*) from search_index_outbox where done_at is null;
```

### Act

1. Kill runaway queries (`pg_terminate_backend`) only if you can name them.
2. If it is connection count, reduce concurrency at the app layer before
   touching the database.
3. If an outbox is the bulk, drain it manually (`docs/OPERATIONS-CALENDAR.md`
   §5); do not delete rows.
4. Storage: `payment_events` and `voucher_redemptions` are append-only and grow
   forever by design. They have retention policies **nowhere**. If one is the
   largest table, that is a capacity conversation, not an incident fix.

### Never do

- Never `TRUNCATE` an append-only table. `payment_events` is the forensic record
  and `voucher_redemptions` is the audit trail for disputed redemptions.
- Never disable RLS to "test" whether it is the cause. It is the only
  database-level defence on the money tables.

---

## Playbook 4: Search index corrupt, stale, or empty

### Symptoms

Products missing from search but present in the catalogue; deleted products
still searchable; search returning nothing.

### First: which engine is answering?

The search outcome carries `engine: 'meilisearch' | 'database'`.

**If `MEILISEARCH_HOST` / `_API_KEY` are unset, production runs the Postgres
`ILIKE` path and there is no index to corrupt.** Search still works, without
typo tolerance, synonyms or facets. This is the current state and is not an
incident.

### If Meilisearch is configured

```sql
select count(*) filter (where done_at is null) as pending,
       count(*) filter (where attempts > 3)    as struggling,
       min(enqueued_at) filter (where done_at is null) as oldest
from search_index_outbox;

select * from search_index_dlq order by id desc limit 20;
```

| Reading | Meaning |
|---|---|
| `pending` high, `oldest` old | the drain is not running (expected: no scheduler) |
| `struggling` high | Meilisearch is rejecting writes |
| both zero, index still wrong | the webhook path missed events and the outbox never captured them |

### Fix

1. **Drain**: call `claim_search_index_jobs(p_limit)` and run the worker.
   `FOR UPDATE SKIP LOCKED` makes concurrent workers safe.
2. **Rebuild**: reindex every active product. The catalogue is 80 products, so a
   full rebuild is cheap and is usually the right move rather than reconciling.
   The index predicate must match the RLS one exactly:
   ```sql
   status = 'active' AND deleted_at IS NULL
   ```
   Using a different predicate is how a soft-deleted product becomes publicly
   searchable.
3. **Deletes are idempotent**: a 404 on DELETE is success.

### Why the outbox exists

The webhook is the fast path and can be missed. The outbox row is written **in
the same transaction** as the product change by the `enqueue_search_index()`
trigger, so it cannot be lost even if the webhook never fires. If the outbox is
empty and the index is wrong, the trigger is the thing to check.

---

## Playbook 5: A bad deploy

### Symptoms

Errors spike in Sentry immediately after a deploy. `/api/health` fails. Pages
500.

### Act, in this order

1. **Promote the previous deployment in the Vercel dashboard.** Do this first.
   Diagnose after the site is up.

   > The Vercel CLI is reachable locally but **there is no project link and no
   > token in this checkout**, so `vercel rollback` cannot be run from here.
   > It is a dashboard action.

2. Confirm recovery:
   ```bash
   curl -s https://<host>/api/health | jq
   ```
3. Then diagnose from Sentry and the build logs.

### If rolling back is not enough

A deploy that ran a migration cannot be undone by promoting the old build. The
old code now faces a new schema.

- **Postgres has no undo for DDL.** Reversing means writing and applying a
  second, forward migration, which is a stop-and-ask action.
- Check what actually applied:
  ```sql
  select version, name from supabase_migrations.schema_migrations
  order by version desc limit 20;
  ```
- Additive migrations (new nullable columns, new tables) are usually
  backward-compatible with the previous build. Renames and drops are not.

### The build gate that catches this class

`pnpm build` is a **separate gate**: `cacheComponents` rejects uncached page
reads that `pnpm test`, `pnpm type-check` and `pnpm lint` all pass. A change can
be green on all three and still break the build. If a bad deploy got through, ask
whether the build was actually run.

---

## Playbook 6: A leaked key

### Triage by blast radius

| Leaked | Radius | Urgency |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | **total. Bypasses RLS on every table.** | immediate |
| `CARDCOM_API_PASSWORD` | can charge and refund | immediate |
| `VOUCHER_QR_SECRET` | can mint valid QR payloads | high |
| `CARDCOM_WEBHOOK_SECRET` | can forge callbacks (still cannot finalize an unconfirmed payment) | high |
| `CRON_SECRET` | can trigger jobs; all are idempotent | medium |
| `NEXT_PUBLIC_*` | none; public by design | none |

### Service role key

**Total compromise.** It bypasses RLS on all 61 tables.

1. Rotate in the Supabase dashboard immediately.
2. Update Vercel environment variables and redeploy.
3. **Assume data exfiltration.** Israeli privacy law obligations may apply for
   `profiles` and `user_addresses`.
4. Audit for writes during the exposure window:
   ```sql
   select * from audit_log where created_at > '<leak time>' order by created_at;
   select * from payment_events where occurred_at > '<leak time>'
     and actor_role is null;
   select id, role from profiles where role in ('admin','super_admin');
   ```
   The last one matters because the service role **bypasses
   `enforce_profile_privilege_columns`**: `auth.uid()` is NULL for it, so the
   trigger returns early and a role change goes unchecked.

### Voucher QR secret

Rotate using the two-key path so live passes keep working:

1. Set `VOUCHER_QR_SECRET_PREVIOUS` to the **current** value.
2. Set `VOUCHER_QR_SECRET` to the new one.
3. Redeploy.

The `k` (key id) field inside each payload selects the key, so an already-issued
pass verifies against the old key until it expires.

**Order matters.** The other order rejects every outstanding voucher.

Forged QR payloads are limited by design: the QR **proves minting, not
authorization**, so a forged one still cannot redeem a voucher that is not
`issued`, not the caller's supplier, or expired. The database decides.

### Cardcom webhook secret

Same two-key pattern with `CARDCOM_WEBHOOK_SECRET_PREVIOUS`, same order. Both
are always compared with **no short circuit**, so response time does not reveal
which was presented.

An attacker with this secret still **cannot cause a finalize for a payment
Cardcom does not confirm**, because `GetLpResult` is re-fetched server to server
and is the only trusted source.

### After any rotation

- Confirm the old value appears nowhere in the repository history.
- Check `.claude/settings.json` has not acquired `bypassPermissions`; night
  branches have repeatedly smuggled it in. Revert on sight.
- `.env.example` must carry names and shapes only, never values.

---

## 7. Escalate to Ofir immediately for

- `amount_mismatch` or `reconciliation_missing_remotely` on any payment.
- A suspected RLS hole on a money table. RLS is the only layer there.
- Any leaked service role key.
- Anything requiring a production migration.
- Anything requiring a production push to Vercel.
