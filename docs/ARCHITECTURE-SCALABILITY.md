# ARCHITECTURE-SCALABILITY — four seams, each off by default

Written 2026-09-17 against the tree at that date. Every mechanism here is
inert until its environment variable is set, and every one degrades to what
the app did before it existed. That is deliberate: no environment this repo
can see has a read replica, an Upstash database, QStash credentials or a
Cloudflare Worker, so a mechanism that required any of them would land as an
outage dressed as an upgrade.

## 1. The read replica (`src/lib/supabase/read-replica.ts`)

| | |
| --- | --- |
| Switch | `SUPABASE_READ_REPLICA_URL` (Supabase's load-balanced `https://<ref>-all.supabase.co`) |
| Client | `createCatalogueReadClient()`: anon key, cookie-free, replica URL when set, primary otherwise |
| Who reads through it | `category-page`, `product-detail`, `product-seo`, `related-products`, `coupon-deals`, `supplier-storefront`, `feeds/catalogue`, `app/sitemap` |
| Who must not | cart, checkout, auth: they read rows they just wrote, and a replica lags by seconds |
| Guard | `read-replica-callers.test.ts` refuses a file that imports the replica client and also writes, and pins the three write-adjacent paths to the primary |
| Health | `read_replica` in `lib/health/checks.ts`: `not_configured` / `ok` / `down`, probed through an ANON client because that is the client the catalogue reads with |

Why only the catalogue: every one of those readers sits behind `use cache`
or ISR and is already minutes stale by design, so replication lag is
invisible underneath it. A value equal to the primary URL is treated as
unset rather than reported as a replica.

## 2. Graduated rate limiting (`src/lib/rate-limit/graduated.ts`)

The flat table in `policies.ts` gives each route one number over one window.
The graduated layer sits IN FRONT of it, in `proxy.ts`, keyed on the client
address, and runs before the session refresh so a refused request costs no
Supabase round trip.

| policy | burst | sustained | daily | cooldown |
| --- | --- | --- | --- | --- |
| api-anon | 30 / 10 s | 300 / 5 min | 5000 / day | 10 s, doubling per strike, cap 15 min, strikes forgotten after 1 h |
| api-device | 60 / 10 s | 900 / 5 min | 20000 / day | 5 s, doubling, cap 5 min, strikes forgotten after 15 min |

- **Three windows, walked narrowest first.** A scraper trips `burst` in its
  first second; a person clicking for five minutes never does.
- **Refusals escalate.** A refusal writes a strike and a cooldown sized to
  the strike count; while the cooldown runs every request is answered from
  one `PTTL` without touching the windows. A loop that keeps retrying gets
  cheaper for us, not for it.
- **Upstash only, no Postgres fallback.** This runs on every `/api` request;
  a Postgres round trip on each of them during a Redis outage is a second
  outage. Unconfigured or down, the decision is `open` and logged at error
  level, and the per-route floor keeps holding.
- **Machine callers are routed around it** (`edge-shield.ts`): cron, jobs,
  webhooks, the Cardcom callback, the QStash workers, the uptime relay. Each
  proves itself with a secret, and all of them arrive from a few shared
  addresses.
- Keys are `rl:v1:g:<policy>:<tier|penalty|strikes>:<address>`, a namespace
  no flat policy can collide with.

The 429 body names `refused_by` (`burst`, `sustained`, `daily` or `penalty`)
and `retry_after_seconds`; the headers are the same `RateLimit-*` trio and
`Retry-After` the flat limiter sends.

## 3. The job queue and its dead letters (`src/lib/jobs/`)

One envelope, one worker, one failure callback, one replay cron.

```
enqueueJob(type, payload)
   -> QStash (QSTASH_TOKEN set)      -> POST /api/jobs/run   (signed)
   -> inline (QSTASH_TOKEN unset)    -> runJob() in-process
/api/jobs/run: 2xx acks; dropped (unparseable) also acks; failed -> 500 -> QStash retries x5
   -> still failing -> POST /api/jobs/dlq (signed) -> job_dlq row (migration 242)
/api/cron/job-dlq, every 10 min: dead rows oldest first -> re-published, stamped replayed
   -> a job already replayed 3 times -> exhausted, logged at error level, left visible
```

| | |
| --- | --- |
| Envelope | `{ v: 1, id, type, payload, enqueuedAt, replayCount, replayOf? }`; `id` is the QStash dedup key |
| Types | `search-index` (the existing indexer), `search-outbox-drain`, `cache-warm` (bounded list of same-site paths) |
| Payloads | validated per type at the worker; a job that fails its schema is acknowledged and dropped, never retried into the DLQ |
| Table | `job_dlq`: server-only, RLS on, no policy, service_role the only writer; `src/lib/supabase/pending-jobs.ts` is the one cast until `database.ts` is regenerated |
| Gates | `route-coverage.test.ts`, `cron-auth.test.ts`, `mutating-route-guards.test.ts`, `cron-schedule-inventory.test.ts` all name the three routes |

What this closes: `search_index_dlq` (069) has parked dead search jobs since
the pipeline shipped and nothing has ever replayed one. The general queue
replays its own dead letters on a schedule and bounds the replays.

## 4. Async offload to a Cloudflare Worker (`src/lib/workers/`, `infra/cloudflare/workers/async-offload/`)

Wide, slow fan-out with no result the request needs: warming a hundred pages
after the nightly catalogue invalidation, posting one event to every
subscribed receiver. On a serverless function each of those holds the
invocation open and bills for it; in the Worker the request is one signed
POST answered with `202` in milliseconds, and a Cloudflare Queue does the
fan-out with the platform's retries and dead-letter queue.

| | |
| --- | --- |
| Switch | `CF_ASYNC_WORKER_URL` + `CF_ASYNC_WORKER_SECRET` (both, or inline) |
| Signature | `X-KE-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "t.body")>`, five-minute tolerance, constant-time compare, WebCrypto only so the same file runs on Node, edge and the Worker |
| Contracts | `task-contracts.ts`, imported by the Worker by relative path; the two sides cannot drift |
| Tasks | `warm-urls`, `webhook-fanout` |
| Failure | a task with any failed part is retried with backoff (30 s doubling to 10 min); after five attempts the platform parks it in `ke-async-dlq` for a person |
| First producer | `/api/cron/daily-deals`: after `revalidateTag(CATALOGUE_TAG)` it offloads a warm of `/`, `/products`, `/category/hot-deals`, `/search`; inline fallback is a `cache-warm` job, which itself runs inline without QStash |
| Health | `async_offload` in `lib/health/checks.ts`, via the Worker's unauthenticated `/health` |

`offloadTask` never throws: a Worker that refuses or is unreachable falls
back to inline and warns; a failed inline is reported in the outcome and
logged at error level. A cold cache is a slow page, not a wrong deal.

## What is measured, and what is not

- Every decision above has a unit test that exercises it without the
  service: an in-memory Upstash for the graduated limiter, a fake `job_dlq`
  for the replay, the Worker's handlers called directly.
- Nothing here has been measured against a real replica, a real QStash
  queue or a deployed Worker, because none exists for this project yet.
  The health report is where that shows up first; the three `not_configured`
  rows are the honest state today.
