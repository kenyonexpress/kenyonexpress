# Checkout Architecture (מצביע BINDING)

סקירה קצרה לזרימת checkout מ-cart עד paid. פירוט ב-docs/.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **No Escrow**; snapshot ב-`order_items`.

**מקורות קנוניים:**

```
docs/ARCHITECTURE-CHECKOUT-FLOW.md
docs/ARCHITECTURE-CART-CHECKOUT.md
docs/ARCHITECTURE-CART-GUEST.md
docs/ARCHITECTURE-CART-ZUSTAND.md
docs/ARCHITECTURE-MONEY.md
```

Dump ארוך: git history לפני 2026-08-12.

---

## החלטה

| # | הכרעה |
|---|---|
| CK1 | מקור אמת תשלום: GetLpResult בלבד. |
| CK2 | Guest cart עד Pay; OAuth at pay; merge idempotent. |
| CK3 | Snapshots immutable על order_items ב-beginCheckout. |
| CK4 | קופון: platform_settled; supplier_due=0; No Escrow. |
| CK5 | Webhook: `?s=` + verify; בלי HMAC גוף. |
| CK6 | Voucher mint רק אחרי paid. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| root duplicate | docs/CHECKOUT-FLOW קנוני. |
| Escrow held until redeem | No Escrow. |
| paid מ-return URL בלבד | זיוף redirect. |
| voucher לפני paid | סיכון הנפקה בלי כסף. |
| order_status draft/expired | enum 007 בלבד. |

---

## סכמת DB

```text
carts, orders, order_items (snapshots)
payments, payment_webhook_events
vouchers, wallet_*
```

Enums: `007_orders_schema.sql`. אין DDL חדש.

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | CHECKOUT_ENABLED=false | block LP חדש; finalize חי ממשיך. |
| CE2 | stuck pending | reconcile cron. |
| CE3 | mixed cart | total = sum on-site lines. |
| CE4 | wallet + Cardcom split | debit wallet first. |
| CE5 | duplicate webhook | idempotent finalize. |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | guest email pay v1 | product Q. |
| O2 | physical IL address validation | CHECKOUT-FLOW. |
| O3 | subscription checkout path | SUBSCRIPTIONS doc. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-07 | dump root |
| 2026-08-12 | batch-2: BINDING מצביע |
