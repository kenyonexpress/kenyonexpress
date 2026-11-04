# G1: Cardcom webhook endpoint (05.11.2026)

Queue item G1 asked for a Cardcom webhook at `src/app/api/webhooks/cardcom/route.ts`
with HMAC verification, Redis dedup, event mapping, a fast 200 with background
processing, a four-payload test suite and `CARDCOM_WEBHOOK_SECRET` in Vercel.
Most of it already existed under another path, and one part of the ask
contradicts how Cardcom works. This records what is live, what was added, and
what was deliberately not done.

## What already existed (measured, not assumed)

`src/app/api/payments/cardcom/webhook/route.ts` (426 lines, 20 unit tests in
`route.test.ts`, 10 in `resilience.test.ts`) is the terminal's IndicatorUrl:

| G1 ask | What the handler does |
|---|---|
| Signature verification | Cardcom does not sign callbacks. Authenticity is the `?s=` secret in the callback URL (`CARDCOM_WEBHOOK_SECRET`, `_PREVIOUS` accepted during rotation, constant-time compare) plus a mandatory `GetLpResult` re-verification, the only trusted source of amount, status and token. An amount mismatch is an `audit_log` alarm and the order does not close. |
| Idempotency by (transaction, event) | `payment_webhook_events` UNIQUE on `(provider, external_event_id)` where the id is `<lowprofilecode>:<InternalDealNumber>`, written BEFORE anything else. A replay is a 200 no-op; any other insert failure is a 503 so Cardcom retries. |
| ChargeSuccess | verify, then `finalizeOrder`: `order_items` split snapshot, voucher issue per coupon line (`server/domain/vouchers/issue`), `fn_enqueue_notification` (email + push through the outbox), gift sends, `payment_webhook_events.processed_at` stamped last. |
| ChargeFailed | `payments.status = 'failed'` with the response code, `payment_events` row `callback_provider_failure`. |
| Refund | Refunds are initiated by this platform, not announced by Cardcom: `server/actions/payments/refund.ts` calls the provider, inserts `refunds`, sets `orders.status = 'refunded'` and the item statuses. There is no inbound refund event to map. |
| 200 fast, process later | Sync by design: a 2xx tells Cardcom to stop retrying, so the handler answers 2xx only once the money fact is journalled. A charge that verified but did not close keeps `processed_at NULL` and is replayed by `server/payments/webhook-dlq.ts` via `/api/cron/webhook-dlq`; `cron/stranded-payments` is the floor under a callback that never arrived. |
| `CARDCOM_WEBHOOK_SECRET` in Vercel | Present in production and preview before this item (`vercel env ls`). It is OUR secret in OUR callback URL, so there is nothing to wait for from Cardcom. |

## What this item added

1. **`src/app/api/webhooks/cardcom/route.ts`**: the same handler re-exported
   under the `/api/webhooks/<provider>` path the other provider webhooks use.
   One handler, two paths; the terminal keeps the original IndicatorUrl.
2. **Declines reach Sentry.** New `capturePaymentWarning` in
   `lib/observability/sentry.ts` (warning level, same fingerprint scheme, no
   ntfy push). The declined branch now logs `cardcom.callback_declined` and
   records the warning with the order, payment and response code. A decline is
   routine and must not page the alarm channel, which is why it is not
   `capturePaymentAlarm`.
3. **`tests/webhooks/cardcom.spec.ts`**: signed success, unsigned, replay,
   unknown event, plus the declined charge, all driven through the new path.
   `vitest.config.ts` now includes `tests/**/*.spec.ts`; a spec outside the
   include list silently never runs, and the folder held only SQL before.

## Not done, and why

- **No HMAC.** There is no signature to verify. Adding a check against a header
  Cardcom never sends would either refuse every real callback or be dead code
  that reads as protection. `.claude/skills/cardcom-payments/SKILL.md` says the
  same.
- **No Redis SET NX dedup.** The database UNIQUE is the dedup and it survives a
  Redis outage, a key eviction and a 7-day TTL expiring on a late retry. A Redis
  layer in front would add a second source of truth for whether an event was
  seen, and `UPSTASH_REDIS_REST_*` is unset in production.
- **No pg_cron + pg_net dispatch for the webhook itself.** Cardcom's own retry
  on 5xx plus the DLQ replay is the queue. The 12 pg_cron jobs of migration 162
  currently POST where the routes expect GET (258 x 405 in 24 h, S29); that is a
  separate open item and not something to add more jobs to.
- **No placeholder secret.** The real one is already set.

## Gates

```
$ pnpm exec vitest run tests/webhooks/cardcom.spec.ts src/app/api/payments/cardcom/webhook
  Test Files 3 passed (3); Tests 35 passed (35)
$ pnpm exec vitest run <the 7 other suites that mock lib/observability/sentry>
  Test Files 7 passed (7); Tests 101 passed (101)
$ pnpm type-check   -> 0 errors
$ pnpm lint         -> exit 0 (biome + 12 gates)
$ git diff --stat design-locked-2026-10-19 -- <frozen list>  -> empty
```
