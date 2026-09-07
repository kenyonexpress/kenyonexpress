# W20 Support center

Code-agent spec. `profiles.role = support` is read-expanded, **no money write**. Do not let tickets call `refundOrder`.

---

## What the wave builds

1. `/faq` plus an internal queue (admin) for customer messages from `/contact`.
2. Support can SELECT orders / vouchers needed to answer "where is my code". Cannot refund, cannot redeem, cannot change `platform_percent`.
3. Hebrew macros. No English ticket UI at launch (W32).

---

## Tables

Contact / ticket table if added: staff SELECT, service INSERT from the contact action. `orders` / `vouchers` read via existing admin read policies if `support` is in them. Confirm before granting.

---

## RLS

Flag over-permissive: any policy that lets `support` UPDATE `orders.status` or INSERT `refunds`. `refundOrder` stays `requireAdminSession` (admin / super_admin).

---

## Money invariants

Support must not type an agorot goodwill into a form that writes `wallet_entries` without the ledger RPC. Goodwill is an admin money action (separate, audited).

---

## Tests

`uploader-prohibitions` pattern for support: refund / redeem / product price 403. Contact rate limit.

---

## Feature flag

None. Role is the gate.

---

## Close

Support can see, cannot move money. Tests prove 403 on `refundOrder`.

---

## Second pass (after contracts and ops)

Binding: `WAVE-INDEX.md`, `contracts/ROLE-VENDOR.md` (till is `supplier_members`), `contracts/LEDGER.md` (integer agorot, cashback at finalize), `contracts/PAYMENT-BOUNDARY.md` (GetLpResult, no HMAC), `contracts/MIGRATION-PLAYBOOK.md` (full pending filenames). Feature flags are env. Do not invent payout or escrow writers. Hebrew UX stays RTL source-of-truth.
