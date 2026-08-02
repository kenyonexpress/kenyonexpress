# ARCHITECTURE: Notifications

ארכיטקטורת התראות טרנזקציונליות ל-KenyonExpress.

Status: **BINDING** · Updated: 2026-08-03  
Scope: **docs only** · worktree `docs/final-pack`  
אין שינוי קוד. אין נגיעה ב-worktree הראשי (`kenyonexpress` / `phase5/homepage`).

Companions:

```
docs/ARCHITECTURE-NOTIFICATIONS-V2.md
docs/ARCHITECTURE-PERSONAL-AREA.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/ARCHITECTURE-MARKETING.md
docs/LEGAL-CHECKLIST.md
docs/RUNBOOK-OPERATIONS.md
docs/LAUNCH-DAY.md
```

**עקרון עליון:** מסלול כסף לעולם לא מחכה ל-Resend. Trigger כותב שורת outbox באותה טרנזקציה (או מיד אחרי commit דומיין); Edge Function שולח אסינכרונית.

---

## 0. הכרעות מחייבות

| # | הכרעה |
|---|---|
| N1 | Email: **Resend** בלבד. אין SMTP מהדפדפן. אין Make/Zapier/n8n בייצור. |
| N2 | Emit: **Supabase Database Trigger** (`SECURITY DEFINER`) → outbox. לא קריאה סינכרונית ל-Resend מ-`finalizeOrder`, webhook Cardcom, או redeem. |
| N3 | Drain: **Supabase Edge Function** `notifications-worker` (Bearer `CRON_SECRET`). גשר זמני מותר: אותו חוזה על Vercel cron עד ש-schedule Edge / `pg_net` יציב. |
| N4 | At-least-once enqueue; אפקט exactly-once לנמען דרך `dedupe_key` UNIQUE + Resend `Idempotency-Key`. |
| N5 | תבניות **עברית RTL** (`lang=he`, `dir=rtl`). מותג: ink `#333e48`, yellow `#fed700`. |
| N6 | כסף ב-payload: **integer agorot**. בגוף המייל: ₪ עם `he-IL` ושתי ספרות. |
| N7 | קופון (Escrow פנימי 2026-07-27): במייל ללקוח: **שולם באתר** + **יתרה בבית העסק** + QR/קוד. אין נוסח "Escrow"/"נאמן". לספק: אין נוסח payout. |
| N8 | Transactional לא דורש opt-in שיווקי. Suppression (bounce/complaint) תמיד מכבדים. |
| N9 | טבלת שוברים: `vouchers`. Trigger על שגיאה **בולע** כדי לא להפיל תשלום, סריקה או refund. |
| N10 | אחרי max attempts → `dead` + שורת DLQ + התראת ops. אין drop שקט על חמשת האירועים בליבה. |
| N11 | מייל קופון עם QR **הוא** אישור הרכישה לקופון. לא לשלוח גם `order_confirmation` גנרי על אותה הזמנה. |

---

## 1. Stack

| רכיב | בחירה | אסור |
|---|---|---|
| Provider | Resend API (`POST /emails`) | SendGrid כברירת מחדל, SMTP מלקוח |
| Emit | DB Trigger על `orders` / `vouchers` / refund path | קריאה חוסמת מנתיב כסף |
| Queue | `notification_outbox` (יישור עתידי ל-`notifications_outbox` מ-031) | שליחה בלי שורה עמידה |
| Worker | Edge Function `notifications-worker` | Make, Zapier |
| Templates | HTML+text בעברית, render ב-worker | עריכת תוכן ב-DB בלי גרסה |
| Secrets | Edge / server בלבד | `RESEND_API_KEY` בדפדפן |

סודות:

```
RESEND_API_KEY
RESEND_FROM
CRON_SECRET
SUPABASE_SERVICE_ROLE_KEY
UNSUBSCRIBE_SIGNING_SECRET
```

From מאומת (יעד):

```
KenyonExpress <noreply@kenyonexpress.co.il>
```

---

## 2. Pipeline (Trigger → Outbox → Edge → Resend)

```text
Domain commit
  orders.paid_at set
  vouchers issued / status → redeemed
  refund finalized
        │
        ▼
AFTER TRIGGER (SECURITY DEFINER, EXCEPTION swallowed)
  → fn_enqueue_notification(kind, email, dedupe_key, payload)
  → notification_outbox INSERT … ON CONFLICT (dedupe_key) DO NOTHING
        │
        ▼
Edge Function: notifications-worker  (every ~1 min)
  Authorization: Bearer CRON_SECRET
  → claim due rows (FOR UPDATE SKIP LOCKED)
  → check suppressions
  → render Hebrew RTL template
  → Resend + Idempotency-Key = dedupe_key
        │
        ├─ 2xx        → status = sent
        ├─ 429 / 5xx  → pending + backoff next_attempt_at
        ├─ permanent  → dead + DLQ
        └─ suppressed → skipped (no attempt burn)
```

כללים:

1. Webhook Cardcom / `finalizeOrder` / redeem / refund admin מחזירים ללקוח מיד אחרי commit דומיין.
2. Worker רץ עם service role. הדפדפן לא מחזיק מפתחות.
3. Drain אחד לוגית: Edge הוא היעד; cron Next הוא גשר עם אותה סמנטיקה בלבד.

### 2.1 גשר as-built (תיעוד מצב, לא יעד סופי)

| פריט | מצב חי (מיגרציה 095) |
|---|---|
| טבלה | `notification_outbox` |
| kinds חיים | `order_paid`, `supplier_sale`, `voucher_redeemed` |
| Drain חי | `GET /api/cron/notifications` |
| למה לא Edge עדיין | `pg_net` לא מותקן; העמידות באה מה-outbox |
| פער מול מסמך זה | חסרים kinds מפורשים ל-`coupon_purchased` (QR), `refund`; חלק מהלוגיקה ב-`voucher-email` סינכרוני |

החוזה במסמך זה הוא **יעד ארכיטקטוני**. מימוש הקוד: מחוץ לסקופ.

---

## 3. קטלוג אירועים (חמשת הליבה)

### 3.1 אישור הזמנה ללקוח (`order_confirmation`)

| שדה | ערך |
|---|---|
| kind (יעד) | `order_confirmation` |
| kind חי (גשר) | `order_paid` |
| נמען | `profiles.email` של `orders.user_id` |
| Emit | `AFTER UPDATE OF paid_at` כש-`paid_at` עובר מ-null לערך |
| תנאי | ההזמנה **לא** הנפיקה `vouchers` (אחרת ראה §3.2) |
| Dedupe | `order_confirmation:{order_id}` |

תוכן חובה:

- מספר הזמנה קצר (8 תווים ראשונים, uppercase)
- סך שולם באתר
- מספר פריטים (אופציונלי)
- CTA ל-`/account/orders`

Subject:

```
ההזמנה שלך התקבלה · {ORDER_REF}
```

### 3.2 רכישת קופון עם QR (`coupon_purchased`)

| שדה | ערך |
|---|---|
| kind (יעד) | `coupon_purchased` |
| נמען | לקוח |
| Emit | אחרי הנפקת `vouchers` תחת הזמנה `paid` (trigger על insert voucher `issued`, או fan-out מ-`paid_at` כשיש vouchers) |
| Dedupe | `coupon_purchased:{voucher_id}:customer:email` |
| ערוץ | email (חובה) |

תוכן חובה:

- שם מוצר בעברית
- קוד קופון (מוצג; `dir=ltr`)
- **QR**: PNG מצורף / `cid`, או קישור חתום קצר ל-`/account/coupons` (או `/coupon/{id}`)
- שולם באתר (`coupon_price` / paid online, agorot → ₪)
- יתרה לתשלום בבית העסק
- תוקף (`expires_at` בעברית)
- CTA לאזור הקופונים

איסורים:

- לא לשלוח גם `order_confirmation` על אותה הזמנה
- לא לכלול `VOUCHER_QR_SECRET` או raw HMAC secret בגוף/URL פתוח
- לא נוסח Escrow/נאמן

Subject:

```
הקופון שלך מוכן · {PRODUCT_NAME_HE}
```

Payload מינימלי:

```json
{
  "voucher_id": "…",
  "order_id": "…",
  "order_ref": "A1B2C3D4",
  "product_name": "…",
  "code": "ABCD-1234",
  "coupon_price_agorot": 5000,
  "remaining_due_agorot": 15000,
  "expires_at": "2026-12-31T21:59:59+02:00",
  "qr_url": "https://kenyonexpress.co.il/account/coupons?v=…"
}
```

### 3.3 מימוש קופון / אישור סריקה (`coupon_redeemed`)

| שדה | ערך |
|---|---|
| kind (יעד) | `coupon_redeemed` |
| kind חי (גשר) | `voucher_redeemed` |
| נמען ראשי | לקוח (אבטחה: לדעת שהקופון מומש) |
| נמען משני | ספק (סיכום סריקה) |
| Emit | `AFTER UPDATE OF status` על `vouchers` → `redeemed` |
| Dedupe לקוח | `coupon_redeemed:{voucher_id}:customer:email` |
| Dedupe ספק | `coupon_redeemed:{voucher_id}:supplier:email` |

תוכן ללקוח:

- שם מוצר, שם בית עסק, תאריך/שעה `he-IL`
- קוד (מעוצב)
- סכום שנגבה בבית העסק אם > 0
- משפט: אם לא אתם מימשתם, פנו מיד
- CTA ל-`/account/coupons`

Subject לקוח:

```
הקופון מומש · {PRODUCT_NAME}
```

תוכן לספק:

- מוצר, קוד מקוצר, שעת סריקה, `collected_agorot`
- בלי PII מיותר של הלקוח

Subject ספק:

```
קופון נסרק · {PRODUCT_NAME}
```

### 3.4 התראת הזמנה חדשה לספק (`supplier_new_order`)

| שדה | ערך |
|---|---|
| kind (יעד) | `supplier_new_order` |
| kind חי (גשר) | `supplier_sale` |
| נמען | `suppliers.contact_email` או `supplier_members` עם תפקיד owner/manager (לא scanner כברירת מחדל) |
| Emit | אותו `paid_at` trigger: **שורה אחת לספק להזמנה**, לא לכל line |
| Dedupe | `supplier_new_order:{order_id}:{supplier_id}:email` |

תוכן:

- "התקבלה אצלכם הזמנה/מכירה חדשה"
- רשימת שורות (שם, כמות, האם קופון)
- מזהה הזמנה קצר
- להזמנה פיזית: כתובת משלוח + קישור פורטל
- לקופון: תזכורת שמימוש ב-QR ושיתרה נגבית בקופה
- CTA ל-`/supplier/orders`

איסורים:

- אין "קיבלתם תשלום מהפלטפורמה"
- אין סכום payout / תאריך העברה
- מותר "סכום ההזמנה אצלכם" כסכום שורות בלבד
- `platform_percent` רק מסנאפשוט `order_items` (אם מוצג בכלל; לא ללקוח)

Subject:

```
הזמנה חדשה ב-KenyonExpress · {ORDER_REF}
```

### 3.5 החזר (`refund`)

| שדה | ערך |
|---|---|
| kind (יעד) | `refund` |
| נמען | לקוח (חובה); ספק (אופציונלי אם ההחזר מבטל התחייבות אצלו) |
| Emit | אחרי שה-refund מאושר בדומיין (סטטוס הזמנה/ledger/Cardcom refund id קיימים). לא לפני. |
| Dedupe | `refund:{refund_id}:customer:email` או `refund:{order_id}:{refund_id}:customer:email` |

תוכן ללקוח:

- מספר הזמנה
- סכום שזוכה (agorot → ₪)
- האם קופון בוטל / לא ניתן למימוש
- זמן צפוי להופעה בכרטיס (נוסח כללי, לא הבטחת ימים מדויקת אלא אם Cardcom נותן)
- CTA ל-`/account/orders/{id}`
- לינק תמיכה אם קיים

Subject:

```
בוצע זיכוי להזמנה · {ORDER_REF}
```

איסורים:

- לא לשלוח לפני שהזיכוי באמת נרשם
- לא להבטיח "הכסף חזר תוך X ימים" אם אין מקור אמת
- קופון שכבר `redeemed`: מדיניות נפרדת (אין הבטחת החזר מלא אוטומטי; ראה LEGAL / RUNBOOK)

---

## 4. Idempotency keys

שתי שכבות חובה. שתיהן משתמשות באותו מחרוזת לוגית כשאפשר.

### 4.1 שכבת DB: `dedupe_key`

| כלל | פירוט |
|---|---|
| UNIQUE | `notification_outbox.dedupe_key` UNIQUE |
| Insert | `ON CONFLICT (dedupe_key) DO NOTHING` |
| יציבות | נגזר מזהות דומיין בלבד (order_id, voucher_id, supplier_id, refund_id), לא מ-timestamp |
| Replay | `finalizeOrder` / webhook / redeem חוזרים לא יוצרים שורה שנייה |

מפתחות קנוניים:

| אירוע | dedupe_key |
|---|---|
| אישור הזמנה | `order_confirmation:{order_id}` |
| קופון + QR | `coupon_purchased:{voucher_id}:customer:email` |
| סריקה ללקוח | `coupon_redeemed:{voucher_id}:customer:email` |
| סריקה לספק | `coupon_redeemed:{voucher_id}:supplier:email` |
| הזמנה לספק | `supplier_new_order:{order_id}:{supplier_id}:email` |
| החזר | `refund:{refund_id}:customer:email` |

### 4.2 שכבת Resend: `Idempotency-Key`

```http
POST https://api.resend.com/emails
Authorization: Bearer {RESEND_API_KEY}
Idempotency-Key: {dedupe_key}
```

| כלל | פירוט |
|---|---|
| ערך | זהה ל-`dedupe_key` של שורת ה-outbox |
| מטרה | אם ה-worker נפל אחרי ש-Resend קיבל אבל לפני `status=sent`, שליחה חוזרת לא יוצרת מייל כפול |
| אורך | לשמור מתחת למגבלת Resend; המפתחות למעלה קצרים ויציבים |

### 4.3 Claim אטומי

שני workers במקביל:

1. `FOR UPDATE SKIP LOCKED` או מעבר `pending → sending` מותנה
2. Resend Idempotency-Key כרשת ביטחון שנייה

---

## 5. סכימה

### 5.1 טבלאות

| טבלה | תפקיד |
|---|---|
| `notification_outbox` | תור שליחה (חי) |
| `notification_events` | עובדות דומיין append-only לפני fan-out (יעד) |
| `notification_templates` | גרסאות RTL לפי template_key/channel/locale (יעד) |
| `notification_delivery_events` | webhooks Resend |
| `notification_delivery_dlq` | עותק סופי אחרי `dead` |
| `email_suppressions` | bounce / complaint |
| `user_notification_preferences` | דגלי ערוץ/נושא |
| `consent_events` | ראיות unsubscribe |

### 5.2 עמודות outbox

```text
id                  uuid PK
kind                text
recipient_email     text
payload             jsonb      -- קפוא ברגע ה-emit
dedupe_key          text UNIQUE
status              text       -- pending | sending | sent | dead | skipped
attempts            int
last_error          text
next_attempt_at     timestamptz
provider_message_id text
created_at          timestamptz
sent_at             timestamptz
```

סטטוסים:

```text
pending → sending → sent
                 → pending (retry, next_attempt_at בעתיד)
                 → dead    (max attempts / permanent)
                 → skipped (suppressed / no recipient)
```

### 5.3 RLS

| אובייקט | authenticated | admin | service |
|---|---|---|---|
| outbox | אין | SELECT | ALL |
| DLQ | אין | SELECT | ALL |
| prefs | own R/W | ALL | ALL |

Outbox מחזיק כתובות של אחרים: אין policy ללקוח/ספק.

---

## 6. Edge Function: `notifications-worker`

### 6.1 כניסה

```http
POST /functions/v1/notifications-worker
Authorization: Bearer {CRON_SECRET}
```

Schedule: כל דקה.  
גשר:

```
GET /api/cron/notifications
```

### 6.2 אלגוריתם

```text
1. assertAuth → else 401
2. claim batch (25–50): status pending AND next_attempt_at <= now()
3. לכל שורה:
   a. אין template → dead מיידי
   b. suppression → skipped
   c. render RTL (html + text); ל-coupon_purchased: צרף QR אם זמין
   d. Resend + Idempotency-Key = dedupe_key
   e. ok → sent + provider_message_id
   f. אין API key בסביבה → skipped (לא שורפים attempts על כל התור)
   g. כשל זמני → attempts++, next_attempt_at = now + backoff
   h. attempts >= MAX → dead + DLQ + ops alert
4. return { claimed, sent, failed, dead, skipped }
```

### 6.3 Resend webhook (יעד)

`delivered` / `bounced` / `complained` → `notification_delivery_events` → עדכון suppression.  
Webhook replay: idempotent על `provider_event_id` UNIQUE.

---

## 7. Retry policy + DLQ

### 7.1 Retry

| ניסיון אחרי כשל | השהיה |
|---|---|
| 1 | 2 דקות |
| 2 | 8 דקות |
| 3 | 32 דקות |
| 4 | 128 דקות |
| 5 | `dead` (אין ניסיון שישי אוטומטי) |

נוסחה:

```text
backoff_minutes = 2 * 4^(attempts - 1)
MAX_ATTEMPTS = 5
```

סיווג שגיאות:

| סוג | פעולה |
|---|---|
| 429, 5xx, timeout, network | retry + backoff |
| 400 כתובת לא חוקית / domain rejected | `dead` מיידי |
| kind לא ידוע | `dead` מיידי |
| אין `RESEND_API_KEY` | skip ריצה; לא להעלות attempts |

### 7.2 DLQ

אחרי `dead`:

1. Insert ל-`notification_delivery_dlq` (outbox_id, kind, recipient, payload, last_error, attempts, failed_at).
2. התראת ops (Ntfy / Sentry): כל insert, או כשעומק ≥ 25.
3. Replay ידני מאדמין: `pending`, `attempts=0`, `next_attempt_at=now()`, + `audit_log`.
4. אסור למחוק DLQ של חמשת האירועים בליבה בלי אישור ops.

עדיפות ops ל-DLQ:

1. `coupon_purchased` (לקוח בלי QR)
2. `refund`
3. `order_confirmation`
4. `coupon_redeemed`
5. `supplier_new_order`

---

## 8. תבניות עברית RTL

### 8.1 מעטפת

```html
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{{title}}</title>
</head>
<body style="margin:0;background:#f5f5f5;font-family:Heebo,Arial,Helvetica,sans-serif;color:#333e48;direction:rtl;text-align:right;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="560" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e4e4e4;border-radius:4px;">
          <tr>
            <td style="background:#fed700;padding:16px 20px;font-weight:700;font-size:18px;color:#333e48;">
              KenyonExpress
            </td>
          </tr>
          <tr>
            <td style="padding:24px 20px;">
              {{body}}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 20px;font-size:12px;color:#768b9e;border-top:1px solid #e4e4e4;">
              {{footer}}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

כללים:

- תמיד `dir="rtl"` ו-`lang="he"`.
- קודים ומספרי הזמנה ב-`dir="ltr"` בתוך הקשר RTL.
- CTA: רקע `#fed700`, טקסט `#333e48` (או הפוך בעקביות באותו מייל).
- מבנה table למיילים; בלי צללים מרובי שכבות.
- Escape לכל מחרוזת דינמית.
- QR: `alt="קוד QR למימוש הקופון"`.

### 8.2 Subjects

| kind | subject |
|---|---|
| `order_confirmation` | ההזמנה שלך התקבלה · {{order_ref}} |
| `coupon_purchased` | הקופון שלך מוכן · {{product_name}} |
| `coupon_redeemed` | הקופון מומש · {{product_name}} |
| `supplier_new_order` | הזמנה חדשה ב-KenyonExpress · {{order_ref}} |
| `refund` | בוצע זיכוי להזמנה · {{order_ref}} |

### 8.3 גוף: אישור הזמנה

```text
שלום {{customer_name}},

התשלום התקבל וההזמנה שלך נקלטה.

מספר הזמנה: {{order_ref}}
סך הכל שולם באתר: {{total_ils}}

לפרטי ההזמנה: {{account_orders_url}}
```

### 8.4 גוף: קופון + QR

```text
שלום {{customer_name}},

הקופון "{{product_name}}" מוכן למימוש.

קוד: {{code}}
[QR image]

שולם באתר: {{paid_ils}}
יתרה לתשלום בבית העסק: {{due_ils}}
בתוקף עד: {{expires_at_he}}

הציגו את הקוד או את ה-QR בבית העסק.
לצפייה באזור האישי: {{account_coupons_url}}
```

### 8.5 גוף: מימוש

```text
שלום,

הקופון "{{product_name}}" מומש{{#if supplier}} בבית העסק {{supplier}}{{/if}}{{#if when}} ב-{{when}}{{/if}}.

קוד הקופון: {{code}}
{{#if collected}}נגבה בבית העסק: {{collected_ils}}{{/if}}

אם לא אתם מימשתם את הקופון, פנו אלינו מיד.

לכל הקופונים שלך: {{account_coupons_url}}
```

### 8.6 גוף: הזמנה לספק

```text
שלום {{supplier_name}},

התקבלה אצלכם הזמנה חדשה.

{{lines}}
סכום ההזמנה אצלכם: {{amount_ils}}
מספר הזמנה: {{order_ref}}

{{#if has_coupon}}
קופון נפדה בבית העסק בסריקת ה-QR, והיתרה נגבית מהלקוח במקום.
{{/if}}

{{#if physical}}
כתובת למשלוח:
{{address_block}}
{{/if}}

לניהול ההזמנות: {{supplier_orders_url}}
```

### 8.7 גוף: החזר

```text
שלום {{customer_name}},

בוצע זיכוי עבור הזמנה {{order_ref}}.

סכום הזיכוי: {{refund_ils}}
{{#if coupon_voided}}הקופון הקשור להזמנה בוטל ואינו ניתן למימוש.{{/if}}

הזיכוי יופיע בחשבון/בכרטיס לפי לוחות הזמנים של חברת האשראי.

לפרטי ההזמנה: {{order_url}}
```

### 8.8 איסורי נוסח

- Escrow, נאמן, "הכסף אצלנו עד…"
- עמלה קבועה כטקסט שיווקי
- הבטחת payout לספק
- חשיפת `platform_percent` ללקוח
- PAN / token / קישור עם service role

פוטר טרנזקציוני:

```text
הודעה זו קשורה לרכישה או לחשבון שלך ב-KenyonExpress.
להסרה מדיוור שיווקי: {{unsubscribe_marketing_url}}
```

---

## 9. העדפות ו-suppression

| נושא | ברירת מחדל | התנהגות |
|---|---|---|
| חמשת האירועים בליבה | on | Transactional; נשלחים גם בלי marketing opt-in |
| תזכורת פקיעה (משני) | on | מכבד כיבוי מפורש |
| Marketing | off | רק עם consent |

Suppression נבדק ב-enqueue וב-drain.  
Unsubscribe חתום (יעד):

```
/api/notifications/unsubscribe?u=…&t=…&sig=…&exp=…
```

Topics: `marketing`, `coupon_expiry`. לא חוסמים אישור רכישה/סריקה/החזר אלא אם opt-out טרנזקציונלי מפורש ונדיר.

---

## 10. אבטחה ו-ops

| כלל | פירוט |
|---|---|
| Secrets | רק Edge / server |
| Auth worker | Bearer `CRON_SECRET` → אחרת 401 |
| Payload | בלי `cardcom_token`, PAN, CVV |
| QR | לינק חתום או attachment; לא secret גולמי |
| Trigger errors | `RAISE WARNING` + return NEW |
| Ntfy/Sentry | DLQ insert, worker stall (אין drain 15 דק' ויש תור), Resend 429 מתמשך |

בריאות יומית (RUNBOOK): עומק `pending`, מספר `dead`, bounce ב-Resend.

---

## 11. מפת קבצים (יעד בלבד; לא ליישם במסמך זה)

```text
supabase/functions/notifications-worker/index.ts
supabase/functions/notifications-worker/templates/_layout.ts
supabase/functions/notifications-worker/templates/order-confirmation.ts
supabase/functions/notifications-worker/templates/coupon-purchased.ts
supabase/functions/notifications-worker/templates/coupon-redeemed.ts
supabase/functions/notifications-worker/templates/supplier-new-order.ts
supabase/functions/notifications-worker/templates/refund.ts
supabase/functions/notifications-worker/channels/resend.ts
supabase/migrations/0xx_notifications_align.sql
src/app/api/notifications/unsubscribe/route.ts
```

As-built לייחוס (main worktree; לא לערוך מכאן):

```text
supabase/migrations/095_notification_outbox.sql
src/app/api/cron/notifications/route.ts
src/lib/email/notifications.ts
src/lib/email/resend.ts
src/server/payments/voucher-email.ts
```

---

## 12. טסטים נדרשים

| # | בדיקה | צפי |
|---|---|---|
| T1 | הזמנה פיזית paid → `order_confirmation` + `supplier_new_order` | dedupe יציב ב-replay |
| T2 | הזמנת קופון → `coupon_purchased` עם QR; **בלי** `order_confirmation` כפול | |
| T3 | redeem → `coupon_redeemed` ללקוח (+ ספק) | אין כפילות ב-replay |
| T4 | refund מאושר → `refund` פעם אחת | |
| T5 | Resend 500 × 5 → `dead` + DLQ | |
| T6 | אותו `Idempotency-Key` פעמיים → מייל אחד אצל Resend | |
| T7 | bounce → suppression; enqueue הבא לא נשלח | |
| T8 | worker בלי Bearer → 401 | |
| T9 | HTML: `dir=rtl`, `lang=he`, בלי מילת Escrow | |
| T10 | Trigger זורק → הזמנה/redeem/refund עדיין מצליחים | |

---

## 13. Acceptance

- [ ] Resend + DB Trigger + Edge worker (או cron גשר זהה), בלי Make/Zapier
- [ ] אישור הזמנה ללקוח (בלי כפילות מול קופון+QR)
- [ ] רכישת קופון עם קוד + QR + שולם באתר + יתרה בעסק
- [ ] מימוש: אישור ללקוח (+ סיכום לספק)
- [ ] התראת הזמנה חדשה לספק בלי נוסח payout
- [ ] מייל החזר אחרי refund מאושר
- [ ] תבניות עברית RTL עם `#fed700` / `#333e48`
- [ ] Retry עם backoff + `dead` + DLQ + ops alert
- [ ] Idempotency: `dedupe_key` UNIQUE + Resend `Idempotency-Key`
- [ ] מסלול כסף לא מחכה ל-Resend

---

## 14. Out of scope

- קמפיינים שיווקיים (Marketing)
- Push native / WhatsApp כחובה ל-MVP (אופציונלי בהמשך)
- SMS כערוץ ראשי
- שינוי מודל כסף / ledger / Escrow
- שינוי קוד ב-worktree הראשי

---

## 15. Related

```
docs/ARCHITECTURE-NOTIFICATIONS-V2.md
docs/ARCHITECTURE-PERSONAL-AREA.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/ARCHITECTURE-MARKETING.md
docs/LEGAL-CHECKLIST.md
docs/RUNBOOK-OPERATIONS.md
docs/LAUNCH-DAY.md
```

---

## 16. Revision

| Date | Change |
|---|---|
| 2026-07-30 | V1: Resend + Trigger + Edge |
| 2026-07-31 | V2: WhatsApp, QR, 48h, unsubscribe |
| 2026-08-02 | מיזוג V2 לקובץ קנוני |
| 2026-08-03 | Rewrite: 3 ליבות + Escrow wording |
| 2026-08-03 | Full catalog: order confirmation, coupon+QR, redeemed, supplier new-order, refund; idempotency keys; retry/DLQ; RTL; docs-only in `docs/final-pack` |
