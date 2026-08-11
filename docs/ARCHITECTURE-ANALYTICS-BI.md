# ארכיטקטורה: Analytics BI

שאילתות BI ודשבורדים כספיים מ-snapshots ב-ledger, לא מאחוז חי במוצר ולא מאירועי משפך.

Status: **BINDING** · עודכן: 2026-08-12 · QA: PASS  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #40/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-ANALYTICS.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/ARCHITECTURE-PAYOUT-MECHANISM.md
docs/ARCHITECTURE-WALLET-LEDGER.md
docs/ARCHITECTURE-ADMIN-DASHBOARD.md
docs/CONTRADICTIONS.md
```

---

## 0. עיקרון אחד

**מספרי כסף מגיעים רק מטבלאות ledger:**  
`orders`, `order_items`, `payments`, vouchers / `voucher_redemptions`, `settlement_events`, wallet.

**לעולם לא** מ-`sum` על `analytics_events` / PostHog / GA4.

אירועי `purchase` / `redeem` הם עותק timeline בלבד; האמת = `order_id` / `voucher_id`.

מודל: **No Escrow**. אין held. אין יחס קופון קבוע 10/90. אין default 5% לעמלה.

---

## 1. מודל כסף ל-BI

| סוג | כלל BI |
|---|---|
| coupon | הכנסת פלטפורמה = `charged_on_site` / `coupon_price` שצולם. יתרת עסק = לא הכנסת פלטפורמה. |
| physical | fee = לפי `platform_percent` **בשורה** (`order_items`), לא מ-`products.platform_percent` החי. |
| redeem success | ספירה/גבייה רק כש-`outcome = 'success'` (אם הטבלה שומרת גם כשלונות). |
| כסף | אגורות integer; המרה ל-₪ רק בתצוגה. |

### 1.1 טבלת מימוש (שם חי)

הטבלה החיה למימושים היא **`voucher_redemptions`** (לא `coupon_redemptions` אם אינה קיימת).  
FK: `voucher_id`. סכום: `amount_collected_agorot`.  
שאילתות חייבות לסנן הצלחות בלבד, אחרת סופרים ניסיונות כושלים ככסף.

---

## 2. Snapshot מול percent חי

| שימוש | מקור |
|---|---|
| דוח הכנסות היסטורי | `order_items.platform_percent` (snapshot) |
| עריכת מוצר באדמין | `products.platform_percent` (חי; לעתיד בלבד) |
| payout / settlement | snapshots + `settlement_events` |
| "מה האחוז הממוצע עכשיו בקטלוג" | ממוצע על `products` (מדד קטלוג, לא GMV) |

אסור:

```text
revenue = face * 0.05
revenue = face * 0.10
revenue = gmv * products.platform_percent   (אחוז חי על הזמנות ישנות: אסור)
```

מותר:

```text
platform_revenue_physical = round(paid_on_site * order_items.platform_percent / 100)
platform_revenue_coupon   = paid_on_site
```

---

## 3. שאילתת ליבה (תבנית)

```sql
SELECT
  oi.product_id,
  oi.platform_percent AS platform_percent_snapshot,
  sum(oi.paid_on_site_agorot) AS gmv_agorot,
  sum(
    CASE WHEN oi.product_type = 'coupon'
      THEN oi.paid_on_site_agorot
      ELSE (oi.paid_on_site_agorot * oi.platform_percent / 100.0)::bigint
    END
  ) AS platform_revenue_agorot,
  count(DISTINCT oi.order_id) AS orders_count
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
WHERE o.status = 'paid'
  AND o.paid_at >= $from AND o.paid_at < $to
GROUP BY 1, 2
ORDER BY platform_revenue_agorot DESC;
```

שמות עמודות סופיים לפי הסכמה אחרי agorot cutover; העיקרון (snapshot + No Escrow) לא משתנה.

---

## 4. דשבורדים

| קהל | תוכן | מקור |
|---|---|---|
| אדמין הכנסות | GMV, platform revenue, refunds, לפי מוצר/ספק/קטגוריה | ledger |
| אדמין משפך | ATC, checkout start, pay conversion | analytics_events |
| ספק | מכירות/מימושים/פאאוט שלו בלבד | ledger scoped |
| Fraud | failed scans, velocity | redemptions + security |

אין לערבב שכבות באותו וידג'ט כסף.

---

## 5. פרטיות

- אין PII באירועים.  
- דוחות כסף עם RLS / role אדמין.  
- ייצוא CSV: אגורות + עמודת ₪ לתצוגה; גישה מבוקרת.

---

## 6. Acceptance

- [ ] כסף רק מ-ledger  
- [ ] percent מ-snapshot בשורה, לא ממוצר חי  
- [ ] קופון: No Escrow בחישוב הכנסה  
- [ ] redeem: רק outcome success  
- [ ] אין נוסחת 5%/10% קבועה כ-GMV  
- [ ] משפך נפרד מדוחות כסף  

---

## 7. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | QA: הסרת 10/90 שגוי מגוף המסמך |
| 2026-08-07 | voucher_redemptions + amount_collected_agorot |
| 2026-08-12 | batch-2 #40: BINDING עברית; BI מ-snapshots בלבד |
| 2026-08-12 | batch-2 #40 pass-2: BINDING על arch/docs-batch-2 (המשך תור) |
