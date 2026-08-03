# ארכיטקטורה: התראות (Notifications)

התראות טרנזקציוניות למחזור חיי קופון: **Resend** + **Supabase Edge Functions**, מייל / וואטסאפ / SMS, ו-**Wallet push**.

Status: **BINDING** · עודכן: 2026-08-03  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-EMAIL-TEMPLATES.md
docs/ARCHITECTURE-CASHBACK-WALLET.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
docs/BUSINESS-MODEL.md
```

---

## 0. מחסנית מחייבת

| רכיב | בחירה | אסור |
|---|---|---|
| מייל | Resend HTTP API | SMTP מהדפדפן, Make/Zapier |
| Emit | Database Trigger / `fn_enqueue_notification` | קריאה סינכרונית מתוך תשלום |
| Drain | Edge Function `notifications-worker` | אוטומציה חיצונית בייצור |
| Twin | `POST /api/cron/notifications` + `CRON_SECRET` | worker בלי Bearer |
| Retry | outbox + QStash + DLQ | לולאה בלי תקרה |
| תבניות | עברית RTL (`lang=he`, `dir=rtl`) | אנגלית כברירת מחדל ללקוח |
| וואטסאפ | Meta Cloud API (utility templates) | הודעה חופשית בלי template |
| SMS | אגרגטור ישראלי, fallback | SMS שיווקי כערוץ ראשי |
| Wallet push | Apple / Google Wallet pass update | חתימת pass מהדפדפן |

סודות רק בשרת / Edge:

```
RESEND_API_KEY
EMAIL_FROM
CRON_SECRET
SUPABASE_SERVICE_ROLE_KEY
QSTASH_TOKEN
META_WA_TOKEN
META_WA_PHONE_NUMBER_ID
SMS_PROVIDER_API_KEY
APPLE_WALLET_*
GOOGLE_WALLET_*
```

---

## 1. הכרעות

| # | הכרעה |
|---|---|
| N1 | מסלול כסף לא מחכה לספק הודעות. |
| N2 | `dedupe_key` UNIQUE + Idempotency-Key ל-Resend. |
| N3 | מחזור קופון מלא: **הונפק / תזכורת תוקף / מומש / פג / הוחזר**. |
| N4 | ערוץ ברירת מחדל: מייל. וואטסאפ משני. SMS רק fallback. |
| N5 | כסף ב-payload באגורות; בתצוגה ₪ עם שני עשרונים. |
| N6 | No Escrow בנוסח: שולם באתר + יתרה בבית העסק. אין "נאמן"/"מוחזק". |
| N7 | QR לא כ-`data:` URI במייל; רק קוד + קישור ל-`/coupon/{id}`. |
| N8 | Wallet push לא מחליף מייל. |

---

## 2. Pipeline

```text
שינוי דומיין (paid / redeem / expiry / refund)
  → TRIGGER או fn_enqueue_notification
  → notification_outbox (dedupe_key, channel, status)
  → Edge notifications-worker (או cron twin)
  → Resend / Meta WA / SMS / wallet_push / push
  → sent | retry | dead+DLQ
```

---

## 3. מחזור חיי קופון (מטריצת ערוצים)

| מצב | kind | מייל | וואטסאפ | SMS | Wallet push |
|---|---|---|---|---|---|
| הונפק אחרי תשלום | `coupon_issued` | חובה | utility אם טלפון+template | fallback בלי מייל/WA | הנפקת/עדכון pass |
| תזכורת לפני פקיעה (48ש) | `coupon_expiry_48h` | חובה (ניתן לכיבוי) | utility | מותר קצר | עדכון תוקף על ה-pass |
| מומש בסריקה | `coupon_redeemed` | חובה | utility קצר | לא כברירת מחדל | void / redeemed |
| פג תוקף | `coupon_expired` | כן | אופציונלי | לא | void |
| הוחזר / בוטל לפני מימוש | `coupon_refunded` | חובה | utility אם פעיל | לא | void |

כלל: מייל `coupon_issued` הוא אישור הרכישה לקופון. לא לשלוח גם `order_paid` גנרי על אותה הזמנה.

### 3.1 תוכן חובה בכל הודעה ארוכה

1. שם מוצר בעברית  
2. קוד קופון (`dir=ltr`) או אזכור שהקוד בוטל  
3. שולם באתר / יתרה בבית העסק (או "בוטל, אין יתרה לגבייה")  
4. תוקף או סטטוס סופי  
5. CTA ל-`/coupon/{id}` או לאזור האישי  

### 3.2 `coupon_refunded` (הוחזר)

| שדה | ערך |
|---|---|
| Emit | אחרי ביטול/החזר מאושר כש-voucher עובר ל-`cancelled`/`refunded` |
| Dedupe | `coupon_refunded:{voucher_id}:customer:{channel}` |
| גוף | סכום שחזר (כרטיס/ארנק), דמי ביטול אם חלו, שהקופון אינו ניתן למימוש |

---

## 4. Resend + Edge

```http
POST https://api.resend.com/emails
Authorization: Bearer $RESEND_API_KEY
Idempotency-Key: <dedupe_key>
```

```http
POST /functions/v1/notifications-worker
Authorization: Bearer $CRON_SECRET
```

תבניות RTL: ראה

```
docs/ARCHITECTURE-EMAIL-TEMPLATES.md
```

---

## 5. Wallet push

| פלטפורמה | פעולה |
|---|---|
| Apple Wallet | PassKit push + הורדת `.pkpass` מעודכן |
| Google Wallet | עדכון object + push |

אירועים: issued / expiry_48h / redeemed / expired / refunded → עדכון או void.  
סודות חתימה רק בשרת.

---

## 6. SLA

| מדד | יעד |
|---|---|
| Enqueue אחרי paid/redeem/refund | באותה טרנזקציה או מיד אחרי |
| מייל ראשון | ≤ 60 שנ' p95 |
| Wallet push | ≤ 2 דק' |
| DLQ על `coupon_issued` / `coupon_refunded` | התראה מיידית |

---

## 7. Acceptance

- [ ] Resend + Edge + outbox, בלי Make/Zapier  
- [ ] חמשת מצבי המחזור כולל הוחזר  
- [ ] וואטסאפ/SMS לפי המטריצה  
- [ ] Wallet push על שינוי סטטוס  
- [ ] נוסח בלי Escrow  

---

## 8. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-03 | מחזור מלא הונפק/תזכורת/מומש/פג/הוחזר + Wallet push (עברית RTL) |
