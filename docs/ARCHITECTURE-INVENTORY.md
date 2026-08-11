# ארכיטקטורה: מלאי ומכסות

מכסות קופון פר דיל, מלאי פיזי בסיסי, reserve ב-pending, ו-reconcile בלי over-sell.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד.

מודל כסף: **No Escrow**. מכסה/מלאי מגבילים מכירה והנפקה; לא מחזיקים כסף לספק.

מסמכים קשורים:

```
docs/ARCHITECTURE-CHECKOUT-FLOW.md
docs/ARCHITECTURE-COUPON-LIFECYCLE.md
docs/ARCHITECTURE-GIFT-COUPONS.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/CONTRADICTIONS.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| I1 | מכסת קופון נאכפת אטומית לפני/בתוך finalize (לא רק ב-UI). |
| I2 | כשל מכסה → אין Low Profile חדש / אין `paid` על יחידות עודפות. |
| I3 | מלאי פיזי: `stock_quantity` יורד ב-finalize; replay לא מוריד פעמיים. |
| I4 | קופון מתנה חולק מכסה עם מכירה רגילה (אותו product). |
| I5 | Over-sell אסור. Reconcile מתקן תצוגה; לא יוצר vouchers מעל המכסה. |
| I6 | הזמנת `pending` יכולה לשריין עד `expires_at`; אחרי cancel/expiry השריון משתחרר. |
| I7 | מכסה = מספר יחידות דיל, לא סכום כסף. |

### מושגים

| מושג | משמעות |
|---|---|
| `quota` | תקרת יחידות לדיל קופון (admin) |
| `issued` | שוברים שהונפקו אחרי `paid` |
| `reserved_pending` | יחידות ב-`pending` שטרם שולמו |
| `available` | `quota - issued - reserved_pending` |
| `stock_quantity` | מלאי פיזי (nullable = לא נמדד) |

```text
available >= 0 תמיד אחרי כל טרנזקציה אטומית
```

### קופון: שריון → תשלום → הנפקה

```text
beginCheckout
  → בדוק available >= sum(qty)
  → אם לא: cart_invalid / INSUFFICIENT_QUOTA; אין LP
  → order pending + (אופציונלי) reserve
  → Low Profile

pending expiry / cancel → שחרור reserve

finalize paid
  → CAS: issued + qty <= quota
  → mint vouchers × qty (idempotent לפי order_item)
  → item_status=issued, settlement_status=platform_settled
```

### פיזי

```text
validateCart: stock_quantity >= qty (אם לא null)
finalize: UPDATE stock_quantity = max(0, stock - qty)
  מוגן ב-split_executions UNIQUE(order_item_id)
```

החזרת מלאי ב-refund: לפי REFUNDS; ברירת מחדל אחרי refund מאושר.

### תצוגה בקטלוג

| מצב | UI |
|---|---|
| `available == 0` | אזל / לא ניתן לרכישה |
| `available` נמוך | באדג' אופציונלי |
| מלאי פיזי 0 | אותו שער |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| מכסה רק ב-UI | I1: אכיפה בשרת. |
| mint מעל quota ב-reconcile | I5: אין vouchers יש מאין. |
| מכסה נפרדת ל-gift | I4: quota משותפת. |
| stock יורד ב-beginCheckout | I3: finalize + idempotency. |
| held כסף על reserve | No Escrow: reserve = יחידות, לא כסף. |
| quota כסכום ₪ | I7: יחידות בלבד. |

---

## סכמת DB

```text
products (
  stock_quantity int CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
  coupon_quota int,              -- pending: תקרת יחידות קופון
  ...
)

product_variants (
  stock_quantity int,
  ...
)

inventory_reservations (
  id uuid PK,
  order_id uuid FK,
  order_item_id uuid FK,
  product_id uuid,
  quantity int,
  expires_at timestamptz,
  released_at timestamptz
)

-- issued count: COUNT(vouchers) WHERE product_id AND status='issued'
```

| שדה | מקור אמת |
|---|---|
| `products.stock_quantity` | פיזי; קיים (001/005) |
| `coupon_quota` | pending migration |
| `inventory_reservations` | pending migration |

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | שני checkouts על יחידה אחרונה | אחד מצליח; השני נכשל במכסה |
| CE2 | webhook replay | לא מנפיק מעל qty; idempotent |
| CE3 | paid בלי mint מלא | reconcile עד min(qty, available); אלרט |
| CE4 | pending expiry | שחרור reserve; order cancelled |
| CE5 | הקטנת quota מתחת issued+reserved | נדחה או clamp + אזהרה |
| CE6 | variant stock vs product stock | variant קודם; fallback product |
| CE7 | refund פיזי | החזרת qty לפי מדיניות |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | `coupon_quota` column migration | pending |
| O2 | `inventory_reservations` table | pending |
| O3 | admin UI quota | ADMIN-PRODUCT-FIELDS |
| O4 | supplier read-only quota view | SUPPLIER-PORTAL |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | QA-PASS |
| 2026-08-12 | batch-2: reserve, races, admin, פיזי |
| 2026-08-12 | batch-2: תבנית חובה (5 סעיפים) |
