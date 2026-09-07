# W21 Supplier public store

Code-agent spec. `/suppliers`, `/s/[id]`, supplier directory already routed. This wave is **public shop page**, not the till.

---

## What the wave builds

1. Public supplier page: name, city, hours, WhatsApp (only if `whatsapp_enabled` and a real number), deals that pass the public product predicate.
2. No scanner UI. No issued-voucher list. No PIN.
3. `/s/[id]` stays a short alias.

---

## Tables

`suppliers`, `supplier_branches`, `products`, `coupon_deals`. Read-only public.

---

## RLS

Public SELECT of published suppliers. `supplier_members` and `supplier_staff` are not public. Do not list member emails.

---

## Money invariants

Same `ProductCard` as home. No supplier-specific global rate.

---

## Tests

`SupplierInfo.test.tsx`, `product-type.ts` (`is_coupon_enabled` wins so barbecue is not "נשלח"). Directory does not render PIN fields.

---

## Feature flag

None.

---

## Close

Public page cannot redeem, cannot see other shops' members, prices match PDP.

---

## Second pass (after contracts and ops)

Binding: `WAVE-INDEX.md`, `contracts/ROLE-VENDOR.md` (till is `supplier_members`), `contracts/LEDGER.md` (integer agorot, cashback at finalize), `contracts/PAYMENT-BOUNDARY.md` (GetLpResult, no HMAC), `contracts/MIGRATION-PLAYBOOK.md` (full pending filenames). Feature flags are env. Do not invent payout or escrow writers. Hebrew UX stays RTL source-of-truth.
