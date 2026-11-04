/**
 * `/api/webhooks/cardcom`: the Cardcom callback under the path every other
 * provider webhook here uses (`/api/webhooks/<provider>`).
 *
 * ONE HANDLER, TWO PATHS. The terminal is configured with
 * `/api/payments/cardcom/webhook` as its IndicatorUrl, and every test, runbook
 * and dead-letter replay names that path, so it stays. This file is the same
 * handler re-exported, not a second implementation: a copy would be the next
 * place a fix lands once and not twice.
 *
 * WHAT THE HANDLER DOES NOT DO, ON PURPOSE. Cardcom does not sign its
 * callbacks, so there is no HMAC to check and none is checked. Authenticity is
 * the unguessable `?s=` secret in the callback URL (`CARDCOM_WEBHOOK_SECRET`,
 * with `_PREVIOUS` accepted during a rotation) plus a mandatory
 * server-to-server `GetLpResult` re-verification, which is the ONLY trusted
 * source of amount, status and token. Dedup is the UNIQUE
 * `(provider, external_event_id)` on `payment_webhook_events`, journalled
 * before anything else happens: a replay is a 200 no-op, any other insert
 * failure is a 503 so Cardcom retries. A charge that verified but did not
 * close its order keeps `processed_at` null and is replayed by
 * `server/payments/webhook-dlq.ts` from `/api/cron/webhook-dlq`.
 *
 * See `src/app/api/payments/cardcom/webhook/route.ts` and
 * `.claude/skills/cardcom-payments/SKILL.md`.
 */
export { POST } from '@/app/api/payments/cardcom/webhook/route'
