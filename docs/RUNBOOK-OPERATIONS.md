# RUNBOOK: Operations

תפעול יומי: הוספת מוצר, הגדרת `platform_percent`, צפייה בהזמנות, טיפול בהחזרים, קריאת Sentry.

Status: **BINDING** · Updated: 2026-08-02  
Scope: docs only.  
Companions:

```
docs/OPERATIONS-RUNBOOK.md
docs/ARCHITECTURE-BACKUP-DR.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/ARCHITECTURE-OBSERVABILITY.md
docs/DDL-FIXES.md
```

הבחנה: תקלת כסף שלא נסגרת כאן תוך ~30 דקות מסלימה ל-incident / DR. כאן הקומה הראשונה.

ממשקים:

- **Chrome:** `/admin/**`, Cardcom dashboard, Sentry, Resend
- **Cursor / Terminal:** רק כשכתוב במפורש (לא לעדכן כסף ב-SQL)
- **Supabase:** SQL Editor לאימות קריאה בלבד באירוע

---

## 0. שגרת בוקר (10 דקות)

```text
1. /admin Overview: הזמנות לילה, כשלי webhook, DLQ התראות
2. /admin/orders פילטר חריגים: חייב להיות ריק (או בטיפול)
3. Sentry: אין spike חדש ב-checkout / finalize / redeem
4. Resend: bounce חריג
5. Ntfy / Better Stack: אין התראת uptime פתוחה
```

כל ממצא: נסגר לפי הסעיפים למטה או נפתח אירוע. לא "נבדוק מחר".

---

## 1. הוספת מוצר

### 1.1 קופון

Chrome: `/admin/products` → מוצר חדש.

1. `type = coupon`
2. שם, תיאור, תמונה, קטגוריה, ספק
3. כסף: מחיר מלא (face) + `coupon_price` (שולם באתר) + תוקף ימים
4. `platform_percent` ו-`supplier_split_percent` (סכום 100; אין ברירת מחדל מומצאת)
5. שמירה כ-draft → תצוגה מקדימה ב-PDP
6. אימות: מחיר קופון, יתרה בבית העסק, בלי הבטחות שהעסק לא אישר
7. Publish (השערים חוסמים שדות חסרים; לא לעקוף)

### 1.2 פיזי

אותו מסלול עם מלאי/משלוח. בלי `platform_percent` אין publish.

זמן צפוי: ~10 דקות.

---

## 2. הגדרת `platform_percent`

| כלל | פירוט |
|---|---|
| מי | אדמין בלבד בדף המוצר |
| איפה | שדה מפורש; לא נגזר אוטומטית מ-5%/10% |
| זוג | עם `supplier_split_percent` → סכום 100 (constraint) |
| מתי ננעל | בזמן רכישה מצולם ל-`order_items`; שינוי במוצר לא משנה הזמנות עבר |
| ספק | יכול לראות בשקיפות; לא יכול לערוך |

בדיקה אחרי שמירה:

1. PDP / חישוב עגלה משתמש בערך החדש למוצרים שעדיין לא נרכשו.
2. הזמנה ישנה ב-`/admin/orders/[id]` עדיין מציגה את ה-snapshot הישן.

---

## 3. צפייה בהזמנות

Chrome: `/admin/orders`

| מטרה | פעולה |
|---|---|
| חיפוש לקוח | אימייל / מזהה הזמנה / טלפון אם קיים |
| מצב תשלום | `pending` / `paid` / `failed` / `refunded` |
| קופון | האם נוצרו `vouchers`; לינק לפרטי שובר |
| כסף | שולם באתר, ארנק, `platform_percent` snapshot, commission, held/payout |
| ציר אירועים | `payment_events` / webhook / verify |

כלל זהב: לא מעדכנים `paid` ידנית ב-DB. רק מסלול verify/finalize מול Cardcom.

לקוח רואה את שלו ב-

```
/account/orders
```

---

## 4. טיפול בהחזרים (refunds)

### 4.1 מתי מותר

לפי מדיניות ביטול + חוק הגנת הצרכן + מצב הקופון (issued מול redeemed). פרטים ב-LEGAL-CHECKLIST. כאן המסלול התפעולי.

### 4.2 איך (חובה דרך האדמין)

```text
1. /admin/orders/[id] → פעולת Refund (לא Cardcom dashboard לבד)
2. requireRecentAuth אם מוגדר
3. המערכת: Cardcom credit + ledger reverse + wallet אם רלוונטי + ביטול voucher אם עוד issued
4. הודעה ללקוח (transactional)
5. רישום ב-audit + הופעה ב-reconciliation הבא
```

| מצב voucher | התנהגות טיפוסית |
|---|---|
| `issued` | מבטל מימוש עתידי; מחזיר תשלום אתר לפי מדיניות |
| `redeemed` | לא refund אוטומטי מלא; בירור מול ספק + אולי חלקי |
| physical | לפי משלוח/החזרה |

אסור: UPDATE SQL על יתרות; כפל refund עם אותו מפתח.

---

## 5. קריאת Sentry

### 5.1 מה מסתכלים כל בוקר

| תור | משמעות |
|---|---|
| New issues / regressions | במיוחד `finalize`, webhook, redeem, checkout |
| Spike בנפח | כשל ספק תשלום או deploy שבור |
| Unhandled on Edge/Cron | notifications / expiry |

### 5.2 איך קוראים issue

1. Title + culprits (קובץ/פונקציה).
2. Breadcrumbs: `order_id` אם קיים (בלי PAN).
3. Tags: environment, release (deploy).
4. האם אחרי deploy אחרון? → שקילות rollback ב-Vercel.
5. האם רק משתמש אחד? → תמיכה נקודתית. רבים? → kill switch checkout אם כסף.

### 5.3 מה לא אמור להופיע ב-Sentry

- `cardcom_token`, PAN, CVV, `RESEND_API_KEY`, service role
- גוף webhook מלא עם נתוני כרטיס

אם מופיע סוד: רוטציה מיד + ניקוי לפי נוהל אבטחה.

### 5.4 מיפוי מהיר סימפטום → פעולה

| סימפטום ב-Sentry | פעולה ראשונה |
|---|---|
| `22P02` settlement_status | ראה DDL-FIXES (`platform_settled`) |
| Webhook signature failed | בדיקת סוד + URL + Vercel protection |
| Redeem invalid_hmac spike | FRAUD + בדיקת `VOUCHER_QR_SECRET` |
| Resend 429 | backoff/QStash; לא לפתוח checkout |
| Rate limit noise | צפוי בעומס; בודקים אם חוסם לקוחות לגיטימיים |

---

## 6. תקלות נפוצות (תמצית)

### 6.1 "שילמתי ולא קיבלתי"

1. חיפוש הזמנה באדמין.
2. `paid` + voucher: בעיית תצוגה/מייל → שליחה מחדש; הקופון ב-`/account/coupons`.
3. `pending` בלי webhook: המתנה קצרה → verify יזום (`GetLpResult`), לא SQL.
4. `failed` עם חיוב בכרטיס: anomaly → reconciliation + SEV.

### 6.2 קופון לא נסרק

לפי לוג: `already_used` / `expired` / `wrong_supplier` / `invalid_hmac`.  
פתרון זמני בעסק רק עם אישור אדמין + audit (ראה OPERATIONS-RUNBOOK המורחב).

---

## 7. Out of scope

- Deploy מלא / cutover WP
- תרחילי DR מלאים (BACKUP-DR)
- כתיבת מיגרציות (DDL-FIXES לאישור נפרד)

---

## 8. Revision

| Date | Change |
|---|---|
| 2026-08-02 | Runbook יומי: מוצר, platform_percent, הזמנות, refunds, Sentry |
