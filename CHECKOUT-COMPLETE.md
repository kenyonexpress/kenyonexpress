# CHECKOUT-COMPLETE

סיכום סטטוס מסלול קופה: עגלה → Cardcom → paid → vouchers.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד.

מסמכים קשורים:

```
docs/ARCHITECTURE-CHECKOUT-FLOW.md
docs/ARCHITECTURE-CART-CHECKOUT.md
docs/ARCHITECTURE-CARDCOM-WEBHOOKS.md
docs/ARCHITECTURE-MONEY.md
```

מודל כסף: **No Escrow**.

---

## 0. החלטה

| # | הכרעה |
|---|---|
| C1 | Finalize רק אחרי אימות GetLpResult / webhook. |
| C2 | אגורות integer בכל מסלול הכסף. |
| C3 | קופון: platform_settled; supplier_due=0. |
| C4 | Mint vouchers idempotent לפי quantity. |
| C5 | Login חובה לפני תשלום. |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| Finalize מ-redirect בלבד | סיכון paid מדומה. |
| Held עד redeem | No Escrow. |
| float | MONEY. |

---

## 2. סכמת DB

`orders`, `order_items`, `payments`, `payment_webhook_events`, `vouchers`, `idempotency_keys`. אין DDL כאן.

---

## 3. מקרי קצה

| קוד | תוצאה |
|---|---|
| `duplicate_webhook` | idempotent |
| `wallet_only` | finalize בלי Cardcom |
| `amount_mismatch` | לא paid |
| `partial_mint` | reconcile; לא מבטל paid |

---

## 4. פתוחות

| # | פתוח | שמרני |
|---|---|---|
| O1 | מדדי completion בזמן אמת | לפי OBSERVABILITY |
| O2 | אורח מלא ב-GA | לא |

עודכן: 2026-08-12.

---

## 5. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | BINDING תמציתי על batch-2 |
