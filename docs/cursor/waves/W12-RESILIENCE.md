# W12 Resilience

Code-agent spec. Kill switches: `KILL_SWITCH_CACHE`, `_SEARCH`, `_RECS`, `_NOTIFICATIONS`. Read per call, not module load. Vercel still needs a new instance for env. No flags table (agent cannot migrate).

---

## What it builds

1. Documented degraded paths: cache miss-through, search empty list, recs hidden, notifications queued not sent.
2. `/api/health` vs `/api/ready` vs `/api/cron/health` stay distinct.
3. Cardcom timeout 15s, no double-charge retry policy in the client.
4. QStash missing → inline index. Redis missing → Postgres `check_rate_limit` (service_role after 127).

---

## Tables

`notification_outbox` (rows remain when send skipped), `search_index_outbox`.

---

## RLS

Unchanged. Kill switch is env, not a role.

---

## Money invariants

Killing notifications does not un-pay. Killing search does not change prices. Never a kill switch that skips `finalizeOrder` after GetLpResult success.

---

## Tests before close

`kill-switches` / feature-flags tests. Health 200 without cron secret. Cron health 401 without secret. Alert path fires without Sentry DSN (G23).

---

## Feature flag

The four kill switches. `ALERTS_ENABLED`. `CHECKOUT_ENABLED`.

---

## Docs updated

`FEATURE-FLAGS` contract, `ON-CALL-GUIDE.md`, `CACHE-POLICY.md`.

---

## Edge cases

`isOn` only `1/true/on/yes`. Typo leaves the subsystem running (safe direction for a kill switch).

---

## Hebrew UX strings

| Key | Copy |
|---|---|
| Search killed | לא נמצאו תוצאות |
| Recs killed | (strip omitted) |
| Checkout killed | הרכישה סגורה זמנית |

---

## Open questions

| Q | Best answer |
|---|---|
| DB-backed flags? | **Not until a human migration.** Env is the incident switch. |
