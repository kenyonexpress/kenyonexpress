# W25 Supplier stock

Code-agent spec. Stock reservation already exists (`reserve_order_stock`, 15 min TTL shorter than order expiry). This wave is **partner visibility**, not a second warehouse.

---

## What the wave builds

1. Supplier manager sees stock of **their** products. Cannot edit another shop.
2. Admin remains the publisher of stock for v1 unless a product decision allows manager increment. Default: manager cannot raise stock (fraud: infinite coupon stock).
3. Cron `/api/cron/stock` releases expired reservations. Do not double-release.

---

## Tables

`products.stock_quantity`, `product_variants.stock_quantity`, `stock_reservations` (service_role only, zero-policy).

---

## RLS

Supplier SELECT own products. UPDATE stock: admin only in v1. Flag over-permissive if a policy lets scanner UPDATE stock.

---

## Money invariants

Stock 0 cannot be sold. Reservation is not a charge. Finalize consumes; failure to consume must **not** un-pay (G11 / R27).

---

## Tests

`stock-reservation-contract.test.ts`, cron stock route tests. Cross-shop 42501. Scanner cannot PATCH stock.

---

## Feature flag

None.

---

## Close

Partners see counts. Admin writes. Reservations still 15 min. Finalize still pays if consume fails (logged).

---

## Second pass (after contracts and ops)

Binding: `WAVE-INDEX.md`, `contracts/ROLE-VENDOR.md` (till is `supplier_members`), `contracts/LEDGER.md` (integer agorot, cashback at finalize), `contracts/PAYMENT-BOUNDARY.md` (GetLpResult, no HMAC), `contracts/MIGRATION-PLAYBOOK.md` (full pending filenames). Feature flags are env. Do not invent payout or escrow writers. Hebrew UX stays RTL source-of-truth.
