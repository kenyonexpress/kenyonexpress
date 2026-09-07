# W17 Email

Code-agent spec. Resend via `/api/cron/notifications`. Outbox kinds must match CHECK + `buildNotification` (`outbox-kinds.test.ts`). Measured 2026-08-19: five kinds 23514'd until the CHECK caught up.

---

## What it builds

1. Keep the three-way agreement. New kind = migration CHECK + builder + enqueue site in one human apply + deploy.
2. Voucher email is **cron drain**, not finalize. Paid with no mail is a drain/H1 issue, not an un-pay.
3. `dedupe_key` unique AND Resend idempotency key.
4. Two legs: email and push independent. WhatsApp adapter exists; failures must not rewind the other leg.
5. MAX_ATTEMPTS 5, backoff 2×4^(n-1) minutes, then `dead`. Admin requeue.

---

## Tables

`notification_outbox`, `email_suppressions`.

---

## RLS

service_role drain. Anon cannot INSERT (contact action uses admin/DEFINER).

---

## Money invariants

Payload `amount_agorot` integers. Kill switch skips send, keeps row. Do not email live `products` prices.

---

## Tests before close

Three-way kinds test. Cron 401. Kill switch. Welcome `welcome:<uid>` on auth callback ON CONFLICT DO NOTHING.

---

## Feature flag

`KILL_SWITCH_NOTIFICATIONS`. Resend API key missing: degrade, do not 500 checkout.

---

## Docs updated

`contracts/OUTBOX.md`, `RUNBOOK-EMAIL-DOWN.md`.

---

## Edge cases

Guest order: no profile email; refund mail may have no recipient. Invoice kinds after 155.

---

## Hebrew UX strings

| Key | Copy |
|---|---|
| Voucher subject | הקופון שלך מקינון אקספרס |
| Dead letter admin | נכשל אחרי 5 ניסיונות |

---

## Open questions

| Q | Best answer |
|---|---|
| Edge Function drain? | **No.** pg_net was the blocker; cron is the drain. Do not add a second sender. |

---

## Second pass (outbox)

- Drain is `/api/cron/notifications` every 5 minutes. Finalize does not send.
- Adding a kind: CHECK + enqueue + `buildNotification` + test together (`contracts/OUTBOX.md`).
- Transactional voucher mail does not need the marketing checkbox. Abandoned cart does (`CONSENT-MODEL.md`).
- `email_suppressions` wins. Dead after 5: admin requeue. Do not Gmail a QR.
- `KILL_SWITCH_NOTIFICATIONS` parks email **and** WhatsApp. Too coarse for Twilio-only incidents.

---

## Third pass

Subject: הקופון שלך מקינון אקספרס. Dead letter: נכשל אחרי 5 ניסיונות. Unique
`dedupe_key`
makes replay safe.


