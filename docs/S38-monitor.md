# S38: site monitor in the database (06.11.2026)

Queue item S38: pg_cron every 5 minutes, a pg_net GET of `APP_BASE_URL/api/ready`, a table `site_health`, on 3 consecutive failures an ntfy message "hey SITE down" to `kenyon-ofir-limit`, nothing on recovery.

**RESULT: DONE.** Migration `263_site_health_monitor.sql` is written and **applied on production**. The monitor is running: the first two live probes answered 200.

## What it does

| piece | what |
|---|---|
| `public.site_health` | One row per probe: `checked_at`, `url`, `request_id`, `ok` (NULL while pending, true only for a 200), `status_code`, `error`, `resolved_at`, `alerted_at`, `alert_request_id`. RLS on, no policy, nothing for anon or authenticated. |
| `ke-site-health-probe`, `*/5 * * * *` | `select public.site_health_probe()`: judges what is pending, queues `net.http_get(APP_BASE_URL || '/api/ready', timeout 20 s)`, inserts the pending row, deletes rows older than 30 days. |
| `ke-site-health-resolve`, `1-59/5 * * * *` | `select public.site_health_resolve()`: one minute later, reads the answer from `net._http_response`, marks the row, and alerts if the streak reached three. |
| the alert | `net.http_post('https://ntfy.sh/', {"topic":"kenyon-ofir-limit","message":"hey SITE down"})`, once per outage. |

Why two jobs: pg_net is asynchronous. `net.http_get` only queues the request, and the answer lands after the transaction commits, so the call that sends a probe cannot judge it. `cron.job_run_details` says "succeeded" either way (migration 258 measured the same thing on the twelve `ke-*` jobs).

Rules, as written in the function:

- **Failure** is anything but a 200: a 503 from `/api/ready`, any other status, a timeout, a DNS or TLS error, or a probe pg_net did not answer within 120 seconds.
- **The streak** is every failure since the last 200. The alert fires when it is 3 or more and no row in it has `alerted_at`. So one message per outage, however long it lasts.
- **Recovery** sends nothing. A 200 ends the streak; the next outage alerts again.
- **Timing.** First bad probe at T, then T+5 and T+10, alert at T+11 minutes.

The base URL is read from the vault at run time (`APP_BASE_URL` = `https://www.kenyonexpress.co.il`). No secret is in the file; `/api/ready` needs no bearer.

## What changed

| file | change |
|---|---|
| `migrations/pending/263_site_health_monitor.sql` | New. Table, two functions, two cron jobs. Idempotent, one transaction. |
| `migrations/pending/README.md` | The 263 entry. |
| `src/__tests__/pending-migrations-inventory.test.ts` | 263 named in the inventory. |
| `src/__tests__/site-health-monitor-migration.test.ts` | New, 7 tests on the file as text: schedules, URL, 200-only, threshold, the exact message and topic, one `http_post` only, access, no secret. |
| `docs/S38-monitor.md`, `docs/INDEX.md`, `README.md`, `STATE.md` | This file, its index row, the document count, state. |

No application code, no page, no frozen path.

## Measured before writing

```
pg_cron 1.6.4, pg_net 0.20.0, supabase_vault 0.3.1
vault APP_BASE_URL = https://www.kenyonexpress.co.il
public.site_health: does not exist
net.http_get(text,jsonb,jsonb,integer), net.http_post(text,jsonb,jsonb,jsonb,integer)
pg_net.ttl = 6 hours

$ curl -s -o /dev/null -w '%{http_code} %{time_total}' https://www.kenyonexpress.co.il/api/ready
200 3.210882
{"ok":true,"search":"degraded","checks":{"database":"ok","redis":"ok","meilisearch":"down","r2":"ok","cardcom":"ok"}}
```

`net.http_post` takes a jsonb body, so the alert uses ntfy's JSON publish (POST to the root with `topic` and `message`), not a plain-text POST to `/<topic>`.

## Rehearsal: every alert scenario, in a transaction that was rolled back

The migration body plus a test block ran on production in one transaction that ended in `RAISE EXCEPTION`, so nothing persisted and pg_net never saw the queued requests (it reads the queue after commit). Probe answers were simulated by inserting rows into `net._http_response` with negative ids. The numbers below are the function's return value (the streak) and the count of POST rows in `net.http_request_queue`.

| step | probes so far | streak | ntfy posts queued |
|---|---|---|---|
| A | real `site_health_probe()` | pending row, `ok` NULL | queue: `GET https://www.kenyonexpress.co.il/api/ready`, timeout 20000 |
| B | 200, 503, 503 | 2 | 0 |
| C | + timeout (no status) | 3 | **1** |
| D | + 500, + "Could not resolve host", resolve called twice | 5 | 1 |
| E | + 200 (recovery) | 0 | 1 (nothing sent) |
| F | + 502, 503 | 2 | 1 |
| F | + a probe 130 s old with no answer | 3 | **2** (second outage alerts) |
| G | the fresh pending row from A | left pending | |
| H | a row 31 days old, then a probe | deleted | |

The queued alert, read back from `net.http_request_queue`:

```
url:     https://ntfy.sh/
headers: {"Content-Type": "application/json"}
body:    {"topic": "kenyon-ofir-limit", "message": "hey SITE down"}
```

The row that carried the alert in C: `ok=false, status=null, error="Timeout of 20000 ms reached", alert_request_id set`. The unanswered probe in F: `ok=false, error="pg_net returned no response within 120 s", alerted`.

After the rollback: `to_regclass('public.site_health')` NULL, 0 `ke-site-health-*` jobs, 0 fake response rows.

## The ntfy transport, without touching the real topic

One message with the same shape was sent from the production database to a throwaway topic, so no phone rang:

```
select net.http_post(url := 'https://ntfy.sh/',
  body := jsonb_build_object('topic', 'ke-s38-selftest-827dfcd15847', 'message', 's38 transport selftest'),
  headers := jsonb_build_object('Content-Type', 'application/json'), timeout_milliseconds := 10000);
-- request_id 13906

net._http_response id 13906: status_code 200, timed_out false, error_msg null
  content: {"event":"message","topic":"ke-s38-selftest-827dfcd15847","message":"s38 transport selftest"}

$ curl -s 'https://ntfy.sh/ke-s38-selftest-827dfcd15847/json?poll=1&since=10m'
{"id":"N1ORMif00CmW",...,"event":"message","topic":"ke-s38-selftest-827dfcd15847","message":"s38 transport selftest"}
```

## Applied, and running

Applied 2026-11-05 23:58 UTC (06.11, 01:58 Israel time) with `supabase db query --linked -f migrations/pending/263_site_health_monitor.sql`.

```
jobid 148  ke-site-health-probe    */5 * * * *     active  select public.site_health_probe();
jobid 149  ke-site-health-resolve  1-59/5 * * * *  active  select public.site_health_resolve();
```

Live rows (UTC):

```
id 1  checked 00:00:00  request 13913  ok true  status 200  error None  resolved 00:01:00  alerted_at None  alert_request_id None
id 2  checked 00:05:00  request 13916  ok true  status 200  error None  resolved 00:06:00  alerted_at None  alert_request_id None
```

`cron.job_run_details`:

```
00:00:00  ke-site-health-probe     succeeded  1 row
00:01:00  ke-site-health-resolve   succeeded  1 row
00:05:00  ke-site-health-probe     succeeded  1 row
00:06:00  ke-site-health-resolve   succeeded  1 row
```

Access, on the live objects:

```
anon select: false   authenticated select: false   service_role select: true
anon execute site_health_probe(): false   authenticated execute site_health_resolve(): false
RLS: true   policies: 0
```

No message has gone to `kenyon-ofir-limit`: `alerted_at` and `alert_request_id` are NULL on every row.

## Gates

```
vitest      8303 passed, 13 skipped (704 files)
tsc         0 errors
lint        exit 0 (biome 2271 files, all gates clean, docs-index-gate 358 documents)
freeze      git diff design-locked-2026-10-19 -- <frozen paths>: empty
```

`compare.mjs` was not run: no page changed.

## Decisions taken alone

- **Rule 8 and this item disagree, and the item won.** The queue rules list four messages the ntfy topic may carry, and "hey SITE down" is not one of them. The item names the topic and the string, so the monitor sends exactly that. The loop itself sent nothing to the topic for this item.
- **Two cron jobs, not one.** One job that probes and judges in the same call can only judge the previous probe, which puts the alert at T+15 minutes. A second job a minute later puts it at T+11.
- **A probe pg_net never answered counts as a failure** (after 120 seconds), with its own error text.
- **`263_`, not a timestamp**, per the folder convention (same call as S35).
- **30-day retention**, inside the probe. Not asked for.
- **`site_health` is not in `src/types/database.ts`.** No application code reads it.
- **The existing `ke-health` job was not touched.** It still POSTs to a GET-only route and collects a 405 every five minutes (found by 258).

## Not measured

- **A real alert on the real topic.** Deliberately: it would have rung the phone with a false outage. The function's alert was read from the queue in the rolled-back rehearsal, and the same request shape was delivered to a throwaway topic.
- **A real outage.** Every failure in the rehearsal was a simulated response row. A live 503, timeout or DNS failure of production has not been observed by the monitor.
- **pg_net itself down.** Then the probe is recorded as a failure after 120 seconds, but the alert uses the same transport and cannot leave. The monitor does not watch its own transport, and nothing outside the database watches the monitor.
- **ntfy rate limits or an ntfy outage.** The alert is sent once and not retried; `alert_request_id` points at the response for six hours.

## Found, not fixed

- `/api/ready` answers 200 with `"ok":true` while production is under `MAINTENANCE_MODE`, so the monitor reports the site as up while customers see the maintenance page. It watches the dependencies, not the storefront.
- `/api/ready` took 3.2 seconds from this machine. The probe allows 20.

## Turning it off

```sql
select cron.unschedule(jobname) from cron.job
 where jobname in ('ke-site-health-probe', 'ke-site-health-resolve');
```

Full reversal (functions and table) is in the header of the migration.
