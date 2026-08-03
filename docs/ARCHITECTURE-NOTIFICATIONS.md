# ARCHITECTURE: Notifications

ארכיטקטורת התראות טרנזקציוניות של KenyonExpress.

Status: **BINDING** · Updated: 2026-08-03  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה ב-worktree הראשי (`kenyonexpress`).

Companions:

```
docs/ARCHITECTURE-NOTIFICATIONS-MARKETING.md
docs/ARCHITECTURE-SUPPLIER-PORTAL.md
docs/ARCHITECTURE-ACCOUNT-WALLET.md
docs/ARCHITECTURE-PERSONAL-AREA.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
docs/BUSINESS-MODEL.md
```

## Stack מחייב

| רכיב | בחירה | אסור |
|---|---|---|
| Email | **Resend** HTTP API | SMTP מהדפדפן, SendGrid כברירת מחדל, Make/Zapier |
| Emit | **Supabase Database Trigger** / `SECURITY DEFINER` enqueue | קריאה סינכרונית לספק מתוך `finalizeOrder` |
| Drain | **Supabase Edge Function** `notifications-worker` | אוטומציה חיצונית כמסלול ייצור |
| Twin drain | `GET\|POST /api/cron/notifications` + `CRON_SECRET` | worker בלי אימות |
| Retry | Outbox `next_attempt_at` + **Upstash QStash** | לולאת retry בלי תקרה / בלי DLQ |
| Templates | עברית **RTL** (`lang="he"`, `dir="rtl"`) | LTR / אנגלית כברירת מחדל ללקוח |
| WhatsApp | Meta Cloud API (utility templates, מאחורי flag) | שליחה חופשית בלי template |
| SMS | אגרגטור ישראלי, fallback בלבד | SMS שיווקי כערוץ ראשי |
| Wallet push | Apple Wallet / Google Wallet pass update (`wallet_push`) | Zapier / עדכון pass מהדפדפן עם מפתח פרטי |

סודות רק ב-Edge / Vercel server:

```
RESEND_API_KEY
EMAIL_FROM
CRON_SECRET
SUPABASE_SERVICE_ROLE_KEY
QSTASH_TOKEN
QSTASH_CURRENT_SIGNING_KEY
QSTASH_NEXT_SIGNING_KEY
META_WA_TOKEN
META_WA_PHONE_NUMBER_ID
SMS_PROVIDER_API_KEY
APPLE_WALLET_PASS_TYPE_ID
APPLE_WALLET_TEAM_ID
APPLE_WALLET_CERT_PEM
GOOGLE_WALLET_ISSUER_ID
GOOGLE_WALLET_SERVICE_ACCOUNT_JSON
UNSUBSCRIBE_SIGNING_SECRET
```

As-built לייחוס (לא לערוך מה-worktree הזה):

```
supabase/migrations/095_notification_outbox.sql
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
| N2 | At-least-once enqueue; exactly-once אפקט לנמען דרך `dedupe_key` UNIQUE + Idempotency-Key ל-Resend. |
| N3 | מחזור חיי קופון: **הונפק / מומש / פג (או עומד לפוג)** עם fan-out לפי העדפות. |
| N4 | ערוץ ברירת מחדל לקופון: **email (Resend)**. WhatsApp משני. SMS רק fallback. |
| N5 | תבניות RTL עברית. מותג: צהוב `#fed700` / `#f5c518`, דיו `#333e48` / `#1a1a1a`. |
| N6 | כסף ב-payload: **אגורות (integer)**. בגוף ההודעה: ₪ עם שני עשרונים (`he-IL`). |
| N7 | **אין Escrow.** ללקוח: שולם באתר + יתרה בבית העסק. אין נוסח "Escrow"/"נאמן"/"מוחזק עד מימוש". אין לספר לספק על payout מקופון. |
| N8 | QR **לא** מוטמע כ-`data:` URI בגוף המייל. המייל נושא קוד קריא + קישור ל-`/coupon/{id}`. |
| N9 | Transactional לא דורש opt-in שיווקי. Suppression / STOP תמיד מכבדים. |
| N10 | אין Make / Zapier בייצור. טבלת שוברים קנונית: `vouchers`. |
| N11 | **Wallet push** (Apple/Google) הוא עדכון/הנפקת pass; לא מחליף מייל; רץ ב-Edge worker על `channel=wallet_push`. |

---

## 1. Pipeline (Resend + Edge Functions)

```text
Domain commit
  (finalizeOrder / vouchers issued / redeem_voucher / expiry cron)
        │
        ▼
AFTER TRIGGER  (SECURITY DEFINER, EXCEPTION swallowed)
  או fn_enqueue_notification(...)
        │
        ▼
notification_outbox
  (dedupe_key UNIQUE, channel, status pending|sent|dead|skipped)
        │
        ├─ wake: cron / QStash publish  (לא חוסם את ה-commit)
        ▼
Edge Function notifications-worker
  (twin מותר: POST /api/cron/notifications עם Bearer CRON_SECRET)
        │
        ├─ claim due rows (FOR UPDATE SKIP LOCKED)
        ├─ route by channel: email | whatsapp | sms | push | wallet_push
        ├─ render Hebrew RTL template / Meta vars / pass update
        │
        ├─ 2xx → status=sent, provider_message_id
        ├─ 429/5xx/network → QStash retry + outbox backoff
        └─ attempts exhausted / permanent → status=dead + DLQ
```

| שכבה | היום (095 + cron) | יעד מחייב |
|---|---|---|
| Emit | Triggers על `orders.paid_at` ו-`vouchers.status` | + expiry cron + multi-channel |
| Drain | `GET /api/cron/notifications` | Edge `notifications-worker` + twin זהה |
| Channels | email בלבד | email + WhatsApp + SMS + push + **wallet_push** |
| Retry | outbox backoff | outbox + **QStash** + DLQ |

`pg_net` אינו מותקן. Trigger **לא** קורא HTTP ישירות.

---

## 2. Resend (email)

### 2.1 Endpoint

```http
POST https://api.resend.com/emails
Authorization: Bearer $RESEND_API_KEY
Content-Type: application/json
Idempotency-Key: <dedupe_key>
```

```json
{
  "from": "KenyonExpress <noreply@kenyonexpress.co.il>",
  "to": ["customer@example.com"],
  "subject": "הקופון שלך מוכן",
  "html": "<div dir=\"rtl\" lang=\"he\">…</div>",
  "text": "…",
  "reply_to": "support@kenyonexpress.co.il"
}
```

### 2.2 כללים

1. לעולם לא לזרוק מתוך מסלול כסף. מחזירים `{ ok, id | reason }`.
2. בלי מפתח: `{ skipped: true, reason: 'no_api_key' }` (לא שורפים attempts ב-local/CI).
3. `Idempotency-Key` = `dedupe_key`.
4. 429/5xx/network → retryable. 4xx validation → `dead` / suppression.
5. Webhook Resend → `notification_delivery_events` + `email_suppressions`.

Adapter יעד:

```
supabase/functions/notifications-worker/channels/resend.ts
src/lib/email/resend.ts
```

---

## 3. Edge Functions + Triggers

### 3.1 Triggers (emit)

| Trigger / job | טבלה | תנאי | אירוע ליבה |
|---|---|---|---|
| `trg_orders_notify_paid` | `orders` | `paid_at` null → not null | `order_paid` (רק בלי vouchers) + `supplier_sale` |
| `trg_vouchers_notify_issued` | `vouchers` | insert `issued` / status → issued | `coupon_issued` |
| `trg_vouchers_notify_redeemed` | `vouchers` | status → `redeemed` | `coupon_redeemed` |
| `trg_vouchers_notify_expired` | `vouchers` | status → `expired` | `coupon_expired` |
| expiry cron | `vouchers` | `issued` ו-`expires_at` תוך 48ש | `coupon_expiry_48h` |

Enqueue:

```
fn_enqueue_notification(kind, channel, recipient, dedupe_key, payload)
```

- מנרמל email/phone
- מכבד suppressions ו-prefs **בזמן enqueue**
- `ON CONFLICT (dedupe_key) DO NOTHING`
- בולע שגיאות (`EXCEPTION WHEN OTHERS` + `RAISE WARNING`) ומחזיר `NEW`

### 3.2 Worker (drain)

```http
POST /functions/v1/notifications-worker
Authorization: Bearer $CRON_SECRET
```

אלגוריתם:

1. אימות Bearer.
2. Claim עד 50 שורות due.
3. לפי `channel`: Resend / Meta WA / SMS / push / Wallet pass update.
4. הצלחה → `sent`. כשל זמני → backoff + QStash. תקרה → `dead` + DLQ.
5. kind בלי תבנית → `dead` מיידי.

Twin מותר:

```
GET|POST /api/cron/notifications
Authorization: Bearer $CRON_SECRET
```

### 3.3 Payload

ids, agorot, שמות בעברית שצולמו בזמן האירוע, תאריכים.  
אין PAN, אין `cardcom_token`, אין `VOUCHER_QR_SECRET`, אין service role.

---

## 4. QStash retry

| שכבה | תפקיד |
|---|---|
| Outbox | מקור אמת: dedupe, audit, dead letters |
| QStash | wake מהיר + retries על non-2xx + failure callback ל-DLQ |

```http
POST https://qstash.upstash.io/v2/publish/{APP_URL}/api/cron/notifications
Authorization: Bearer $QSTASH_TOKEN
Upstash-Retries: 5
Upstash-Failure-Callback: {APP_URL}/api/cron/notifications-dlq
Upstash-Deduplication-Id: {dedupe_key}
```

Outbox backoff: `2 * 4^(attempts-1)` דקות, מקס 5 attempts.  
אימות `Upstash-Signature` חובה. בלי `QSTASH_TOKEN`: degrade ל-cron בלבד.

---

## 5. מחזור חיי קופון (הונפק / מומש / פג)

מודל כסף בהודעות (תואם `BUSINESS-MODEL.md` + supplier portal):

| מושג | משמעות ללקוח | מה לא לכתוב |
|---|---|---|
| שולם באתר | `coupon_price` / `paid_on_site_agorot` | "מוחזק", "Escrow", "יועבר לספק" |
| יתרה בבית העסק | `remaining_amount_due_agorot` / face − coupon | "יתרה בפלטפורמה" |
| לספק מקופון | 0 מהפלטפורמה | הבטחת payout / תאריך העברה |

### 5.1 מטריצת ערוצים

| אירוע | kind | Email (Resend) | WhatsApp | SMS | Wallet push |
|---|---|---|---|---|---|
| הונפק אחרי תשלום | `coupon_issued` | חובה | utility אם opt-in + template | fallback בלבד | הנפקה/עדכון pass אם המשתמש הוסיף לארנק |
| מומש בסריקה | `coupon_redeemed` | חובה | utility קצר | לא כברירת מחדל | void / redeemed על ה-pass |
| תזכורת 48ש לפני פקיעה | `coupon_expiry_48h` | חובה (ניתן לכיבוי) | utility אם פעיל | מותר (קצר) | עדכון שדה תוקף על ה-pass |
| פג בפועל | `coupon_expired` | כן | אופציונלי | לא | void pass |

כלל: מייל קופון שהונפק **הוא** אישור הרכישה. לא לשלוח גם `order_paid` גנרי על אותה הזמנה כשיש vouchers.

### 5.2 `coupon_issued` (הונפק)

| שדה | ערך |
|---|---|
| Emit | אחרי הנפקת `vouchers` תחת הזמנה paid |
| Dedupe email | `coupon_issued:{voucher_id}:customer:email` |

תוכן חובה:

- שם מוצר בעברית
- קוד קופון (`dir=ltr`)
- שולם באתר / יתרה בבית העסק / תוקף
- CTA ל-`/coupon/{voucher_id}`

Subject:

```
הקופון שלך מוכן · {PRODUCT_NAME_HE}
```

SMS (מקס ~2 סגמנטים UCS-2):

```
KenyonExpress: הקופון {{code}} מוכן. יתרה בעסק {{due}}. פרטים: {{short_url}}
```

### 5.3 `coupon_redeemed` (מומש)

| שדה | ערך |
|---|---|
| Emit | `vouchers.status` → `redeemed` |
| נמען ראשי | לקוח |
| נמען משני | ספק (סיכום סריקה; בלי הבטחת כסף מהפלטפורמה) |

תוכן ללקוח: מוצר, בית עסק, זמן `he-IL`, קוד, סכום שנגבה בעסק אם > 0, משפט "אם לא אתם מימשתם, פנו מיד".

Subject:

```
הקופון מומש · {PRODUCT_NAME}
```

### 5.4 `coupon_expiry_48h` / `coupon_expired`

| שדה | ערך |
|---|---|
| 48h job | cron; רק `issued` עם `expires_at` בחלון |
| Dedupe 48h | `coupon_expiry_48h:{voucher_id}:customer:{channel}` |

תזכורת נשארת טרנזקציונית רק בלי תוכן קידומי.  
כיבוי ב-`user_notification_preferences.coupon_expiry_*` מכבדים.  
אישור רכישה/מימוש/החזר לא נחסמים ע"י כיבוי expiry.

### 5.5 ספק על מחזור הקופון

| אירוע | ספק מקבל | נוסח אסור |
|---|---|---|
| הנפקה | `supplier_sale` תפעולי (נמכר קופון; מימוש ב-QR) | "קיבלתם תשלום מהפלטפורמה" |
| מימוש | סיכום סריקה + יתרה שנגבתה בעסק | הבטחת תאריך payout מקופון |
| פקיעה | לא כברירת מחדל | אין נוסח payout |

---

## 6. תבניות מייל עברית RTL

### 6.1 מעטפת חובה

```html
<!DOCTYPE html>
<html lang="he" dir="rtl">
  <body style="margin:0;background:#f7f7f7;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">
    <table role="presentation" width="100%" dir="rtl" style="direction:rtl;text-align:right;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" dir="rtl"
                 style="direction:rtl;text-align:right;background:#ffffff;border-top:4px solid #fed700;">
            <!-- content -->
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```

כללים:

- `lang="he"` ו-`dir="rtl"` על השורש ועל בלוקים פנימיים
- `text-align: right`
- פונט מייל: `Arial, Helvetica, sans-serif` (Heebo רק אם מובטח ב-CDN)
- קודים/סכומים ב-`dir="ltr"` או `<bdi>`
- Escape לכל משתנה דינמי
- חלק plaintext בעברית תמיד לצד HTML

### 6.2 Subjects

| kind | subject |
|---|---|
| `coupon_issued` | הקופון שלך מוכן · {{product_name}} |
| `coupon_redeemed` | הקופון מומש · {{product_name}} |
| `coupon_expiry_48h` | תזכורת: הקופון שלך פג תוך 48 שעות |
| `coupon_expired` | הקופון פג תוקף · {{product_name}} |
| `order_paid` | ההזמנה שלך התקבלה · {{order_ref}} |
| `supplier_sale` | הזמנה חדשה ב-KenyonExpress · {{order_ref}} |

### 6.3 סדר כסף בגוף קופון

1. שולם באתר: `coupon_price_agorot` → ₪
2. לתשלום בבית העסק: `remaining_due_agorot` → ₪
3. (משני) מחיר מלא: `face_value_agorot` → ₪
4. בתוקף עד: תאריך `he-IL`

בלוק דוגמה (RTL):

```html
<p style="margin:0 0 8px;text-align:right;">שולם באתר: <bdi dir="ltr">₪{{paid_ils}}</bdi></p>
<p style="margin:0 0 8px;text-align:right;">יתרה לתשלום בבית העסק: <bdi dir="ltr">₪{{due_ils}}</bdi></p>
<p style="margin:0 0 16px;text-align:right;">קוד הקופון: <bdi dir="ltr">{{code}}</bdi></p>
a[href="{{coupon_url}}"] { … }  <!-- CTA: הצג קופון -->
```

---

## 7. Coupon QR delivery (מייל)

```text
1. paid → issue vouchers (code + qr_payload חתום בשרת)
2. enqueue coupon_issued
3. Edge worker → Resend: קוד + סכומים + CTA ל-/coupon/{id}
4. לקוח פותח דף → QR מרונדר בזמן תצוגה
5. ספק סורק → redeem → coupon_redeemed
```

אסור: PNG/SVG כ-`data:` במייל; `qr_payload` ב-query ציבורי; הבטחת payout לספק בהנפקה.

---

## 8. WhatsApp + SMS (משניים)

| ערוץ | כלל |
|---|---|
| WhatsApp | utility templates מאושרים; flag `WHATSAPP_NOTIFICATIONS_ENABLED`; STOP → suppression |
| SMS | fallback להנפקה בלי email/WA; תזכורת פקיעה קצרה; בלי שיווק |

סדר fan-out ל-`coupon_issued`:

```text
1. email (תמיד אם יש כתובת ולא suppressed)
2. wallet_push (אם יש pass רשום או CTA "הוסף לארנק" הופעל)
3. push (אם push_token קיים)
4. whatsapp (אם flag + template + טלפון)
5. sms (רק אם אין email ולא נשלח WA)
```

כל ערוץ = שורת outbox נפרדת עם `dedupe_key` נפרד.

---

## 8a. Wallet push (Apple Wallet / Google Wallet)

### 8a.1 מטרה

הלקוח שומר קופון בארנק המכשיר. כשהסטטוס משתנה (הונפק / מומש / פג), ה-Edge worker דוחף עדכון ל-pass בלי לפתוח את האפ.

זה **לא** ארנק הקאשבק הפנימי (`wallet_accounts`). לארנק הכסף ראה:

```
docs/ARCHITECTURE-WALLET-LEDGER.md
```

### 8a.2 מודל

| פלטפורמה | מנגנון |
|---|---|
| Apple Wallet | PassKit web service: register device, push על שינוי pass, הורדת `.pkpass` מעודכן |
| Google Wallet | Google Wallet API: create/update object; push לתצוגה |

טבלה יעד:

```text
wallet_passes (
  id, user_id, voucher_id,
  platform apple|google,
  pass_serial / object_id,
  auth_token,
  status active|redeemed|expired|void,
  updated_at
)
```

### 8a.3 אירועים → wallet_push

| אירוע | פעולת pass |
|---|---|
| `coupon_issued` | יצירת pass (אחרי "הוסף לארנק") או עדכון שדות |
| `coupon_redeemed` | redeemed / void + הודעת עדכון |
| `coupon_expiry_48h` | עדכון תוקף / באנר תזכורת |
| `coupon_expired` | void |

```text
channel = wallet_push
dedupe  = {kind}:{voucher_id}:customer:wallet_push:{platform}
```

### 8a.4 תוכן על ה-pass

- שם מוצר בעברית
- קוד + QR (מ-`qr_payload` שנוצר בשרת)
- שולם באתר / יתרה בבית העסק (בלי נוסח Escrow)
- תוקף
- מותג צהוב בגבולות מדריכי Apple/Google

סודות חתימה רק בשרת/Edge. המייל מציע CTA "הוסף לארנק"; לא מטמיע QR כ-`data:` URI.

---

## 9. העדפות, suppression, משפטי

| נושא | ברירת מחדל | הערות |
|---|---|---|
| הנפקה / מימוש / החזר | on | Transactional; לא תלוי marketing |
| תזכורת פקיעה | on | ניתן לכיבוי |
| WhatsApp utility | on אם טלפון + template | STOP מכבדים |
| SMS | fallback | בלי שיווק |
| Marketing | off | ראה MARKETING doc + חוק 30א |

Unsubscribe חתום (יעד):

```
/api/notifications/unsubscribe?u=…&t=…&sig=…&exp=…
```

Topics: `marketing`, `coupon_expiry`. לא חוסמים הנפקה/מימוש/החזר אלא ב-opt-out טרנזקציונלי נדיר ומפורש.

---

## 10. אבטחה ו-ops

- אין מפתחות ספקים בדפדפן.
- Worker בלי Bearer → 401.
- Outbox: אין RLS כתיבה ללקוח; אדמין SELECT.
- Trigger errors לא מפילים תשלום/סריקה.
- Ntfy/Sentry: DLQ, stall (אין drain 15 דק' ויש תור), Resend 429 מתמשך.
- עדיפות DLQ: `coupon_issued` > refund > `order_paid` > `coupon_redeemed` > supplier.

---

## 11. מפת קבצים (יעד)

```
supabase/functions/notifications-worker/index.ts
supabase/functions/notifications-worker/channels/resend.ts
supabase/functions/notifications-worker/channels/whatsapp.ts
supabase/functions/notifications-worker/channels/sms.ts
supabase/functions/notifications-worker/channels/wallet-push.ts
supabase/functions/notifications-worker/templates/*
src/app/api/cron/notifications/route.ts
src/app/api/cron/notifications-dlq/route.ts
src/app/api/wallet/passes/[voucherId]/route.ts
src/lib/notifications/qstash.ts
src/lib/email/resend.ts
```

---

## 12. SLA תפעולי

| מדד | יעד |
|---|---|
| Enqueue אחרי paid / redeem | באותה טרנזקציה (או מיד אחרי commit דומיין) |
| Drain ראשון (email) | ≤ 60 שניות ב-p95 כש-cron/QStash חיים |
| WhatsApp utility | ≤ 2 דקות אחרי email (או במקביל אחרי claim) |
| SMS fallback | רק כשאין email/WA; ≤ 3 דקות |
| Wallet push | ≤ 2 דקות אחרי שינוי סטטוס pass |
| DLQ alert | מיידי על `coupon_issued` dead |

אין לחכות לספק הודעות לפני תשובת webhook/redeem ללקוח.

---

## 13. Acceptance

- [ ] Resend + Trigger + Edge worker (או cron twin), בלי Make/Zapier
- [ ] מחזור קופון: issued / redeemed / expiry+expired על email + WhatsApp + SMS
- [ ] Wallet push מעדכן pass ב-issued/redeemed/expired
- [ ] מייל RTL: `lang=he` `dir=rtl`, קוד + לינק `/coupon/{id}`, בלי QR מוטמע
- [ ] נוסח כסף: שולם באתר + יתרה בעסק; בלי Escrow/held
- [ ] QStash retries + DLQ; מסלול כסף לא מחכה לספקים
- [ ] Idempotency: `dedupe_key` לכל channel + Resend Idempotency-Key

---

## 14. Out of scope

- קמפיינים שיווקיים (ראה MARKETING)
- שינוי מודל כסף / ledger בקוד
- שינוי קוד ב-worktree הראשי

---

## 15. Revision

| Date | Change |
|---|---|
| 2026-07-23 | Draft ישן: outbox + templates |
| 2026-07-29 | V1: Resend + Trigger + Edge |
| 2026-07-31 | V2: WhatsApp, QR, 48h, unsubscribe |
| 2026-08-02 | איחוד מחייב + QStash + QR דרך `/coupon/{id}` |
| 2026-08-03 | rev B: SLA + multi-channel |
| 2026-08-03 | ke-arch docs-lifecycle: נעילת No Escrow בנוסח; דגש Resend + Edge + תבניות RTL |
| 2026-08-03 | rev C: מחזור קופון email/WA/SMS + Wallet push מחייב ב-Edge worker |
