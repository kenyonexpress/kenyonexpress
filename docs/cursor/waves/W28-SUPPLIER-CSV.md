# W28 Supplier CSV

Code-agent spec. Admin product CSV import exists (`parseProductsCsv`). Type enum there is `physical | coupon | recurring` (**no `service`**).

---

## What the wave builds

1. Admin export/import of catalogue. Integer money via `ilsToAgorot`. No `parseFloat` on prices (`money-no-float.test.ts` allowlist).
2. Supplier export of **own** redemptions (already a query). Not issued codes (inventory dump).
3. Import cannot set `platform_percent` missing → row unsellable, not default 10.

---

## Tables

`products`, `product_variants`, `voucher_redemptions` (export).

---

## RLS

Admin import. Supplier export scoped by `is_supplier_member`. content_uploader: catalogue columns only, no money columns (existing prohibitions).

---

## Money invariants

CSV `10.5` percent → bp via `percentToBasisPoints` / `ilsToAgorot` (rejects >2 decimals). Do not use raw `parseFloat`. Coupon price column is absolute ILS string with 2 decimals.

---

## Tests

`parseProductsCsv` rejects service if not in enum. Missing coupon price → not sellable. content_uploader cannot import `platform_percent` if policy forbids.

---

## Feature flag

None.

---

## Close

Import does not invent rates. Export does not leak other shops.

---

## Second pass (after contracts and ops)

Binding: `WAVE-INDEX.md`, `contracts/ROLE-VENDOR.md` (till is `supplier_members`), `contracts/LEDGER.md` (integer agorot, cashback at finalize), `contracts/PAYMENT-BOUNDARY.md` (GetLpResult, no HMAC), `contracts/MIGRATION-PLAYBOOK.md` (full pending filenames). Feature flags are env. Do not invent payout or escrow writers. Hebrew UX stays RTL source-of-truth.
