# W28 Monitoring

Code-agent spec. Sentry EU, `log.ts` JSON `event`, ntfy money, Axiom optional, PostHog HTTP no SDK, Vercel analytics.

---

## What it builds

1. ntfy topic unguessable in Production (`NTFY_TOPIC`). Default `kenyon-ofir-limit` is public-ish. No amounts in ntfy.
2. `alertMoneyFailure` independent of Sentry DSN.
3. Cron health seven checks. Do not double-schedule 162 + Actions.
4. Admin queues for dead letters.

---

## Tables

`notification_outbox` dead, `payment_events`, `search_index_dlq`.

---

## RLS

Dead letters admin. Webhook events service_role.

---

## Money invariants

Alerts on charged-not-finalized, voucher issue fail after pay, refund provider fail, redeem RPC fail after valid QR. Not on catalogue 404.

---

## Tests before close

`sentry.test.ts`, `alert.test.ts`, `payment-alarm-push.test.ts`, `log-coverage.test.ts`.

---

## Feature flag

`ALERTS_ENABLED`. DSN unset: Sentry no-op, ntfy still if enabled.

---

## Docs updated

`ON-CALL-GUIDE.md`, `MONITORING` leftover, `OBSERVABILITY-MAP.md`.

---

## Edge cases

Debug route 404 off. Do not page on search empty.

---

## Hebrew UX strings

Operator ntfy is Hebrew one-liners without ₪ amounts. Example: תשלום נגבה ולא סוכם.

---

## Open questions

| Q | Best answer |
|---|---|
| Axiom required at launch? | **No.** Must not fail checkout if unset. |

---

## Second pass (pages a human)

- ntfy: charged-not-finalized, voucher issue failed after pay, refund provider error, redeem RPC failed after valid QR (`ops/ON-CALL-GUIDE.md`).
- Topic must be unguessable. No amounts in the payload.
- Analytics ingest 169 is honesty, not H0. Four funnel events can be 0 while money works.
- `ALERTS_ENABLED` must not be false in production. Sentry money events must not drop.
- Twelve crons in
  `scripts/cron-jobs.json`.
  Hobby
  `vercel.json`
  silence is an incident class of its own.

---

## Third pass

Operator ntfy without ₪: תשלום נגבה ולא סוכם. Axiom must not fail checkout. Topic unguessable.


