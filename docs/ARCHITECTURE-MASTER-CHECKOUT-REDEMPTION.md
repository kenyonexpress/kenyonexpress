# ארכיטקטורה: Master Checkout Redemption

מסמך מאחד: checkout → pay → voucher → redeem. No Escrow.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד.

מסמכים קשורים:

```
docs/ARCHITECTURE-CHECKOUT-CARDCOM.md
docs/ARCHITECTURE-COUPON-REDEMPTION.md
docs/ARCHITECTURE-COUPON-REDEMPTION-UX.md
docs/ARCHITECTURE-FULFILLMENT-SUPPLIER-WORKFLOW.md
docs/ARCHITECTURE-MONEY.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| MR1 | מסלול אחד: cart → beginCheckout → Cardcom → finalize → voucher/fulfillment. |
| MR2 | כסף: agorot integer; `src/lib/money.ts` יחיד. |
| MR3 | קופון: paid_on_site = platform revenue; till = face - paid_on_site at merchant. |
| MR4 | redeem: scan QR; conditional `issued→redeemed`; לא תשלום נוסף ב-KE. |
| MR5 | פיזי: notify supplier; ship; לא money gate on delivery. |
| MR6 | Notifications async outbox; לא block finalize. |
| MR7 | Analytics `purchase` server after ledger write. |
| MR8 | No Escrow, no held release to supplier on coupon prepaid. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| separate checkout per product type | MR1: mixed cart. |
| redeem triggers supplier payout | MR3: No Escrow. |
| sync email before success page | MR6: async. |
| float in commission calc | MR2: agorot. |
| client-side purchase analytics only | MR7: server. |

---

## סכמת DB

```text
orders → order_items → payments
vouchers → voucher_redemptions / coupon_scan_events
settlement_events (physical)
analytics_events (purchase, redeem)
```

אין DDL חדש.

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | pay OK, voucher insert fail | alert; reconcile; לא silent success. |
| CE2 | double scan same voucher | second returns already_used. |
| CE3 | wrong supplier scan | not_found anti-enumeration. |
| CE4 | expired voucher | reject scan; wallet policy if any. |
| CE5 | partial refund physical | line-level; audited. |
| CE6 | finalize before webhook | idempotent either path. |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | end-to-end diagram in CI | e2e purchase-flow. |
| O2 | offline redeem mode | out of scope. |
| O3 | subscription checkout | RECURRING doc. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | master checkout redemption |
| 2026-08-12 | batch-2: BINDING 5 סעיפים |
