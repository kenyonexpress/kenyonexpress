# C14 Web push: unsubscribe, send, expiry reminders

## Already in place (C10/C11, rc5 F14)
- VAPID keys in Vercel production: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (see `docs/C11-RESULT.md`). `src/lib/push/web-push.ts` is inert without them.
- `POST|DELETE /api/push/subscribe` stores or removes a subscription in `public.push_subscriptions`.

## Added in C14
- `POST /api/push/unsubscribe` `{ endpoint }`: signed-in user, rate limited, deletes on the user's own client (RLS `delete_own` is the ownership check).
- `GET|POST /api/push/send`: `CRON_SECRET` (`x-cron-secret` or Bearer). Calls `enqueue_expiring_voucher_notices({7,1})` (T-7 and T-1, deduped per voucher and bucket), then drains the outbox via `/api/cron/notifications`, which sends browser push, app push and mail. Test: `src/app/api/push/send/route.test.ts`.
- `migrations/pending/311_pg_cron_push_expiry_reminders.sql`: pg_cron job `push-expiry-reminders`, daily 06:00 UTC, `net.http_post` to `/api/push/send`. Needs `app.settings.base_url` and `app.settings.cron_secret` (same as 291). Rollback: `SELECT cron.unschedule('push-expiry-reminders');`

## Status
- Code, unit tests (`src/app/api/push`, 3 passing), biome: done.
- Migration 311 applied to production on 2026-10-29 (`cron.schedule` jobid 142, `push-expiry-reminders`, `0 6 * * *`). See STATE.md "C14 CLOSED".
