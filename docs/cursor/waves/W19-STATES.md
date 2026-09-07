# W19 States

Code-agent spec. Order guard 137, voucher guard 166, settlement statuses. Do not invent `authorized` / `captured` (not in deployed enums; 22P02).

---

## What it builds

1. Align UI badges with live enums only.
2. Document disputed: if not an enum member, it is an **ops process** + audit, not a status write.
3. Refund planner is the only legal card path after pay; redeemed voucher blocks card refund.

---

## Tables

`orders.status`, `order_items.settlement_status`, `vouchers.status`, `payments.status`, `refunds`.

---

## RLS

Triggers fire for service_role too. Catch-and-set past `23514` is forbidden.

---

## Money invariants

`paid` is written only by `finalizeOrder`. Token charge skips `redirected`. Coupon line `split_executed` with supplier 0.

---

## Tests before close

`state-machine.test.ts` orders and vouchers, `status-transitions.test.ts`, SQL tests if present. UI never offers `pending → paid`.

---

## Feature flag

None.

---

## Docs updated

`ORDER-STATE-MACHINE.md`, `VOUCHER-STATE-MACHINE.md`, `REFUND-STATE-MACHINE.md`.

---

## Edge cases

Same Israel calendar day: Cardcom `CancelOnly` vs credit. `en-CA` format Asia/Jerusalem.

---

## Hebrew UX strings

| Status | Copy |
|---|---|
| pending | ממתין לתשלום |
| paid | שולם |
| refunded | זוכה |
| issued | טרם מומש |
| redeemed | מומש |

---

## Open questions

| Q | Best answer |
|---|---|
| Add `disputed`? | **Not without a human enum migration.** Use audit + ops runbook until then. |

---

## Second pass (after contracts and ops)

Binding: `WAVE-INDEX.md`, `contracts/ROLE-VENDOR.md` (till is `supplier_members`), `contracts/LEDGER.md` (integer agorot, cashback at finalize), `contracts/PAYMENT-BOUNDARY.md` (GetLpResult, no HMAC), `contracts/MIGRATION-PLAYBOOK.md` (full pending filenames). Feature flags are env. Do not invent payout or escrow writers. Hebrew UX stays RTL source-of-truth.
