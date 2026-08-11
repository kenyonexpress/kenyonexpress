# ארכיטקטורה: Checkout + Payment (מצביע BINDING)

סקירה קצרה לתשלום Cardcom ו-checkout. פירוט ב-docs/.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **No Escrow**; agorot integer; snapshot ב-`order_items`.

**מקורות קנוניים:**

```
docs/ARCHITECTURE-CHECKOUT-CARDCOM.md
docs/ARCHITECTURE-CHECKOUT-FLOW.md
docs/ARCHITECTURE-MASTER-CHECKOUT-REDEMPTION.md
docs/ARCHITECTURE-CARDCOM-WEBHOOKS.md
docs/ARCHITECTURE-MONEY.md
```

Dump ארוך: git history לפני 2026-08-12.

---

## החלטה

| # | הכרעה |
|---|---|
| CH1 | Cardcom Low Profile בלבד; PAN לא אצלנו (SAQ-A). |
| CH2 | מקור אמת: `GetLpResult`; webhook `?s=` + verify API. |
| CH3 | קופון: charge מלא `coupon_price`; 100% לפלטפורמה; יתרה בעסק. |
| CH4 | פיזי: split מ-snapshot `platform_percent`; payout T+N. |
| CH5 | Login at Pay; guest cart עד Pay; merge idempotent. |
| CH6 | beginCheckout: re-price server; block בלי percent/coupon_price. |
| CH7 | Wallet debit agorot לפני Cardcom remainder. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| root DESIGN dump | docs/ קנוני. |
| Escrow held until redeem | No Escrow. |
| HMAC webhook body | Cardcom לא חותם גוף. |
| client-sent totals | server re-price. |
| fixed 5% platform fee | per product. |
| PSP שני | Cardcom בלבד. |

---

## סכמת DB

```text
orders, order_items (snapshots)
payments, payment_webhook_events
vouchers (coupon finalize)
wallet_transactions (optional debit)
```

אין DDL חדש.

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | product unpublished mid-checkout | block beginCheckout. |
| CE2 | wallet covers full total | zero Cardcom path. |
| CE3 | webhook duplicate | idempotent finalize. |
| CE4 | percent null | cannot checkout. |
| CE5 | refund after redeem | block per policy. |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | guest email-only pay | product decision. |
| O2 | saved token charge UX | account tokens. |
| O3 | multi Cardcom account | migration 075. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-07-20 | DESIGN dump root |
| 2026-08-12 | batch-2: BINDING מצביע |
