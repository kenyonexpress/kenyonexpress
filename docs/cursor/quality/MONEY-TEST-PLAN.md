# Money test plan

Every property below must have a red-then-green test on the code branch.

1. `agorot` / `ilsToAgorot` reject non-safe-integer and >2 fraction digits.
2. `applyBp` ≡ `percentageOf` on a table of non-negative `(amount, bp)` including 5000 half-up.
3. `percentToBp` vs `percentToBasisPoints` documented disagreement on >2 decimals (`percentToBasisPoints` rejects).
4. Coupon line: platformFee = customerPaysNow; supplierImmediate = 0; `platformPercentBps` snapshotted 10000.
5. Physical: fee = percentageOf(face, bp); residual = face − fee (subtraction).
6. Missing `platform_percent` throws; no default 10.
7. Missing `coupon_price_ils` unsellable; never percent of face.
8. Wallet applied ≤ customerPaysNow; does not change line fee.
9. Cashback on customerPaysNow only; credited once at finalize `order:<id>:cashback`.
10. Cancellation fee applyBp 500 cap 10000; defect 0.
11. Implausible: `sell*100 <= compareAt*5` on `full_price` only.
12. `money-no-float` scan; `round2` not on agorot.
13. Checkout ignores client prices.
14. `fn_wallet_transfer` callers convert after integer math.
15. Invoice net+vat=gross, VAT 1800 bp.
16. Reports safe integers, Israel day, no live product join.
17. `completeSplitPair` 100; historical supplier_split-only products.
18. `is_coupon_enabled` wins in cart; checkout must not bill those five SKUs as physical.

Fixtures: 1₪=100 agorot. Example 40000 face, 4000 coupon on-site, 1000 bp physical.

---

## Second pass

Cashback at finalize key order:<id>:cashback. Coupon 100/0. Missing platform_percent unsellable. is_coupon_enabled wins. Implausible on full_price only.
