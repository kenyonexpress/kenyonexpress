# ארכיטקטורה: Checkout Cardcom

זרימת checkout מלאה, Cardcom Low Profile, snapshots, No Escrow.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד.  
מודל כסף: **No Escrow**; agorot integer.

מסמכים קשורים:

```
docs/ARCHITECTURE-MASTER-CHECKOUT-REDEMPTION.md
docs/ARCHITECTURE-COUPON-REDEMPTION.md
docs/ARCHITECTURE-CARDCOM-EDGE-CASES.md
docs/ARCHITECTURE-CARDCOM-WEBHOOKS.md
docs/ADMIN-PRODUCT-PAGE-SPEC.md
```

Flow מפורט + TS dumps: git history לפני 2026-08-12.

---

## החלטה

| # | הכרעה |
|---|---|
| CH1 | קופון: charge מלא `coupon_price` באתר; יתרה בעסק ב-QR; platform keeps 100% on-site. |
| CH2 | פיזי: split מיידי לפי snapshot `platform_percent`; payout T+3. |
| CH3 | Login at Pay; guest cart עד Pay; merge idempotent. |
| CH4 | beginCheckout: re-price server; block lines בלי percent/coupon_price. |
| CH5 | Snapshots על `order_items` immutable; לא recompute מ-product חי. |
| CH6 | Cardcom Low Profile; webhook + return verify; finalize idempotent. |
| CH7 | Mixed cart allowed; total = sum on-site lines. |
| CH8 | Wallet debit agorot before Cardcom charge remainder. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| Escrow held until redeem | CH1: No Escrow. |
| guest email-only pay v1 | login-at-pay default. |
| fixed 5% platform fee | CH2: per product. |
| client-sent totals | CH4: server re-price. |
| Cardcom sub-merchants per supplier v1 | platform merchant account. |

---

## סכמת DB

```text
orders, order_items (snapshots: platform_percent, paid_on_site_agorot, commission_agorot)
payments, payment_events
vouchers (issued on coupon finalize)
settlement_events (physical split)
wallet_transactions (optional debit)
```

אין DDL חדש.

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | product unpublished mid-checkout | block at beginCheckout. |
| CE2 | wallet covers full total | zero Cardcom charge path. |
| CE3 | physical without IL address | validation block. |
| CE4 | webhook duplicate | idempotent finalize. |
| CE5 | percent null on line | cannot checkout. |
| CE6 | refund after redeem | block per policy. |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | Q-CHK-GUEST email pay | product decision. |
| O2 | multi Cardcom account routing | 075 migration. |
| O3 | saved token charge UX | account tokens. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-07-28 | checkout binding full |
| 2026-08-12 | batch-2: BINDING קצר |
