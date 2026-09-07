# W26 Supplier settlement view

Code-agent spec. Coupon partners are **owed 0** from the platform. Physical residual is accounting. Admin `payouts.ts` is dead (`42P01`, no `payout_statements`). Do not "fix the 500" by applying a payout schema.

---

## What the wave builds

1. Read-only Hebrew page: coupon prepaid kept by platform; cash-at-till never appears as a payable; physical lines show snapshotted `supplier_immediate_agorot`.
2. CSV of **snapshots**, not live product percents (`settlement-balance.test.ts`).
3. `/api/supplier/payouts/csv` must not query missing tables. If it 500s, return Hebrew "אין תשלומים במודל הקופון" instead of creating tables.

---

## Tables

`order_items` (snapshot columns), `settlement_events` (server). Not `payout_statements`. `escrow_holds` is fossil / unused on the coupon path; do not display "נאמנות".

---

## RLS

`is_supplier_order` SELECT paid orders for that supplier. No UPDATE of money columns.

---

## Money invariants

Settlement never joins live `products.platform_percent`. Coupon `supplierDue` is 0. Physical residual = face − platform fee (fee first, residual by subtraction).

---

## Tests

`no-escrow-in-supplier-due.test.ts`, `settlement-balance.test.ts`. CSV does not import `admin/payouts.ts` as live. Types-ahead payout tables are not queried.

---

## Feature flag

None. Dead payout UI: hide or stub.

---

## Close

No 500 on `/supplier/payouts`. Numbers match snapshots. No escrow copy.

---

## Second pass (after contracts and ops)

Binding: `WAVE-INDEX.md`, `contracts/ROLE-VENDOR.md` (till is `supplier_members`), `contracts/LEDGER.md` (integer agorot, cashback at finalize), `contracts/PAYMENT-BOUNDARY.md` (GetLpResult, no HMAC), `contracts/MIGRATION-PLAYBOOK.md` (full pending filenames). Feature flags are env. Do not invent payout or escrow writers. Hebrew UX stays RTL source-of-truth.
