# W36 Supplier notifications

Code-agent spec. Kinds already include `supplier_sale` and `voucher_redeemed`. Drain is the same cron.

---

## What it builds

1. Sale alert per supplier at pay (trigger 095). Scan notice.
2. Do not add kinds without CHECK + builder.
3. WhatsApp utility to the shop: only with shop opt-in, not the customer float number.

---

## Tables

`notification_outbox`, `suppliers` contact email.

---

## RLS

service enqueue. Supplier cannot INSERT arbitrary kinds.

---

## Money invariants

Sale mail may show snapshotted on-site / face. Coupon mail must not say "we owe you X". Physical may show residual as accounting.

---

## Tests before close

Kinds test includes supplier_sale. Kill switch. Dedupe per order+supplier.

---

## Feature flag

`KILL_SWITCH_NOTIFICATIONS`. Shop email missing: skip that recipient, do not fail finalize.

---

## Docs updated

`OUTBOX.md`, `SUPPLIER-FAQ.md`.

---

## Edge cases

Multi-supplier cart: one mail per supplier, not one dump of the whole order's PII.

---

## Hebrew UX strings

| Key | Copy |
|---|---|
| Sale subject | מכירה חדשה בקינון אקספרס |
| Scan subject | קופון מומש אצלך |

---

## Open questions

| Q | Best answer |
|---|---|
| SMS? | **Not Twilio by default.** Israeli aggregator later. Outbox adapter. |

---

## Second pass (after contracts and ops)

Binding: `WAVE-INDEX.md`, `contracts/ROLE-VENDOR.md` (till is `supplier_members`), `contracts/LEDGER.md` (integer agorot, cashback at finalize), `contracts/PAYMENT-BOUNDARY.md` (GetLpResult, no HMAC), `contracts/MIGRATION-PLAYBOOK.md` (full pending filenames). Feature flags are env. Do not invent payout or escrow writers. Hebrew UX stays RTL source-of-truth.
