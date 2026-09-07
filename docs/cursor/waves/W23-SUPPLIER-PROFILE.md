# W23 Supplier profile (self edit)

Code-agent spec. Hours, address, WhatsApp, logo via signed R2 PUT. **Not** commission, **not** payout bank, **not** PIN hashes.

---

## What the wave builds

1. Owner/manager edit of public profile fields on `/supplier` (or `/supplier/profile` if added on a **code** branch).
2. Scanner role: read-only profile, scan only.
3. Logo: same R2 pipeline as admin images, MIME allowlist, Hebrew alt.

---

## Tables

`suppliers`, `supplier_branches`, `media_assets`. Not `supplier_staff` (PIN). Not `products.platform_percent`.

---

## RLS

`is_supplier_owner` / manager UPDATE of allowlisted columns. Trigger or column list must refuse `commission_percent`, `default_split_percent` as money. If those columns remain, they are prefills only and checkout must ignore them (already the rule).

---

## Money invariants

Profile edit cannot change historical `order_items` snapshots. Cannot change live product split.

---

## Tests

Scanner 403 on profile write. Owner cannot PATCH `platform_percent` on products from this form. R2 without credentials: upload unavailable, not a 500 on the shop.

---

## Feature flag

None. Missing R2: logo stays empty.

---

## Close

Public page updates. Money columns untouched. Audit row on profile change.

---

## Second pass (after contracts and ops)

Binding: `WAVE-INDEX.md`, `contracts/ROLE-VENDOR.md` (till is `supplier_members`), `contracts/LEDGER.md` (integer agorot, cashback at finalize), `contracts/PAYMENT-BOUNDARY.md` (GetLpResult, no HMAC), `contracts/MIGRATION-PLAYBOOK.md` (full pending filenames). Feature flags are env. Do not invent payout or escrow writers. Hebrew UX stays RTL source-of-truth.
