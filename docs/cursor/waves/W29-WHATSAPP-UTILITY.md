# W29 WhatsApp utility (transactional)

Code-agent spec. Today: click-to-chat (`src/lib/whatsapp.ts`), `sendOutboxWhatsapp` on the notifications cron. `products.whatsapp_enabled` was false on all products as of 2026-09-02.

---

## What the wave builds

1. Transactional templates only: voucher issued, expiry warning, refund done. 24h session rules / Meta template approval still required.
2. Drain stays `notification_outbox` (one row, independent email and WhatsApp/push legs).
3. `NEXT_PUBLIC_WHATSAPP_PHONE` must be the real business number before any template cites it (H4). Never `972524635550`.

**Do not build.** Marketing blasts (W30). Twilio as a second parallel sender without a vendor decision.

---

## Tables

`notification_outbox` (add channel columns only with a human migration). `email_suppressions` equivalent for WhatsApp opt-out if required by Meta.

---

## RLS

service_role drain. Users cannot INSERT outbox.

---

## Money invariants

Templates may show `formatIls` of **snapshotted** amounts from payload `*_agorot`. Do not re-read live products.

---

## Tests

Outbox kind CHECK still agrees (`outbox-kinds.test.ts`). WhatsApp send failure does not rollback email success (independent legs). Kill switch skips send, keeps row.

---

## Feature flag

`KILL_SWITCH_NOTIFICATIONS`. Product-level `whatsapp_enabled`. Off product: no click-to-chat, utility still may send if the user opted in at pay (keep these distinct).

---

## Close

H4 number set. Templates approved. No test-store number. No new kind without CHECK + builder.

---

## Second pass (after contracts and ops)

Binding: `WAVE-INDEX.md`, `contracts/ROLE-VENDOR.md` (till is `supplier_members`), `contracts/LEDGER.md` (integer agorot, cashback at finalize), `contracts/PAYMENT-BOUNDARY.md` (GetLpResult, no HMAC), `contracts/MIGRATION-PLAYBOOK.md` (full pending filenames). Feature flags are env. Do not invent payout or escrow writers. Hebrew UX stays RTL source-of-truth.
