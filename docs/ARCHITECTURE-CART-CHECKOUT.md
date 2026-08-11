# ארכיטקטורה: עגלה וקופה (Cart → Checkout)

אורח → מיזוג ב-login → validate → beginCheckout → Cardcom → finalize → voucher.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים (פירוט עמוק):

```
docs/ARCHITECTURE-CART-GUEST.md
docs/ARCHITECTURE-CART-ZUSTAND.md
docs/ARCHITECTURE-CHECKOUT-FLOW.md
docs/ARCHITECTURE-CARDCOM-WEBHOOKS.md
docs/ARCHITECTURE-MONEY.md
docs/ARCHITECTURE-COUPON-LIFECYCLE.md
docs/ARCHITECTURE-PRODUCT-TYPES.md
```

הערה: גרסאות ענק עם קוד מוטמע (2026-07-30) הוחלפו במפרט ארכיטקטוני. הקוד החי ב-`src/` הוא מקור היישום.

מודל כסף: **No Escrow**. אגורות integer. `platform_percent` בלי default. סטטוס מימוש קנוני: `redeemed` (לא `used` בכתיבה חדשה).

---

## 0. החלטה

| # | הכרעה |
|---|---|
| CC1 | אורח: גלישה+עגלה; תשלום דורש auth + `mergeGuestCart`. |
| CC2 | תמחור תמיד מהשרת ב-validate/beginCheckout; לא ממחירי persist. |
| CC3 | קופון: חיוב `coupon_price`; `supplier_due` פלטפורמה = 0. |
| CC4 | פיזי: חיוב מלא; residual לספק ב-payout. |
| CC5 | מקור אמת תשלום: GetLpResult / webhook מאומת; לא Return URL לבד. |
| CC6 | אחרי paid: mint vouchers idempotent; snapshots על `order_items` immutable. |
| CC7 | Cardcom רק משרת. |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| תשלום מלא כאורח ב-GA | קופון דורש זהות ל-QR. |
| Escrow עד סריקה | No Escrow. |
| סטטוס `used` בכתיבה חדשה | קנוני `redeemed`. |
| שמירת מחיר סופי ב-cookie/localStorage | quote≠charge. |

---

## 2. סכמת DB

`carts`, `orders`, `order_items`, `payments`, `payment_webhook_events`, `vouchers`, `idempotency_keys`. אין DDL במסמך זה.

---

## 3. זרימה

```text
addToCart (guest|user)
  → שלם → login אם צריך → mergeGuestCart
  → validateCart → beginCheckout (snapshots)
  → Low Profile → webhook/GetLpResult
  → finalize paid → issue vouchers
```

---

## 4. מקרי קצה

| קוד | תוצאה |
|---|---|
| `unauthenticated_pay` | חסימה; עגלה נשמרת |
| `null_platform_percent` | לא checkout |
| `amount_mismatch` | לא paid |
| `webhook_replay` | idempotent |
| `merge_cap` | qty≤99 |

---

## 5. פתוחות

| # | פתוח | שמרני |
|---|---|---|
| O1 | אורח+אימייל בלי login מלא | לא ב-GA |
| O2 | ערבוב מנוי בעגלה | אסור; מסלול נפרד |

עודכן: 2026-08-12.

---

## 6. Acceptance

- [ ] קישור ל-GUEST/CHECKOUT/WEBHOOKS/MONEY  
- [ ] No Escrow + redeemed  
- [ ] חמשת סעיפי התבנית  

---

## 7. Revision

| תאריך | שינוי |
|---|---|
| 2026-07-30 | מפרט ענק עם קוד |
| 2026-08-12 | קיצור BINDING על arch/docs-batch-2; בלי dump קוד |
