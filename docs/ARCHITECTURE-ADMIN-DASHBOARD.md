# ארכיטקטורה: לוח בקרה אדמין

ניהול מוצרים עם **`platform_percent` דינמי פר מוצר**, בורר סוג מוצר, מתג WhatsApp פר מוצר, ניהול ספקים, ודוחות מכירות.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
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
docs/BUSINESS-MODEL.md
docs/CONTRADICTIONS.md
docs/RUNBOOK-PRODUCTION.md
```

כסף: אגורות integer ב-DB; UI ב-₪ עם שני עשרונים. **No Escrow.**

---

## 0. מודל כסף שהאדמין אוכף

| כלל | פירוט |
|---|---|
| אין עמלה קבועה | אין 5%/10% כברירת מחדל |
| `platform_percent` | דינמי **פר מוצר**, בלי default, admin only, מצולם ל-`order_items` |
| `supplier_split_percent` | משלים ל-100 |
| קופון | `coupon_price` באתר; 100% לפלטפורמה; יתרה בעסק |
| פיזי | חיוב מלא + פיצול לפי snapshot |
| מנוי | ראה RECURRING / SUBSCRIPTIONS; % snapshot פר מחזור |

---

## 1. ניהול מוצרים

### 1.1 מסכים

| נתיב | תפקיד |
|---|---|
| `/admin/products` | רשימה: סוג, `platform_percent`, מחיר קופון, יתרה, WhatsApp |
| `/admin/products/new` | יצירה |
| `/admin/products/[id]/edit` | עורך מלא |

### 1.2 בורר סוג מוצר (product-type selector)

| ערך | UI בעברית | שדות חובה נוספים |
|---|---|---|
| `coupon` | קופון | `coupon_price`, face/מחירון, expiry, quota, `platform_percent` (ביקורת) |
| `physical` | פיזי | מחיר מלא, מלאי/variant, `platform_percent` + split=100 |
| `subscription` | מנוי | `recurring_amount_agorot`, interval monthly; לא soft-open |
| `service` (אם קיים) | שירות | לפי מדיניות קטלוג |

שינוי סוג אחרי שיש הזמנות: אסור בלי ארכיון+מוצר חדש (או guard מפורש).

### 1.3 שדות כסף (admin only)

| UI בעברית | עמודה | כללים |
|---|---|---|
| מחיר מחירון | `price_ils` / agorot | > 0 |
| מחיר קופון באתר | `coupon_price_*` | > 0 ו-≤ מחירון (קופון) |
| יתרה אצל הספק (תצוגה) | מחושב | face - coupon |
| עמלת פלטפורמה % | `platform_percent` | 0..100, חובה לפני publish |
| חלק ספק % | `supplier_split_percent` | משלים ל-100 |
| ספק | `supplier_id` | חובה ל-publish |

Preview:

```text
הלקוח משלם באתר: ₪X
יתרה לתשלום בבית העסק: ₪Y
הפלטפורמה שומרת מתשלום האתר: 100% (קופון) / % מצולם (פיזי)
```

שינוי כסף אחרי publish → `audit_log`; לא משנה הזמנות ישנות.

### 1.4 מתג WhatsApp פר מוצר

| שדה | התנהגות |
|---|---|
| `whatsapp_enabled` (bool) | מציג CTA "וואטסאפ" ב-PDP כש-true |
| מספר | יורש מ-`suppliers.whatsapp_phone` אלא אם override פר מוצר |
| כבוי | אין כפתור; לא שובר checkout |
| שיווק יזום | לא דרך המתג הזה; רק deep link לשיחה עם הספק/תמיכה לפי מדיניות |

אין שליחת הודעות המוניות ממתג המוצר. תשתית עתידית:
`docs/WHATSAPP-BUSINESS-SETUP.md`
,
`docs/ARCHITECTURE-NOTIFICATIONS.md`.

### 1.5 הרשאות

| שדות | content_uploader | admin |
|---|---|---|
| תוכן / תמונות / SEO | כן (טיוטה) | כן |
| סוג מוצר / % / מחיר / WhatsApp toggle | לא | כן |
| publish | submit | כן |

---

## 2. ניהול ספקים

| פעולה | תוצאה |
|---|---|
| אישור בקשה | `suppliers` + owner membership |
| דחייה | סיבה חובה |
| השעיה | חוסם redeem + unpublish מוצרים |
| אימות בנק | לפני payout פיזי |
| עיר / lat/lng | חובה ל-geo sort איכותי |
| WhatsApp / טלפון | לתצוגת יצירת קשר |
| סניפים / עובדים / PIN | ONBOARDING + MOBILE scan |

מסך ספק: מוצרים, % נוכחיים (קריאה), סטטוס, סריקות, יתרת payout פיזי (לא Escrow).

---

## 3. דוחות מכירות

| מדד | הגדרה |
|---|---|
| GMV אתר | סכום paid on-site (agorot) |
| Platform take (קופון) | 100% מ-on-site |
| Platform take (פיזי) | לפי snapshot |
| מימושים | vouchers → redeemed |
| לפי ספק / מוצר / סוג | כולל % מצולם |

אסור: חישוב מ-`products.platform_percent` החי; מדד "Escrow held".

---

## 4. Acceptance

- [ ] בורר סוג מוצר משנה שדות חובה  
- [ ] `platform_percent` חובה ל-publish; בלי default  
- [ ] מתג WhatsApp פר מוצר מתועד  
- [ ] ניהול ספקים: אישור/השעיה/בנק/geo  
- [ ] דוחות על snapshots  

---

## 5. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-03 | מוצרים/ספקים/דוחות + platform_percent |
| 2026-08-12 | product-type selector + WhatsApp toggle + יישור No Escrow/agorot |
