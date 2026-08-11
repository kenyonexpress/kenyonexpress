# ארכיטקטורה: לוח בקרה אדמין

ניהול מוצרים עם בורר **סוג מוצר**, **`platform_percent` חובה** (דינמי פר מוצר, בלי default), ומתג **WhatsApp** פר מוצר. בנוסף: ספקים ודוחות מכירות.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #25/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-PRICING-RULES.md
docs/ADMIN-PRODUCT-EDITOR-SPEC.md
docs/ARCHITECTURE-SUPPLIER-ONBOARDING.md
docs/ARCHITECTURE-SUPPLIER-PORTAL.md
docs/ARCHITECTURE-PAYOUT-MECHANISM.md
docs/PAYOUT-ARCHITECTURE.md
docs/WHATSAPP-BUSINESS-SETUP.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/BUSINESS-MODEL.md
docs/CONTRADICTIONS.md
docs/RUNBOOK-PRODUCTION.md
```

כסף: אגורות integer ב-DB; UI ב-₪. מודל: **No Escrow**.

---

## 0. מודל כסף שהאדמין אוכף

| כלל | פירוט |
|---|---|
| אין עמלה קבועה | אין 5%/10% כברירת מחדל במערכת |
| `platform_percent` | דינמי **פר מוצר**, בלי default DB, admin only, snapshot ל-`order_items` |
| `supplier_split_percent` | משלים ל-100 (פיזי) |
| קופון | `coupon_price` באתר; 100% לפלטפורמה; יתרה בעסק |
| פיזי | חיוב מלא + פיצול לפי snapshot |
| מנוי | לפי SUBSCRIPTIONS; % snapshot פר מחזור |

---

## 1. הכרעות

| # | הכרעה |
|---|---|
| AD1 | Publish אסור בלי `platform_percent` מלא (וחובה סוג מוצר תקין). |
| AD2 | בורר סוג מוצר קובע שדות חובה ומסתיר שדות לא רלוונטיים. |
| AD3 | מתג WhatsApp הוא פר מוצר (`whatsapp_enabled`); לא שידור המוני. |
| AD4 | content_uploader לא נוגע בכסף / סוג / WhatsApp toggle / publish סופי. |
| AD5 | שינוי כסף אחרי publish → `audit_log`; לא משנה הזמנות ישנות. |
| AD6 | דוחות על snapshots; אסור לחשב GMV מ-`products.platform_percent` החי. |
| AD7 | אין מדד או עמודה פעילה של כסף מוחזק לספק על קופון. |

---

## 2. ניהול מוצרים

### 2.1 מסכים

| נתיב | תפקיד |
|---|---|
| `/admin/products` | רשימה: סוג, `platform_percent`, מחיר קופון, יתרה, WhatsApp |
| `/admin/products/new` | יצירה |
| `/admin/products/[id]/edit` | עורך מלא |

### 2.2 בורר סוג מוצר (product-type selector)

| ערך | UI בעברית | שדות חובה נוספים |
|---|---|---|
| `coupon` | קופון | `coupon_price`, face/מחירון, expiry, quota, `platform_percent` (ביקורת/עקביות) |
| `physical` | פיזי | מחיר מלא, מלאי/variant, `platform_percent` + split=100 |
| `subscription` | מנוי | `recurring_amount_agorot`, interval; לא soft-open בלי ADR |
| `service` (אם קיים) | שירות | לפי מדיניות קטלוג |

שינוי סוג אחרי שיש הזמנות: אסור בלי ארכיון + מוצר חדש (או guard מפורש).

### 2.3 `platform_percent` חובה

| UI בעברית | עמודה | כללים |
|---|---|---|
| עמלת פלטפורמה % | `platform_percent` | > 0 ו-< 100 (או טווח מוסכם); **חובה לפני publish**; אין default |
| חלק ספק % | `supplier_split_percent` | משלים ל-100 |
| מחיר מחירון | `price_*` / agorot | > 0 |
| מחיר קופון באתר | `coupon_price_*` | > 0 ו-≤ מחירון (קופון) |
| יתרה אצל הספק (תצוגה) | מחושב | face − coupon |
| ספק | `supplier_id` | חובה ל-publish |

Publish gate (`assertPublishable` / מקביל): נכשל אם חסר אחוז, ספק, או זהות ספק ל-PDP.

Preview:

```text
הלקוח משלם באתר: ₪X
יתרה לתשלום בבית העסק: ₪Y
הפלטפורמה שומרת מתשלום האתר: 100% (קופון) / % מצולם (פיזי)
```

אחוז חדש נרשם גם בהסכם פר מוצר (ONBOARDING §6) כשיש משא ומתן.

### 2.4 מתג WhatsApp פר מוצר

| שדה | התנהגות |
|---|---|
| `whatsapp_enabled` (bool) | מציג CTA "וואטסאפ" ב-PDP כש-true |
| מספר | יורש מ-`suppliers.whatsapp_phone` אלא אם override פר מוצר |
| כבוי | אין כפתור; לא שובר checkout |
| שיווק יזום | **לא** דרך המתג; רק deep link לשיחה |

אין שליחת הודעות המוניות ממתג המוצר. תשתית עתידית: WHATSAPP-BUSINESS-SETUP + NOTIFICATIONS.

### 2.5 הרשאות

| שדות | content_uploader | admin |
|---|---|---|
| תוכן / תמונות / SEO | כן (טיוטה) | כן |
| סוג מוצר / % / מחיר / WhatsApp toggle | לא | כן |
| publish | submit בלבד | כן |

---

## 3. ניהול ספקים

| פעולה | תוצאה |
|---|---|
| אישור בקשה | `suppliers` + owner membership |
| דחייה | סיבה חובה |
| השעיה | חוסם redeem + unpublish מוצרים |
| אימות בנק | לפני payout פיזי |
| עיר / lat/lng | חובה ל-geo sort איכותי |
| WhatsApp / טלפון | לתצוגת יצירת קשר |
| סניפים / עובדים / PIN | ONBOARDING + MOBILE scan |

מסך ספק: מוצרים, % נוכחיים (קריאה), סטטוס, סריקות, יתרת payout **פיזי** (לא כסף מוחזק על קופון).

---

## 4. דוחות מכירות

| מדד | הגדרה |
|---|---|
| GMV אתר | סכום paid on-site (agorot) |
| Platform take (קופון) | 100% מ-on-site |
| Platform take (פיזי) | לפי snapshot |
| מימושים | vouchers → redeemed |
| לפי ספק / מוצר / סוג | כולל % מצולם |

אסור: חישוב מ-`products.platform_percent` החי; מדד "escrow held" / `escrow_held`.

---

## 5. Acceptance

- [ ] בורר סוג מוצר משנה שדות חובה  
- [ ] `platform_percent` חובה ל-publish; בלי default  
- [ ] מתג WhatsApp פר מוצר מתועד ומכובה כברירת מחדל בטוחה  
- [ ] ניהול ספקים: אישור / השעיה / בנק / geo  
- [ ] דוחות על snapshots בלבד  
- [ ] No Escrow בנוסח ובמדדים  

---

## 6. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-03 | מוצרים / ספקים / דוחות + platform_percent |
| 2026-08-12 | product-type + WhatsApp toggle + No Escrow |
| 2026-08-12 | batch #25: ריענון BINDING; % חובה + בורר סוג + WhatsApp |
