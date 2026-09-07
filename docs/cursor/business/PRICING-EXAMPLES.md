# Pricing examples (agorot)

1₪ = 100 agorot. `applyBp` half-up. Coupon on-site is absolute.

## 1. Coupon 400₪ face, 40₪ coupon price, qty 1, 0 cashback, 0 wallet

face 40000, paysNow 4000, balanceDueAtBusiness 36000, platformFee 4000, supplierImmediate 0, card 4000.

Refund issued same day: CancelOnly possible. After redeem: card refund blocked; wallet goodwill only.

## 2. Same, qty 3

paysNow 12000, three vouchers. Refund one issued unit: partial; not CancelOnly.

## 3. Physical 200₪, platform 10% (1000 bp), qty 1

face 20000, fee 2000, supplierImmediate 18000, paysNow 20000. Residual = face − fee.

## 4. Physical 100.00₪, 12.5% (1250 bp)

face 10000, fee 1250, residual 8750.

## 5. Physical 1.01₪, 10%

face 101, fee 10 (half-up 10.1→10), residual 91. Sum 101.

## 6. Coupon + 25% cashback on on-site 40₪

cashback 1000 agorot of 4000, not of 40000. Credit at finalize from reserve.

## 7. Wallet 10₪ on coupon 40₪

wallet 1000, card 3000. Lines unchanged. Referral min uses on-site cash 3000 if that is the paid-on-site definition (conservative: cash in).

## 8. Cancellation fee 200₪ charge, not defect

5% = 1000, cap 10000 → 1000. Charge 20000 → 5% = 1000 still. Charge 3000₪ → 5% = 15000 → cap 10000.

## 9. Implausible 1₪ vs 400₪ full_price

1*100=100, 40000*5=200000, 100<=200000 → refuse sale.

## 10. Refund physical after split_executed

Claw `supplierDebits` 18000 or platform double-pays. Snapshot 10% not today's 15%.

---

## Second pass

Read with `waves/WAVE-INDEX.md` and `business/LAUNCH-BLOCKERS.md`. Tree on this branch wins over older briefs. Do not apply SQL from this worktree.
