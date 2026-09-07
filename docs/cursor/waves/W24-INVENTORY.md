# W24 Inventory

Code-agent spec. `reserve_order_stock` 15 min TTL < order expiry. Cron releases. 172 hide master zeros stock on the ₪1 test row (unapplied). App guard already refuses 95%+ vs `full_price`.

---

## What it builds

1. Keep reservation contract. Variant stock wins including zero.
2. Human apply `172_hide_master_product_test_row.sql` (stock 0, not delete).
3. Uploader/scanner cannot raise stock in v1.
4. Physical ship vs coupon: coupon stock is voucher units issued at pay, not warehouse.

---

## Tables

`products.stock_quantity`, `product_variants`, `stock_reservations` (zero-policy).

---

## RLS

Reservations service_role. Supplier SELECT own counts; UPDATE admin.

---

## Money invariants

Stock 0 cannot sell. Consume failure after pay must not un-pay (G11). Master row: guard + 172.

---

## Tests before close

Reservation contract, cron stock, implausible-discount, cart unavailable.

---

## Feature flag

None. 172 is a migration, not a flag.

---

## Docs updated

`LAUNCH-BLOCKERS.md`, `MIGRATION-PLAYBOOK.md` (two 172 files).

---

## Edge cases

Id `9bb347f8-03ec-48ce-8ff2-2503fb74c895`. Three real products named מאסטר must not be denylisted.

---

## Hebrew UX strings

| Key | Copy |
|---|---|
| OOS | אזל מהמלאי |
| Unavailable | המוצר לא זמין |
| Implausible | (cart refusal; do not say "test product") |

---

## Open questions

| Q | Best answer |
|---|---|
| Delete the master row? | **No.** Zero stock. May be referenced by `order_items`. |

---

## Second pass (money)

- Reservation TTL 15 min must stay **shorter** than pending-order expiry. Cron `/api/cron/stock` releases. If consume-after-pay fails, the order stays `paid` (G11). Do not un-pay to "fix stock".
- Coupon stock is units issued at finalize, not a warehouse pick. Physical uses `stock_reservations` (zero-policy; admin client to inspect).
- Master SKU id `9bb347f8-03ec-48ce-8ff2-2503fb74c895`: app guard on `full_price` **and** pending `172_hide_master_product_test_row.sql` (stock 0). The other 172 is `172_rls_zero_policy_tables.sql`. Do not delete by name מאסטר.
- Scanner `member_role` cannot raise stock. Uploader cannot either (W08).
- Hebrew cart: אזל מהמלאי. Never "test product".

