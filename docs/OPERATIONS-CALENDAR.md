# Operations Calendar

Every scheduled job: when it should run, what it touches, and what breaks while
it does not.

Verified against this branch and production (`ixvwfbuvfxxsjiywhbbb`) on
**2026-09-01**.

Companion documents: `docs/CRON-EXTERNAL.md` (how to switch a scheduler on),
`docs/RUNBOOK.md` §2, `docs/INCIDENT-PLAYBOOKS.md`.

---

## 0. Nothing is running

**Both scheduling mechanisms are off. Not degraded, not partially configured:
off.**

| Mechanism | State | Evidence |
|---|---|---|
| Vercel cron | **not declared** | `vercel.json` has no `crons` key |
| pg_cron | **not installed** | `select exists(select 1 from pg_extension where extname='pg_cron')` → **false** |
| GitHub Actions | **written, not enabled** | `.github/workflows/cron.yml` exists; `gh secret list` is empty |
| cron-job.org | **not set up** | needs a person in a browser |

So `supabase/schedules/analytics_cron.sql`, which begins
`CREATE EXTENSION IF NOT EXISTS pg_cron`, has **never been run**. The analytics
rollups it schedules have never executed, and two of the functions it references
(`fn_rollup_analytics_daily`, `fn_refresh_analytics_matviews`) do not exist
among the 72 functions in production.

**Everything below is the intended schedule, not an observed one.** The routes
are correct, deployed, guarded and idle.

### Why Vercel cron was removed rather than left declared

Vercel's cron allowance is a **plan feature**. On Hobby it is two jobs at daily
granularity. This project needs ten, four of them at five- or ten-minute
intervals.

`vercel.json` declared all ten anyway. That **does not fail the build and does
not warn**: the platform registers the ones the plan covers and silently ignores
the rest. Four of the ignored ones are on the money path, and one is the only
sender of voucher email. "Silently not scheduled" is not an acceptable state for
any of them, so the schedule was moved somewhere it can be seen.

Removing them was the honest choice, and it is why this document exists.

---

## 1. The ten jobs

All are `GET`, all require `Authorization: Bearer <CRON_SECRET>`, all answer
**401** without it. Times are UTC.

| # | Job | Schedule | Touches | If it does not run |
|---|---|---|---|---|
| 1 | `notifications` | `*/5 * * * *` | `notification_outbox` | **No customer ever receives a voucher email.** The outbox grows without bound. |
| 2 | `health` | `*/5 * * * *` | seven dependency checks | Nothing pages a human. Every other failure here goes unnoticed. |
| 3 | `invoices` | `*/10 * * * *` | `invoices`, `orders` | No invoice is issued. A legal obligation, not a nicety. |
| 4 | `stock` | `*/10 * * * *` | `stock_reservations` | Reservations never expire. Stock stays locked by abandoned checkouts and the catalogue reads as sold out. |
| 5 | `stranded-payments` | `*/10 * * * *` | `payment_webhook_events`, `payments` | **A charged customer with no order is never detected.** The worst state in the system becomes silent. |
| 6 | `abandoned-cart` | `0 * * * *` | `abandoned_cart_nudges`, `carts` | No recovery email. Revenue only. |
| 7 | `subscriptions` | `30 2 * * *` | `subscriptions`, `subscription_charges` | Recurring products are never charged. |
| 8 | `reap-carts` | `40 3 * * *` | `carts` | Expired guest carts accumulate. |
| 9 | `reconcile` | `0 4 * * *` | `payments`, `payment_events` | Ledger and Cardcom drift undetected. Discrepancies are found by a customer complaint instead. |
| 10 | `expire-vouchers` | `15 23 * * *` | `vouchers`, `notification_outbox` | **Vouchers never expire and holders are never warned.** |

The ten expressions are the ones `vercel.json` carried before commit
`21342fc4`, kept byte for byte.

---

## 2. Ranked by what breaks

### Critical: a customer notices

1. **`notifications`** — the only sender of voucher email. A customer pays and
   receives nothing. Everything else in the system can be working perfectly and
   the purchase still fails from the customer's point of view.
2. **`stranded-payments`** — the detector for "charged, no order". Without it
   that state exists and nobody knows. Detection is otherwise a customer
   complaint.
3. **`invoices`** — a legal obligation in Israel, not a convenience.

### Serious: money drifts quietly

4. **`reconcile`** — the ledger and Cardcom diverge with no alarm.
5. **`subscriptions`** — recurring revenue simply does not happen.

### Degrading: the site gets worse slowly

6. **`stock`** — reservations never released, so products read as sold out.
7. **`expire-vouchers`** — see §3, which is subtler than it looks.
8. **`reap-carts`**, **`abandoned-cart`** — accumulation and lost recovery.

### Meta

9. **`health`** — the only thing that pages a human. Its absence is why the
   other nine can fail silently. **Switch this on first**, because it makes
   everything else observable.

---

## 3. Voucher expiry is subtler than "vouchers do not expire"

Worth understanding, because the naive reading is wrong in a useful direction.

`expire_vouchers()` never runs, so a voucher past `expires_at` keeps
`status = 'issued'` in the database indefinitely.

**But it cannot be redeemed.** The atomic guard inside `redeem_voucher` carries
`AND expires_at > now()`, so an overdue voucher returns `expired` at the counter
regardless of its stored status:

```sql
UPDATE vouchers SET status = 'redeemed', ...
WHERE code = ? AND status = 'issued' AND expires_at > now() AND supplier_id IN (...)
```

So: **the row is stale, the answer is correct.** No expired voucher can be
redeemed today.

What is actually lost:

- `enqueue_expiring_voucher_notices()` never warns a holder before expiry.
- `credit_expired_vouchers()` never runs, so the goodwill credit for a voucher
  that expired unredeemed is never issued. **A customer who paid and forgot is
  silently out of pocket**, which is the real consumer harm here.
- Any report counting `status = 'expired'` reads zero forever.

---

## 4. Switching a scheduler on

Two candidates. Neither is enabled.

### GitHub Actions (`.github/workflows/cron.yml`)

Written and committed. Seven `cron:` expressions covering all ten jobs; a run
knows which schedule fired it via `github.event.schedule` and maps to the jobs
due. Needs:

1. `CRON_SECRET` in Actions secrets. `gh secret list` currently returns nothing.
2. The enabling variable the workflow checks. While unset, the schedules cost
   nothing and call nothing.

> **A scheduled workflow only fires from the default branch.** A `cron:`
> workflow committed to a feature branch never runs, and `gh workflow run`
> answers **404** for it. Verify the workflow is on `main`.

> GitHub also **disables scheduled workflows in a repository with no activity**
> for 60 days. This is a scheduler that stops on its own.

### cron-job.org

The better option, and the one `docs/CRON-EXTERNAL.md` treats as intended. Ten
rows, each the same four fields: URL, method (`GET`), cron expression, and an
`Authorization: Bearer <CRON_SECRET>` header. The table in that document is
paste-ready.

> **Do not run both.** Every job would be called twice. The jobs are idempotent,
> so it would not corrupt data, but it doubles load and halves the value of the
> logs.

### Verifying it worked

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://<host>/api/cron/notifications
# 401 without the secret: correct

curl -s -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/health | jq
```

An unset `CRON_SECRET` **closes every job rather than opening it**: the
comparison never matches, so all ten answer 401 forever. That is the safe
direction, and it is also silent, so check for 200s rather than assuming.

---

## 5. Manual operation

Any job can be driven by hand. In priority order if you are catching up after an
outage:

```bash
for job in notifications stranded-payments invoices reconcile \
           expire-vouchers stock subscriptions reap-carts abandoned-cart health; do
  printf '%-20s ' "$job"
  curl -s -H "Authorization: Bearer $CRON_SECRET" \
       "https://<host>/api/cron/$job" | jq -c
done
```

`notifications` first if customers are waiting on vouchers.

All ten are idempotent and safe to run repeatedly. None re-charges anything.

---

## 6. Unscheduled work that also does not happen

| Work | Where it would live | State |
|---|---|---|
| Analytics rollup, matview refresh, partition maintenance | `supabase/schedules/analytics_cron.sql` (pg_cron) | **Never run.** pg_cron not installed, and two referenced functions do not exist. |
| Search index outbox drain | `claim_search_index_jobs()` | No worker calls it. The outbox is empty only because nothing has changed. |
| Backup verification | manual | The desktop `tar` backup is per-session and silently no-ops in some sessions. `ls` for the file; never trust the exit code. |

---

## 7. Verification

```sql
select exists(select 1 from pg_extension where extname = 'pg_cron');  -- false
select count(*) filter (where done_at is null) from search_index_outbox;
select count(*) filter (where status <> 'sent') from notification_outbox;
select count(*) from vouchers where status = 'issued' and expires_at < now();
```

```bash
cat vercel.json | jq '.crons'   # null
gh secret list                  # empty
```

The last SQL query is the direct measure of §3: rows that should have been swept
and were not.
