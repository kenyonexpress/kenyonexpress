# W18 Address validation

Code-agent spec. Israeli postal helper and checkout address step already exist. This wave is **deliverability for physical**, not a geo product.

---

## What the wave builds

1. Physical checkout requires a postal code that `israeli-postal-code` accepts. Coupon-only carts must not demand a ship-to.
2. Saved addresses: user-owned, not shared with `supplier_members`.
3. Admin cannot silently rewrite a customer's address without audit.

---

## Tables

Address columns on `orders` (snapshot at pay) and any `addresses` / profile address table if present. Snapshot wins; later profile edits do not rewrite a paid order.

---

## RLS

Owner CRUD on saved addresses. Orders address is frozen after pay (admin ship actions may add tracking, not rewrite billed address, unless a documented correction flow with audit).

---

## Money invariants

Address does not change commission. Shipping fee, if any, is integer agorot snapshotted on the order. No float per-km.

---

## Tests

`src/lib/checkout/israeli-postal-code.test.ts`, `saved-address-step-gate.test.tsx`. Coupon cart skips address. Physical without address → `ADDRESS_REQUIRED`.

---

## Feature flag

None.

---

## Close

Physical cannot pay without a valid IL postal. Coupon can. Snapshots do not drift.

---

## Second pass (after contracts and ops)

Binding: `WAVE-INDEX.md`, `contracts/ROLE-VENDOR.md` (till is `supplier_members`), `contracts/LEDGER.md` (integer agorot, cashback at finalize), `contracts/PAYMENT-BOUNDARY.md` (GetLpResult, no HMAC), `contracts/MIGRATION-PLAYBOOK.md` (full pending filenames). Feature flags are env. Do not invent payout or escrow writers. Hebrew UX stays RTL source-of-truth.
