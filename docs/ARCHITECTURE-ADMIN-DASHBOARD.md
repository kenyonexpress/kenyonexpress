# ארכיטקטורה: לוח בקרה אדמין

ניהול מוצרים עם **`platform_percent` דינמי פר מוצר**, מחיר קופון, יתרה אצל הספק (בבית העסק), ניהול ספקים, ודוחות מכירות.

Status: **BINDING** · עודכן: 2026-08-03  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-PRICING-RULES.md
docs/ARCHITECTURE-SUPPLIER-ONBOARDING.md
docs/ARCHITECTURE-SUPPLIER-PORTAL.md
docs/ARCHITECTURE-PAYOUT-MECHANISM.md
docs/BUSINESS-MODEL.md
docs/RUNBOOK-PRODUCTION.md
```

כסף: אגורות integer ב-DB; UI ב-₪ עם שני עשרונים.

---

## 0. מודל כסף שהאדמין אוכף (No Escrow)

| כלל | פירוט |
|---|---|
| אין עמלה קבועה | אין 5%/10% כברירת מחדל בקוד או ב-DB |
| `platform_percent` | דינמי **פר מוצר**, בלי default, כתיבה לאדמין בלבד, מצולם ל-`order_items` |
| `supplier_split_percent` | משלים ל-100 עם הפלטפורמה |
| מחיר קופון באתר | `coupon_price_ils` מוחלט |
| יתרה אצל ספק | `price_ils - coupon_price_ils` נגבית **בבית העסק** מהלקוח; לא מועברת מהפלטפורמה |
| קופון | 100% מתשלום האתר נשאר בפלטפורמה; לספק 0 מ-payout על קופון |
| פיזי | פיצול on-site לפי `platform_percent` המצולם |

---

## 1. ניהול מוצרים

### 1.1 מסכים

| נתיב | תפקיד |
|---|---|
| `/admin/products` | רשימה + עמודת `platform_percent` + מחיר קופון + יתרה מחושבת |
| `/admin/products/new` | יצירה |
| `/admin/products/[id]/edit` | עורך מלא |

### 1.2 שדות כסף (admin only)

| UI בעברית | עמודה | כללים |
|---|---|---|
| מחיר מחירון (שווי דיל) | `price_ils` | > 0 |
| מחיר קופון באתר | `coupon_price_ils` | > 0 ו-≤ מחירון |
| יתרה אצל הספק (תצוגה) | מחושב | `price_ils - coupon_price_ils` |
| עמלת פלטפורמה % | `platform_percent` | 0..100, חובה לפני publish |
| חלק ספק % | `supplier_split_percent` | משלים ל-100 |
| ספק | `supplier_id` | חובה ל-publish |

Preview בעורך:

```text
הלקוח משלם באתר: ₪X
יתרה לתשלום בבית העסק: ₪Y
הפלטפורמה שומרת מתשלום האתר: 100% (קופון)
```

שינוי כסף אחרי publish → `audit_log`; לא משנה הזמנות ישנות.

### 1.3 הרשאות

| שדות | content_uploader | admin |
|---|---|---|
| תוכן / תמונות / SEO | כן (טיוטה) | כן |
| `platform_percent`, מחיר קופון, מחירון | לא | כן |
| publish | submit | כן |

---

## 2. ניהול ספקים

| פעולה | תוצאה |
|---|---|
| אישור בקשה | `suppliers` + owner membership |
| דחייה | סיבה חובה |
| השעיה | חוסם redeem + unpublish |
| אימות בנק | לפני payout פיזי |
| סניפים / עובדים | ראה ONBOARDING; האדמין רואה חברי `supplier_members` |

מסך ספק: מוצרים, אחוזי של היום (לקריאה), סטטוס, סריקות אחרונות.

---

## 3. דוחות מכירות

| מדד | הגדרה |
|---|---|
| GMV אתר | סכום ששולם באתר (paid) |
| Platform take (קופון) | 100% מ-on-site על שורות קופון |
| Platform take (פיזי) | `commission_agorot` לפי snapshot |
| מימושים | ספירת vouchers → redeemed |
| יתרה שנצברה בעסקים | סכום `balance_due` על redeemed / issued (תצוגה תפעולית) |
| לפי ספק / מוצר | כולל `platform_percent` **מצולם** |

אסור לחשב מחדש מ-`products.platform_percent` החי.  
אסור מדד "Escrow held".

ייצוא CSV: admin+ עם `canSeeMoney` + audit.

---

## 4. Acceptance

- [ ] עורך מציג מחיר קופון + יתרה אצל ספק + `platform_percent`  
- [ ] רשימת מוצרים עם % פר שורה  
- [ ] דוחות מכירות מבוססי snapshots  
- [ ] ספקים: אישור/השעיה/חברים  

---

## 5. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-03 | מוצרים/ספקים/דוחות עם יתרה אצל ספק + platform_percent פר מוצר |
