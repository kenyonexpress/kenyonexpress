# async-offload Worker

Takes fan-out work off the Vercel functions: a signed `POST /tasks` is queued
onto a Cloudflare Queue and answered with `202` in milliseconds; the queue
consumer does the slow part with the platform's retries and dead-letter queue.

## Tasks

Defined once in `src/lib/workers/task-contracts.ts` and imported by both
sides.

| type | what the consumer does | first producer |
| --- | --- | --- |
| `warm-urls` | one `GET` per URL, so the next visitor finds a warm cache | `/api/cron/daily-deals` after `revalidateTag(CATALOGUE_TAG)` |
| `webhook-fanout` | one `POST` per target; `4xx` is the receiver's answer, `5xx`/transport failure is retried | none yet |

## Signature

`X-KE-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<body>")>`,
five-minute tolerance, constant-time compare. `src/lib/workers/task-signature.ts`
is WebCrypto only and runs unchanged on Node, on the edge runtime and here.

## Deploy

See the header of `wrangler.toml`. Secrets: `TASK_SECRET` here equals
`CF_ASYNC_WORKER_SECRET` on Vercel; `CF_ASYNC_WORKER_URL` is this Worker's
URL. Unset on Vercel, every producer runs its inline fallback and nothing
here is called.

## Failure

A task with any failed part is retried with exponential backoff
(30s, 60s, 120s, 240s, 480s); after `max_retries` the platform parks it in
`ke-async-dlq`. Nothing drains that queue automatically: it is the record for
a person, the way `job_dlq` (migration 242) is on the Supabase side. A task
that does not parse is acknowledged and dropped, not dead-lettered.

## Health

`GET /health` answers `{"ok":true}` with no auth; `src/lib/health/checks.ts`
reports it as `async_offload` (not_configured / ok / down).
