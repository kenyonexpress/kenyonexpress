# ARCHITECTURE: Customer Support

תמיכת לקוחות: תקלות הזמנה, קופון שלא נסרק, בקשות החזר, ערוצי קשר, תשובות מוכנות בעברית, הסלמה לספק.

Status: **BINDING** · Updated: 2026-08-03  
Scope: **docs only** · branch `arch/docs-queue`  
אין שינוי קוד. אין נגיעה ב-worktree הראשי.

Companions:

```
docs/ARCHITECTURE-REFUNDS-DISPUTES.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/LEGAL-CHECKLIST.md
docs/RUNBOOK-OPERATIONS.md
```

Stack יעד: `/admin/support`, Resend, טיקטים ב-Supabase, עברית RTL.

---

## 0. הכרעות מחייבות

| # | הכרעה |
|---|---|
| CS1 | פלטפורמה ≠ ספק. KE מחברת; הספק מספק את השירות/המוצר. |
| CS2 | מקרו מותרים: "שולם באתר", "יתרה בבית העסק". אסורים: נאמן חיצוני, הבטחת payout לספק, עמלה 5%/10% קבועה. |
| CS3 | קופון אחרי מימוש: אין הבטחת החזר מלא אוטומטי. |
| CS4 | כסף: אגורות ב-DB; נציג מדבר ב-₪. |
| CS5 | הסלמה לספק רק עם הקשר מינימלי (בלי PII מיותר). |
| CS6 | Transactional email דרך pipeline ההתראות; לא Zapier. |

---

## 1. Contact channels

| ערוץ | שימוש | SLA תגובה ראשונה (יעד) |
|---|---|---|
| טופס `/contact` / טיקט באתר | ברירת מחדל | 4 שעות עסקים |
| אימייל support@… (Resend) | אותו תור | 4 שעות עסקים |
| צ׳אט באתר (עתידי) | שאלות קצרות | 15 דק׳ בזמן פעילות |
| WhatsApp (עתידי) | אותו תור אחרי אישור | כמו אימייל |
| טלפון | רק אחרי הסלמה / fraud | לפי תורנות |

Urgent (תשלום נכשל אחרי חיוב, חשד הונאה, סריקה כפולה חשודה): **30 דקות**.

---

## 2. Ticket model

```text
support_tickets: id, user_id, order_id?, voucher_id?, category, status, priority, …
support_messages: ticket_id, author (user|agent|system), body_he, created_at
```

סטטוסים:

```text
new → open → pending_customer → pending_supplier → resolved → closed
```

RLS: לקוח רואה רק את שלו; אדמין/סוכן את הכל.

קטגוריות:

| category | דוגמאות |
|---|---|
| `order_issue` | לא התקבל אישור, סכום שגוי |
| `coupon_scan` | QR לא נסרק, already_used, סירוב בעסק |
| `refund_request` | ביטול לפני/אחרי מימוש |
| `account` | התחברות Google, ארנק |
| `other` | |

---

## 3. Support flows

### 3.1 Order issues

1. אמת `order_id` + `paid_at` + תשלום Cardcom
2. אם paid ואין מייל: שליחה מחדש מ-outbox / לינק ל-`/account/orders`
3. אם לא paid: הסבר להשלים checkout; לא להבטיח חיוב
4. סכום לא תואם: השווה PDP/cart/snapshot; פתח bug אם צריך

### 3.2 Coupon not scanning

| תסמין | בדיקה | תשובה |
|---|---|---|
| אורח רואה בקשה להתחבר | תקין | התחברות Google |
| `already_used` | scan log | הודיעו אם לא הלקוח סרק → fraud path |
| `expired` | expires_at | הסבר תוקף; refund רק לפי מדיניות |
| `wrong_supplier` | supplier_id | להפנות לעסק הנכון |
| עסק בלי רשת | תפעול ספק | הסלמה לספק; הלקוח לא מבצע redeem |
| חתימה לא תקינה | QR פגום/צילום | הצגת קוד ידני מהאזור האישי |

נציג **לא** משנה סטטוס voucher בלי הרשאת admin + מדיניות.

### 3.3 Refund requests

הפניה מלאה ל-

```
docs/ARCHITECTURE-REFUNDS-DISPUTES.md
```

תקציר לנציג:

- `issued` → מסלול ביטול אפשרי
- `redeemed` → אין auto; איסוף עובדות + הסלמה
- פיזי → מצב משלוח + ספק
- אחרי אישור: Cardcom או wallet fallback

---

## 4. Escalation to supplier

מתי:

- איכות שירות בבית העסק
- משלוח פיזי באיחור
- סירוב לכבד קופון תקף

איך:

1. סטטוס `pending_supplier`
2. הודעה לאימייל התפעולי של הספק (תבנית עברית) עם: order ref קצר, מוצר, זמן, **בלי** טלפון לקוח אם לא הכרחי
3. SLA ספק פנימי: 1–2 ימי עסקים
4. אם אין מענה: admin מחליט על זיכוי / השעיית ספק

---

## 5. Canned responses (עברית)

### 5.1 אישור הזמנה חסר

```text
שלום {{name}},
בדקנו את הזמנה {{order_ref}}. התשלום התקבל וההזמנה מופיעה בחשבון שלך תחת "ההזמנות שלי".
אם מדובר בקופון, ניתן להציג את ה-QR תחת "הקופונים שלי".
```

### 5.2 קופון: שולם + יתרה

```text
שלום {{name}},
עבור הקופון "{{product}}" שולמת באתר {{paid_ils}}. יתרה לתשלום בבית העסק: {{due_ils}}.
יש להציג את הקוד או את ה-QR בעסק לפני תום התוקף ({{expires_he}}).
```

### 5.3 Already used

```text
שלום {{name}},
לפי המערכת הקופון כבר מומש ב-{{when}} בבית העסק {{supplier}}.
אם לא אתם ביצעתם את המימוש, השיבו להודעה זו ונבדוק מיד.
```

### 5.4 בקשת החזר לפני מימוש

```text
שלום {{name}},
קיבלנו בקשה לביטול קופון שטרם מומש. נבדוק זכאות לפי מדיניות הביטול ונעדכן לאישור הזיכוי.
```

### 5.5 אחרי מימוש

```text
שלום {{name}},
קופון שמומש בבית העסק לא ניתן לזיכוי אוטומטי. נשמח לקבל פירוט על התקלה ונבדוק מול בית העסק במקרים מתאימים.
```

### 5.6 ארנק

```text
שלום {{name}},
יתרת הארנק שלך היא {{balance_ils}}. ניתן לממש אותה בקופה באתר בלבד. לא ניתן למשוך את הקרדיט לחשבון בנק.
```

---

## 6. Agent tooling limits

נציג / סוכן AI (אם קיים):

- מותר: קריאת הזמנה, פתיחת טיקט, בקשת refund review
- אסור: Cardcom charge/refund בלי admin, שינוי `platform_percent`, redeem ידני בלי מדיניות

---

## 7. Acceptance

- [ ] ערוצים + SLA מוגדרים
- [ ] זרימות order / scan / refund מתועדות
- [ ] מקרו בעברית מאושרים
- [ ] הסלמת ספק בלי PII עודף
- [ ] קישור למדיניות Refunds

---

## 8. Revision

| Date | Change |
|---|---|
| 2026-07-31 | rev D |
| 2026-08-03 | Refresh: flows, canned Hebrew, escalation; Escrow-aware wording |
