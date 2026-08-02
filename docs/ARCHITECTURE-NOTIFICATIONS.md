# ARCHITECTURE: Notifications

ארכיטקטורת התראות טרנזקציוניות של KenyonExpress.

Status: **BINDING** · Updated: 2026-08-02  
Scope: docs only. Marketing journeys live in `ARCHITECTURE-NOTIFICATIONS-MARKETING.md`.

Stack מחייב (סופי):

| רכיב | בחירה | אסור |
|---|---|---|
| Email | **Resend** HTTP API | SMTP מהדפדפן, SendGrid כברירת מחדל, Make/Zapier |
| Emit | **Supabase Database Trigger** / `SECURITY DEFINER` enqueue באותה טרנזקציה כמו עובדת הכסף | קריאה סינכרונית ל-Resend מתוך `finalizeOrder` כמסלול ייצור |
| Drain | **Supabase Edge Function** `notifications-worker` | אוטומציה חיצונית כמסלול ייצור |
| Retry | **Upstash QStash** (backoff + failure callback) + outbox `next_attempt_at` | לולאת retry בלי תקרה / בלי DLQ |
| Templates | HTML עברית **RTL** (`lang="he"`, `dir="rtl"`) | תבניות LTR / טקסט באנגלית כברירת מחדל ללקוח |

סודות רק ב-Edge / Vercel server (לעולם לא בדפדפן):

```
RESEND_API_KEY
EMAIL_FROM                 # או RESEND_FROM
CRON_SECRET
SUPABASE_SERVICE_ROLE_KEY
QSTASH_TOKEN
QSTASH_CURRENT_SIGNING_KEY
QSTASH_NEXT_SIGNING_KEY
NTFY_*                     # אופציונלי, אדמין/DLQ בלבד
```

Companion: מיגרציית outbox בפועל `095_notification_outbox.sql` (על `phase5/homepage`), והקוד ב-

```
src/lib/email/resend.ts
src/lib/email/voucher-email.ts
src/lib/email/notifications.ts
src/app/api/cron/notifications/route.ts
```

---

## 0. הכרעות מחייבות

| # | הכרעה |
|---|---|
| N1 | מסלול כסף **לא מחכה** לספק הודעות. Trigger / enqueue בלבד. כשל מייל לא מגלגל תשלום או redeem. |
| N2 | At-least-once enqueue; exactly-once אפקט ללקוח דרך `dedupe_key` + Resend `Idempotency-Key`. |
| N3 | תבניות RTL עברית. מותג: צהוב `#f5c518` / `#fed700`, דיו `#1a1a1a` / `#333e48`. |
| N4 | כסף ב-payload / DB: **אגורות (integer)**. בגוף המייל: ₪ עם שני עשרונים (`formatAgorot`). |
| N5 | קופון (מודל Escrow 2026-07-27): במייל ללקוח מופיעים **שולם באתר** (`coupon_price`) ו-**יתרה בבית העסק** (face − prepaid). אין להמציא אחוז משווי העסקה. אין לספר לספק על רכישת קופון סכום "payout מהפלטפורמה" לפני מימוש. |
| N6 | QR **לא** מוטמע כ-`data:` URI בגוף המייל. המייל נושא קוד קריא + קישור לדף שמציג QR. |
| N7 | אין Make / Zapier בייצור. |
| N8 | טבלת שוברים הקנונית: `vouchers` (שורות `coupon_codes` ישנות רק כהיסטוריה / תאימות). |

---

## 1. Pipeline

```text
Domain commit
  (finalizeOrder / redeem_voucher / expiry cron / physical paid)
        │
        ▼
AFTER TRIGGER  (tg_orders_notify_paid / tg_vouchers_notify_redeemed / …)
  או fn_enqueue_notification(...)  SECURITY DEFINER
        │
        ▼
notification_outbox / notifications_outbox
  (dedupe_key UNIQUE, status pending|sent|dead, attempts, next_attempt_at)
        │
        ├─ wake: pg_net / cron / publish QStash  (לא חוסם את ה-commit)
        ▼
Edge Function notifications-worker
  (או twin: POST /api/cron/notifications עם Bearer CRON_SECRET)
        │
        ├─ claim due rows
        ├─ render RTL Hebrew template
        ├─ POST Resend API (Idempotency-Key = dedupe_key)
        │
        ├─ 2xx → status=sent, provider_message_id
        ├─ 429/5xx/network → QStash retry + outbox backoff
        └─ attempts exhausted → status=dead + DLQ / Ntfy admin
```

מצב נוכחי מול יעד:

| שכבה | היום (`095` + cron) | יעד מחייב |
|---|---|---|
| Emit | Triggers על `orders.paid_at` ו-`vouchers.status` | אותו דבר (לא לשלוח inline מ-finalize כמסלול ראשי) |
| Drain | `GET /api/cron/notifications` | Edge Function `notifications-worker` + אותו drain code |
| Retry | backoff ב-outbox בלבד (`2 * 4^(attempts-1)` דק׳, מקס 5) | outbox + **QStash** retries עם failure callback ל-DLQ |
| Coupon QR mail | `sendVoucherEmail` עדיין נקרא מ-finalize (מעבר) | רק outbox + worker; finalize לא קורא Resend |

`pg_net` אינו מותקן בפרויקט (`installed_version` null). לכן trigger **לא** קורא HTTP ישירות. ה-wake ל-worker הוא cron / QStash publish ממסלול שרת אחרי commit, לא HTTP מתוך Postgres.

---

## 2. Resend API

### 2.1 Endpoint

```
POST https://api.resend.com/emails
Authorization: Bearer $RESEND_API_KEY
Content-Type: application/json
Idempotency-Key: <dedupe_key או outbox.id>
```

Body:

```json
{
  "from": "KenyonExpress <noreply@kenyonexpress.co.il>",
  "to": ["customer@example.com"],
  "subject": "הקופון שלך מוכן",
  "html": "<div dir=\"rtl\" …>",
  "text": "…",
  "reply_to": "support@kenyonexpress.co.il"
}
```

From מאומת בדומיין Resend בלבד. ברירת מחדל בקוד:

```
EMAIL_FROM ?? 'KenyonExpress <noreply@kenyonexpress.co.il>'
```

### 2.2 התנהגות חובה

1. **לעולם לא לזרוק** מתוך מסלול כסף. `sendEmail` מחזיר `{ ok, id | reason }` ומדווח ללוג.
2. **בלי מפתח**: `{ skipped: true, reason: 'no_api_key' }`. לא שורפים `attempts` על סביבה בלי מפתח (local/CI).
3. **Idempotency-Key** יציב לכל הודעה לוגית (`order_paid:{order_id}`, `voucher-email:{order_id}`, `supplier_sale:{order_id}:{supplier_id}`, `voucher_redeemed:{voucher_id}`). Replay של finalize / webhook / worker לא יוצר מייל כפול.
4. מיפוי שגיאות:
   - 429 / 5xx / network → retryable (QStash + outbox backoff)
   - 4xx validation / כתובת לא חוקית → non-retryable → `dead` או suppression
5. Webhook Resend → `notification_delivery_events` (או `email_suppressions`): `delivered` / `bounced` / `complained`. Bounce/complaint מדכאים כתובת לפני enqueue הבא.

### 2.3 Adapter יעד

```
src/lib/email/resend.ts                         # קיים
supabase/functions/notifications-worker/channels/resend.ts   # יעד Edge (אותו חוזה)
```

אין לייבא SDK של Resend מחוץ לאדapter הזה.

---

## 3. Edge Functions + Database Triggers

### 3.1 Triggers (emit)

Triggers רצים `SECURITY DEFINER`, בולעים שגיאות (`EXCEPTION WHEN OTHERS` + `RAISE WARNING`), ומחזירים `NEW`. מייל שלא נכנס לתור לא ישבור תשלום או סריקה בקופה.

| Trigger | טבלה | תנאי | `kind` / אירוע |
|---|---|---|---|
| `trg_orders_notify_paid` | `orders` | `paid_at` null → not null | `order_paid` (רק אם אין vouchers להזמנה; אחרת מייל הקופון הוא האישור) + `supplier_sale` לכל `supplier_id` |
| `trg_vouchers_notify_redeemed` | `vouchers` | `status` → `redeemed` | `voucher_redeemed` ללקוח |
| (יעד) expiry cron | `vouchers` | `issued` ו-`expires_at` בתוך 48ש | `coupon_expiry_48h` |

Enqueue יחיד:

```
fn_enqueue_notification(kind, email, dedupe_key, payload)
```

- מנרמל אימייל ל-lower/trim
- מכבד `email_suppressions` **בזמן enqueue** (לא כותבים שורה לכתובת מדוכאת)
- `ON CONFLICT (dedupe_key) DO NOTHING`

### 3.2 Edge Function worker (drain)

```
POST /functions/v1/notifications-worker
Authorization: Bearer $CRON_SECRET
```

Schedule: כל דקה (Supabase cron / QStash schedule / Vercel cron twin).

אלגוריתם:

1. אימות Bearer.
2. Claim עד 50 שורות due: `status = pending` ו-`next_attempt_at <= now()` (עדיף `FOR UPDATE SKIP LOCKED`; ב-095 כיום: select + update לפי id).
3. לכל שורה: `buildNotification(kind, payload)` → RTL HTML+text.
4. `sendEmail` עם `idempotencyKey = dedupe_key`.
5. הצלחה → `sent` + `sent_at`.
6. כשל retryable → `attempts++`, `next_attempt_at = now() + backoff`, ופרסום חוזר ל-QStash אם ה-wake עבר דרכו.
7. `attempts >= 5` → `dead` (לא נשלח שוב בלי requeue אדמין).
8. kind בלי תבנית → `dead` מיידי (אין טעם לשרוף חמישה ניסיונות).

Twin מותר ב-Next באותה סמנטיקה:

```
GET|POST /api/cron/notifications
Authorization: Bearer $CRON_SECRET
```

קוד drain אחד, שני hosts. לא שני חוזים.

### 3.3 Payload (עובדות בלבד)

ב-payload: ids, agorot, שמות מוצר/ספק שצולמו בזמן האירוע, תאריכים.  
אין PAN, אין `cardcom_token`, אין `VOUCHER_QR_SECRET`, אין service role.

---

## 4. QStash retry

QStash הוא שכבת **wake + retry** מעל ה-outbox, באותו חוזה כמו חיפוש (`src/lib/search/qstash.ts`): SDK-free, HMAC על `Upstash-Signature`, failure callback ל-DLQ.

### 4.1 למה גם outbox וגם QStash

| שכבה | תפקיד |
|---|---|
| Outbox ב-Postgres | מקור אמת: מה חייבים לשלוח, dedupe, audit, dead letters |
| QStash | הובלה: מעיר את ה-worker מהר אחרי enqueue, מרטרי על non-2xx, מעביר ל-DLQ אחרי תקרה |

Outbox בלי QStash עובד (cron כל דקה). QStash בלי outbox אסור: אין audit ואי אפשר להבטיח idempotency מול Resend אחרי crash.

### 4.2 Publish (אחרי enqueue)

```
POST https://qstash.upstash.io/v2/publish/{APP_URL}/api/cron/notifications
Authorization: Bearer $QSTASH_TOKEN
Content-Type: application/json
Upstash-Retries: 5
Upstash-Failure-Callback: {APP_URL}/api/cron/notifications-dlq
Upstash-Deduplication-Id: {dedupe_key}
```

Body מינימלי: `{ "outbox_id": "…", "dedupe_key": "…" }` או wake ריק ("drain now").  
כש-`QSTASH_TOKEN` חסר (local/CI): degrade ל-inline drain או להסתמך על cron בלבד (כמו search).

### 4.3 Retry schedule

| ניסיון | התנהגות |
|---|---|
| QStash delivery | עד 5 retries עם exponential backoff של Upstash על תשובת worker שאינה 2xx |
| Outbox backoff (נשמר ב-DB) | `2 * 4^(attempts-1)` דקות: 2, 8, 32, 128… עד `dead` אחרי 5 attempts |
| Failure callback | POST ל-DLQ route; השורה ב-outbox כבר `dead` או מסומנת לפי תשובת ה-worker |

Worker חייב להחזיר:

- `2xx` רק אחרי סימון `sent` / `dead` / `skipped` סופי לשורות שטופלו ב-batch
- `5xx` אם claim/DB נכשל (QStash ינסה שוב; idempotency ב-Resend מונע כפילות)

### 4.4 אימות חתימה

כל בקשה מ-QStash ל-worker / DLQ: אימות `Upstash-Signature` מול `QSTASH_CURRENT_SIGNING_KEY` ו-`QSTASH_NEXT_SIGNING_KEY` (timing-safe). בלי חתימה תקפה → 401.

---

## 5. תבניות מייל עברית RTL

### 5.1 כללי מעטפת

- `lang="he"` ו-`dir="rtl"` על השורש **וגם** על בלוקים פנימיים (Outlook מתעלם מ-wrapper בלבד).
- `text-align: right`, `direction: rtl`.
- פונט: `Arial, Helvetica, sans-serif` במייל (Heebo/Assistant רק אם מובטחים ב-web font ללקוח; לא חובה).
- קודים / מזהי הזמנה / סכומים LTR מבודדים: `dir="ltr"` או `<bdi>`.
- כל ערך משתנה עובר HTML-escape לפני substitution.
- חלק plaintext בעברית תמיד (multipart).
- Transactional: בלי דרישת opt-in של 30א; עדיין קישור העדפות / הסרת תזכורות בפוטר.

מעטפת מינימלית:

```html
<div dir="rtl" style="background:#f5f5f5;padding:24px 12px;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:560px;margin:0 auto">
    <div style="font-size:20px;font-weight:800;color:#1a1a1a;margin-bottom:16px">KenyonExpress</div>
    <!-- body -->
    <div style="font-size:12px;color:#6b7280;margin-top:18px;text-align:center">
      קיבלת את המייל הזה כי ביצעת רכישה ב-KenyonExpress.
    </div>
  </div>
</div>
```

### 5.2 kinds / subjects

| kind / template | נמען | Subject (דוגמה) |
|---|---|---|
| voucher / `customer.coupon_issued` | לקוח | `הקופון שלך מוכן: {product}` או `N קופונים מוכנים לך ב-KenyonExpress` |
| `order_paid` | לקוח | `ההזמנה שלך התקבלה · {ref}` |
| `supplier_sale` | ספק | `מכירה חדשה ב-KenyonExpress · הזמנה {ref}` |
| `voucher_redeemed` | לקוח | אישור מימוש + שם עסק |
| `coupon_expiry_48h` (יעד) | לקוח | `תזכורת: הקופון שלך פג תוך 48 שעות` |

Builders טהורים (בלי רשת):

```
src/lib/email/voucher-email.ts
src/lib/email/notifications.ts
```

### 5.3 תוכן כסף בקופון

סדר חובה בגוף:

1. שולם באתר: `coupon_price_agorot`
2. לתשלום בבית העסק: `remaining_due_agorot`
3. (משני) מחיר מלא: `face_value_agorot`
4. בתוקף עד: תאריך `he-IL`

אין לכתוב נוסח שמבטיח לספק שחרור מקדמה לפני מימוש, ואין להמציא אחוז עמלה קבוע.

---

## 6. Coupon QR delivery flow

### 6.1 עקרון

המייל **לא** מציג QR סריק. סיבות:

1. לקוחות מייל חוסמים `data:` URI ותמונות חיצוניות → אייקון שבור במקום קופון.
2. תמונת QR שמוטמעת נשמרת/מועברת בלי תוקף session; דף מאומת הוא נקודת האמת להצגה.
3. הקוד הקריא תמיד עובד בקופה גם בלי מסך.

### 6.2 זרימה מקצה לקצה

```text
1. Cardcom verify / finalizeOrder
     → order.paid_at set
     → issue vouchers (code + qr_payload / qr_token חתום HMAC או Ed25519)

2. Emit (אותה טרנזקציה או finalize-safe)
     → outbox kind שישמש למייל קופון
        או (מעבר) sendVoucherEmail עם Idempotency-Key voucher-email:{orderId}

3. Worker → Resend
     HTML/text:
       - קוד מפורמט (Crockford / groups)
       - שולם באתר / יתרה בעסק / תוקף
       - CTA: "הצגת הקופון ו-QR" → {site}/coupon/{voucher_id}
       - הערה: QR מוצג בעמוד הקופון, לא במייל

4. לקוח נכנס ל-/coupon/[id] (או /account/coupons)
     → השרת מרנדר QR מ-qr_payload / qr_token בזמן תצוגה
     → אין תלות ב-storage וב-qr_code_url ישן

5. בקופה
     → ספק סורק QR או מקליד קוד
     → redeem_voucher מאמת חתימה + סטטוס issued + ספק
     → trigger voucher_redeemed → מייל אישור ללקוח
```

### 6.3 חוזה קישור מהמייל

| שדה | ערך |
|---|---|
| URL | `{NEXT_PUBLIC_APP_URL}/coupon/{voucher_id}` |
| Auth | דף קופון מציג למשתמש הבעלים; אין לשים את הסוד ב-query |
| QR secret | נשאר בשרת (`VOUCHER_QR_SECRET`); לא ב-payload למייל ולא ב-URL |
| Offline | ארנק/IndexedDB יכול לשמור `qr_token` לתצוגה; המימוש תמיד אונליין אצל הסורק |

### 6.4 מה אסור

- להטמיע PNG/SVG של QR כ-`data:` ב-HTML המייל.
- לשים `qr_payload` המלא ב-query string ציבורי ללא בקרת גישה.
- לשלוח מייל `order_paid` **וגם** מייל קופון לאותה הזמנה (מייל הקופון הוא האישור כשיש vouchers).
- להבטיח "הספק קיבל תשלום מהפלטפורמה" באירוע רכישת קופון (השחרור הוא במימוש לפי מודל ה-Escrow).

### 6.5 תזכורת פקיעה (QR שוב)

48 שעות לפני `expires_at` (יעד): מייל RTL עם אותו CTA לדף הקופון.  
Dedupe: `coupon_expiry_48h:{voucher_id}`. לא נשלח אם הסטטוס כבר לא `issued`.

---

## 7. קטלוג אירועים (ליבה)

| אירוע | מתי | נמענים |
|---|---|---|
| רכישת קופון / הנפקה | vouchers `issued` אחרי paid | לקוח: מייל עם קוד + לינק QR; ספק: `supplier_sale` תפעולי |
| הזמנה פיזית שולמה | `paid_at` set, אין vouchers (או בנוסף לשורות physical) | לקוח: `order_paid`; ספק: `supplier_sale` עם שורות |
| קופון נסרק | `vouchers.status = redeemed` | לקוח: `voucher_redeemed` |
| פקיעה בקרוב | cron, 48ש | לקוח: תזכורת + לינק QR |
| DLQ / worker stall | attempts exhausted / אין drain | Ntfy אדמין בלבד |

---

## 8. אבטחה

- אין `RESEND_API_KEY` / `QSTASH_TOKEN` / service role בדפדפן.
- Edge / cron דוחים בלי Bearer תקף.
- Outbox: RLS כבוי לכתיבת לקוח; אדמין SELECT בלבד (או service). לא לחשוף אימיילי ספקים ללקוחות.
- Suppression לפני enqueue ואחרי webhook.
- Transactional קריטי (אישור רכישה / קופון / QR) לא תלוי ב-`marketing_*`.

---

## 9. מפת קבצים

```
supabase/migrations/095_notification_outbox.sql
supabase/functions/notifications-worker/index.ts          # יעד
supabase/functions/notifications-worker/channels/resend.ts
src/lib/email/resend.ts
src/lib/email/voucher-email.ts
src/lib/email/notifications.ts
src/server/payments/voucher-email.ts                      # מעבר: לשלוף אחרי outbox מלא
src/app/api/cron/notifications/route.ts
src/app/api/cron/notifications-dlq/route.ts               # יעד QStash failure callback
src/lib/notifications/qstash.ts                           # יעד (חוזה כמו search/qstash)
```

---

## 10. Acceptance

- [x] Triggers כותבים outbox בטרנזקציית paid/redeem בלי לחכות ל-Resend (095+096)
- [x] Worker (Edge `notifications-worker` + cron twin) שולח דרך Resend עם Idempotency-Key
- [x] QStash retries על non-2xx; אחרי תקרה: DLQ + outbox `dead`
- [x] כל מייל ללקוח: `lang=he` + `dir=rtl`, עברית, סכומים מ-agorot
- [x] מייל קופון: קוד + לינק `/coupon/{id}`, בלי תמונת QR מוטמעת (`voucher_issued`)
- [x] אין כפילות order_paid + voucher email לאותה הזמנה
- [x] אין Make/Zapier במסלול ייצור

---

## 11. Revision

| Date | Change |
|---|---|
| 2026-07-23 | Draft ישן: outbox + templates + 30א (לא מחייב מול stack הסופי) |
| 2026-07-29 | V1 binding: Resend + Trigger + Edge (ללא Make/Zapier) |
| 2026-07-31 | V2 events / WhatsApp / unsubscribe (ראה גם `ARCHITECTURE-NOTIFICATIONS-V2.md`) |
| 2026-08-02 | איחוד מחייב ב-`ARCHITECTURE-NOTIFICATIONS.md`: Resend API, Edge+triggers, QStash retry, RTL, זרימת QR לקופון; מודל Escrow 2026-07-27 בנוסח הסכומים |
| 2026-08-02 | יישום על `feat/notifications`: 096 voucher_issued, drain+QStash+DLQ, Edge twin, RTL `lang=he` |
