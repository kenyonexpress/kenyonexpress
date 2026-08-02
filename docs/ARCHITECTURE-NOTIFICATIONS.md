# ARCHITECTURE: Notifications

ארכיטקטורת התראות טרנזקציונליות ל-KenyonExpress: Resend + Supabase Edge Functions, תור outbox, תבניות עברית RTL, retry ו-DLQ.

Status: **BINDING** · Updated: 2026-08-03  
Scope: docs only (worktree `docs/final-pack`).  
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

עקרון: מסלול כסף לעולם לא מחכה לספק הודעות. Trigger/emit כותבים שורה; worker שולח אסינכרונית.

---

## 0. הכרעות מחייבות

| # | הכרעה |
|---|---|
| N1 | Email: **Resend**. אין SMTP מהדפדפן. אין Make/Zapier בייצור. |
| N2 | Emit: **Database Trigger** (או `SECURITY DEFINER` אחרי commit דומיין) → outbox. לא קריאה סינכרונית ל-Resend מ-`finalizeOrder` / redeem. |
| N3 | Drain יעד: **Supabase Edge Function** `notifications-worker`. גשר זמני מותר: Vercel cron לאותה סמנטיקה (`/api/cron/notifications`) עד ש-`pg_net` / schedule Edge יציב. |
| N4 | At-least-once enqueue; אפקט exactly-once ללקוח דרך `dedupe_key` UNIQUE + Resend `Idempotency-Key`. |
| N5 | תבניות **עברית RTL** (`lang=he`, `dir=rtl`). מותג: ink `#333e48`, yellow `#fed700`. |
| N6 | כסף ב-payload: **integer agorot**. בגוף המייל: ₪ עם `he-IL` ושתי ספרות. |
| N7 | קופון (Escrow פנימי 2026-07-27): במייל מופיעים **שולם באתר** + **יתרה בבית העסק**. אין נוסח "Escrow" / "נאמן" ללקוח. חלק המקדמה לספק ב-held עד מימוש; לא לכתוב לספק "קיבלתם payout". |
| N8 | Transactional לא דורש opt-in שיווקי. עדיין מכבדים suppression (bounce/complaint). שיווק = מסמך Marketing נפרד. |
| N9 | טבלת שוברים: `vouchers`. Trigger על שגיאה **בולע** (`EXCEPTION`) כדי לא להפיל תשלום או סריקה. |
| N10 | אחרי max attempts → סטטוס `dead` + שורת DLQ + התראת ops. אין drop שקט על אישור הזמנה / מכירת קופון / אישור סריקה. |

---

## 1. Stack

| רכיב | בחירה | אסור |
|---|---|---|
| Provider email | Resend API | SendGrid כברירת מחדל, SMTP מלקוח |
| Queue | `notification_outbox` (יעד יישור: `notifications_outbox` מ-031 אם/כשמיישרים) | שליחה בלי שורה עמידה |
| Emit | Trigger על `orders.paid_at` / `vouchers.status` | קריאה חוסמת מ-webhook Cardcom |
| Worker | Edge Function `notifications-worker` | Make, Zapier, n8n בייצור |
| WhatsApp (אופציונלי) | Meta Cloud API + templates מאושרים | גוף חופשי מחוץ לחלון שיחה |
| Secrets | Edge / Vercel server בלבד | `RESEND_API_KEY` בדפדפן |

סודות:

```
RESEND_API_KEY
RESEND_FROM
CRON_SECRET
SUPABASE_SERVICE_ROLE_KEY
UNSUBSCRIBE_SIGNING_SECRET
WHATSAPP_TOKEN
WHATSAPP_PHONE_NUMBER_ID
```

From מאומת (יעד):

```
KenyonExpress <noreply@kenyonexpress.co.il>
```

---

## 2. Pipeline

```text
Domain commit
  (paid_at set / voucher → redeemed / expiry job)
        │
        ▼
Trigger SECURITY DEFINER (swallows errors)
  → fn_enqueue_notification / fn_emit_notification_event
  → notification_outbox row (dedupe_key UNIQUE)
        │
        ▼
Edge Function notifications-worker
  Authorization: Bearer CRON_SECRET
  → claim due batch (FOR UPDATE SKIP LOCKED)
  → prefs + suppressions
  → render RTL template
  → Resend (Idempotency-Key = dedupe_key)
        │
        ├─ ok     → status = sent, sent_at
        ├─ 429/5xx → pending + next_attempt_at (backoff)
        ├─ permanent 4xx / no template → dead (+ DLQ)
        └─ suppressed → skipped (לא שורפים attempts)
```

כללים:

1. Cardcom webhook, `finalizeOrder`, ו-`redeem_voucher` מחזירים ללקוח/קופה מיד אחרי commit דומיין.
2. Worker רץ עם service role. הדפדפן לא מחזיק מפתחות.
3. Drain אחד מבחינה לוגית: Edge הוא היעד; cron Next הוא אותו חוזה עד מעבר מלא.

### 2.1 גשר as-built (לא מחליף את היעד)

בפרודקשן כיום (מיגרציה `095_notification_outbox.sql`):

| פריט | מצב |
|---|---|
| טבלה | `notification_outbox` |
| kinds | `order_paid`, `supplier_sale`, `voucher_redeemed` |
| Drain | `GET /api/cron/notifications` + Bearer `CRON_SECRET` |
| למה לא Edge עדיין | `pg_net` לא מותקן; העמידות באה מה-outbox, לא מה-transport |
| Retry | עד 5 ניסיונות; backoff `2 * 4^(attempts-1)` דקות; אז `dead` |

המסמך הזה מגדיר את **החוזה הארכיטקטוני**. יישור שמות (`notifications_outbox`, Edge schedule) הוא עבודת מיגרציה/ops נפרדת, לא שינוי כסף.

---

## 3. קטלוג אירועים (ליבה)

שלושת האירועים המחייבים ל-MVP התראות:

### 3.1 אישור הזמנה ללקוח

| שדה | ערך |
|---|---|
| Event | `order.paid` / kind חי: `order_paid` |
| נמען | לקוח (`profiles.email`) |
| ערוץ | email (חובה); WhatsApp אופציונלי לפי prefs |
| Emit | `AFTER UPDATE OF paid_at` כש-`paid_at` עובר מ-null לערך |
| Dedupe | `order_paid:{order_id}` |

תוכן חובה:

- מספר הזמנה קצר (8 תווים ראשונים של id, uppercase)
- סך שולם באתר (agorot → ₪)
- קישור ל-`/account/orders`
- אם ההזמנה הנפיקה קופונים: **לא** לשלוח מייל אישור גנרי בנוסף למייל קופון/QR (כפילות). מייל הקופון הוא האישור.

נושא לדוגמה:

```
ההזמנה שלך התקבלה · {ORDER_REF}
```

### 3.2 הודעת קופון / מכירה לספק

| שדה | ערך |
|---|---|
| Event | `supplier.sale` / kind חי: `supplier_sale` |
| נמען | `suppliers.contact_email` (או בעלים/מנהלים מ-`supplier_members`; לא scanner כברירת מחדל) |
| ערוץ | email |
| Emit | אותו trigger של `paid_at`: **שורה אחת לספק להזמנה**, לא לכל שורה |
| Dedupe | `supplier_sale:{order_id}:{supplier_id}` |

תוכן חובה:

- "מכירה חדשה" / "נמכר קופון" לפי `product_type`
- שם מוצר/ים + כמות
- מזהה הזמנה קצר
- קישור לפורטל ספק (`/supplier/orders`)

איסורים:

- אין "קיבלתם תשלום מהפלטפורמה" / סכום payout
- אין הבטחת תאריך העברה
- מותר "סכום ההזמנה אצלכם" כערך שורות (לא עמלה, לא held)
- לקופון: להזכיר שמימוש ב-QR ושיתרה נגבית בקופה

נושא לדוגמה:

```
מכירה חדשה ב-KenyonExpress · הזמנה {ORDER_REF}
```

או לקטלוג תבניות מורחב:

```
נמכר קופון · {PRODUCT_NAME_HE}
```

### 3.3 אישור סריקה (מימוש קופון)

| שדה | ערך |
|---|---|
| Event | `coupon.redeemed` / kind חי: `voucher_redeemed` |
| נמען ליבה | **לקוח** (אבטחה: לדעת שהקופון מומש) |
| נמען משני | ספק (סיכום סריקה; יעד מלא; חי כיום: לקוח בלבד מ-095) |
| Emit | `AFTER UPDATE OF status` על `vouchers` כשסטטוס עובר ל-`redeemed` |
| Dedupe לקוח | `voucher_redeemed:{voucher_id}` |
| Dedupe ספק (יעד) | `voucher_redeemed:{voucher_id}:supplier:email` |

תוכן ללקוח (חובה):

- שם מוצר
- שם בית העסק
- תאריך/שעה בעברית (`he-IL`, `Asia/Jerusalem`)
- קוד (מעוצב/מרווח; לא לשלוח סוד חתימת QR)
- סכום שנגבה בבית העסק אם > 0
- משפט: אם לא אתם מימשתם, פנו מיד
- קישור ל-`/account/coupons`

נושא:

```
הקופון מומש · {PRODUCT_NAME}
```

תוכן לספק (יעד):

- מוצר, קוד מקוצר, שעת סריקה, `collected_agorot` שהעסק גבה
- בלי PII מיותר של הלקוח

---

## 4. אירועים משניים (לא חוסמים MVP)

| אירוע | נמען | הערה |
|---|---|---|
| `customer.coupon_issued` | לקוח | קוד + QR + שולם באתר + יתרה בעסק + תוקף (מסלול `voucher-email` / תבנית ייעודית) |
| `coupon.expiry_48h` | לקוח | תזכורת לפני `expires_at`; מכבד prefs |
| `order.physical_supplier_alert` | ספק | שורות פיזיות + כתובת; `platform_percent` רק מסנאפשוט `order_items` |
| `order.refunded` | לקוח | אחרי זיכוי מאושר |
| marketing | לקוח | רק עם consent; ראה Marketing |

תזכורת 48ש: job שעתי `fn_enqueue_coupon_expiry_48h()` על `vouchers` בסטטוס `issued` בחלון 48ש, dedupe `coupon.expiry_48h:{voucher_id}`.

---

## 5. סכימה

### 5.1 טבלאות

| טבלה | תפקיד |
|---|---|
| `notification_outbox` (חי) / `notifications_outbox` (יעד 031) | תור שליחה |
| `notification_events` (יעד) | עובדות דומיין append-only לפני fan-out |
| `notification_templates` (יעד) | גרסאות RTL לפי `template_key, channel, locale` |
| `notification_delivery_events` | webhooks Resend/Meta |
| `notification_delivery_dlq` | עותק סופי אחרי `dead` |
| `email_suppressions` / `channel_suppressions` | bounce, complaint, stop |
| `user_notification_preferences` | דגלי ערוץ/נושא |
| `consent_events` | ראיות unsubscribe / 30א |

### 5.2 עמודות outbox קריטיות

```text
id                  uuid PK
kind                text   -- order_paid | supplier_sale | voucher_redeemed | …
recipient_email     text
payload             jsonb  -- קפוא ברגע ה-emit
dedupe_key          text UNIQUE
status              text   -- pending | sent | failed | dead | skipped
attempts            int
last_error          text
next_attempt_at     timestamptz
created_at          timestamptz
sent_at             timestamptz
provider_message_id text   -- יעד
```

Payload כסף (agorot), דוגמאות:

```json
{
  "order_id": "…",
  "order_ref": "A1B2C3D4",
  "total_agorot": 20900,
  "amount_agorot": 15900,
  "collected_agorot": 5000,
  "product_name": "…",
  "lines": [{ "product_name": "…", "quantity": 1, "product_type": "coupon" }]
}
```

### 5.3 RLS

| אובייקט | authenticated | admin | service |
|---|---|---|---|
| outbox | אין | SELECT | ALL (drain) |
| DLQ | אין | SELECT | ALL |
| prefs | own R/W | ALL | ALL |
| templates | אין | ALL | ALL |

Outbox מחזיק כתובות של אחרים: אין policy ללקוח/ספק.

---

## 6. Edge Function: `notifications-worker`

### 6.1 כניסה

```http
POST /functions/v1/notifications-worker
Authorization: Bearer {CRON_SECRET}
```

Schedule: כל דקה (Supabase cron או מתזמן חיצוני).  
גשר מקביל מותר:

```
GET /api/cron/notifications
```

אותה סמנטיקת claim/send/retry. לא שני תורים.

### 6.2 אלגוריתם

```text
1. assertAuth Bearer CRON_SECRET → else 401
2. claim batch (limit 25–50): status=pending AND next_attempt_at <= now()
   העדפה: fn_claim_notification_batch + FOR UPDATE SKIP LOCKED
3. לכל שורה:
   a. אין template ל-kind → dead + last_error (בלי לבזבז 5 ניסיונות)
   b. suppression על האימייל → skipped
   c. render RTL (html + text)
   d. POST Resend עם Idempotency-Key = dedupe_key
   e. ok → sent
   f. skipped (אין API key בסביבה) → לא להעלות attempts
   g. כשל זמני → attempts++, next_attempt_at = now + backoff
   h. attempts >= MAX → dead + insert DLQ + ops alert
4. החזר JSON: { claimed, sent, failed, dead, skipped }
```

### 6.3 Resend

```http
POST https://api.resend.com/emails
Authorization: Bearer {RESEND_API_KEY}
Idempotency-Key: {dedupe_key}
```

Body: `from`, `to`, `subject`, `html`, `text`.  
Webhook Resend → `delivered` / `bounced` / `complained` → עדכון delivery + suppression.

### 6.4 למה Edge (יעד) ולא רק cron

| יתרון | משמעות |
|---|---|
| קרוב ל-DB | latency נמוך על claim |
| Schedule עצמאי | לא תלוי בפריסת Vercel בלבד |
| Secrets ב-Supabase | הפרדה מ-Next runtime |

העמידות האמיתית נשארת ב-outbox: תהליך שמת בזמן שליחה משאיר שורה `pending` לניסיון הבא.

---

## 7. Retry + DLQ

### 7.1 מדיניות retry

| ניסיון (attempts אחרי כשל) | השהיה עד next_attempt_at |
|---|---|
| 1 | 2 דקות |
| 2 | 8 דקות |
| 3 | 32 דקות |
| 4 | 128 דקות |
| 5 | `dead` (אין ניסיון שישי אוטומטי) |

נוסחה (as-built):

```text
backoff_minutes = 2 * 4^(attempts - 1)
MAX_ATTEMPTS = 5
```

סיווג שגיאות:

| סוג | פעולה |
|---|---|
| 429, 5xx, timeout, network | retry + backoff |
| 400 כתובת לא חוקית, domain rejected | `dead` מיידי (או `skipped`) |
| אין API key | `skipped` ברמת ריצה; לא שורפים attempts על כל התור |
| kind לא ידוע | `dead` מיידי |

### 7.2 DLQ

אחרי מעבר ל-`dead`:

1. Insert ל-`notification_delivery_dlq` (עותק: outbox_id, kind, recipient, payload, last_error, attempts, failed_at).
2. התראת ops (Ntfy / Sentry): כל insert, או כשעומק DLQ ≥ 25.
3. Replay ידני מאדמין: איפוס ל-`pending`, `attempts=0`, `next_attempt_at=now()`, כתיבת `audit_log`.
4. אסור למחוק שורות DLQ של `order_paid` / `supplier_sale` / `voucher_redeemed` בלי אישור ops.

### 7.3 Claim בטוח

שני workers במקביל לא שולחים את אותה שורה פעמיים:

- `FOR UPDATE SKIP LOCKED` ב-claim, או
- עדכון אטומי `pending → sending` עם תנאי `WHERE status = 'pending'`

Resend Idempotency-Key = רשת ביטחון שנייה אם שליחה כפולה בכל זאת קרתה.

---

## 8. תבניות עברית RTL

### 8.1 מעטפת מייל

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

- תמיד `dir="rtl"` על מעטפת ועל בלוק התוכן.
- מספרי הזמנה וקודי קופון ב-`dir="ltr"` בתוך הקשר RTL.
- CTA: רקע `#fed700`, טקסט `#333e48`, או הפוך (רקע ink, טקסט צהוב) לפי מסך; עקביות בתוך אותו מייל.
- אין כרטיסי צל מרובי שכבות; מבנה table למיילים.
- QR: PNG מצורף / `cid` או קישור חתום ל-`/account/coupons`. לא לשלוח `VOUCHER_QR_SECRET`.
- Escape לכל מחרוזת דינמית ב-HTML.

### 8.2 נושאים (subjects)

| kind / template | subject |
|---|---|
| `order_paid` | ההזמנה שלך התקבלה · {{order_ref}} |
| `supplier_sale` | מכירה חדשה ב-KenyonExpress · הזמנה {{order_ref}} |
| `voucher_redeemed` | הקופון מומש · {{product_name}} |
| `customer.coupon_issued` (יעד) | הקופון שלך מוכן |
| `customer.coupon_expiry_48h` (יעד) | תזכורת: הקופון שלך פג תוך 48 שעות |

### 8.3 גוף: אישור הזמנה (לקוח)

```text
שלום {{customer_name}},

התשלום התקבל וההזמנה שלך נקלטה.

מספר הזמנה: {{order_ref}}
סך הכל שולם באתר: {{total_ils}}

לפרטי ההזמנה: {{account_orders_url}}
```

### 8.4 גוף: הודעה לספק

```text
שלום {{supplier_name}},

התקבלה אצלכם מכירה חדשה.

{{lines}}
סכום ההזמנה אצלכם: {{amount_ils}}
מספר הזמנה: {{order_ref}}

{{#if has_coupon}}
קופון נפדה בבית העסק בסריקת ה-QR, והיתרה נגבית מהלקוח במקום.
{{/if}}

לניהול ההזמנות: {{supplier_orders_url}}
```

### 8.5 גוף: אישור סריקה (לקוח)

```text
שלום,

הקופון "{{product_name}}" מומש{{#if supplier}} בבית העסק {{supplier}}{{/if}}{{#if when}} ב-{{when}}{{/if}}.

קוד הקופון: {{code}}
{{#if collected}}נגבה בבית העסק: {{collected_ils}}{{/if}}

אם לא אתם מימשתם את הקופון, פנו אלינו מיד.

לכל הקופונים שלך: {{account_coupons_url}}
```

### 8.6 איסורי נוסח

- Escrow, נאמן, "הכסף אצלנו עד…"
- עמלה קבועה (5%/10%) כטקסט שיווקי
- הבטחת payout לספק
- חשיפת `platform_percent` ללקוח
- PAN / token / קישור עם service role

---

## 9. העדפות, suppression, unsubscribe

| נושא | ברירת מחדל | התנהגות |
|---|---|---|
| אישור הזמנה / קופון / סריקה | on | Transactional; נשלח גם בלי marketing opt-in |
| תזכורת פקיעה | on (email) | מכבד כיבוי מפורש |
| Marketing | off | רק עם consent + suppression נקי |

Suppression נבדק ב-enqueue (לא לכתוב שורה לכתובת מתה) ושוב ב-drain.

Unsubscribe (יעד):

```
/api/notifications/unsubscribe?u=…&t=…&sig=…&exp=…
```

Topics: `marketing`, `coupon_expiry` (לא חוסם אישור רכישה/סריקה אלא אם opt-out טרנזקציונלי מפורש ונדיר).  
כל פעולה → `consent_events`.

פוטר:

```text
הודעה זו קשורה לרכישה או לחשבון שלך.
להסרה מתזכורות קופון: {{unsubscribe_expiry_url}}
להסרה מדיוור שיווקי: {{unsubscribe_marketing_url}}
```

---

## 10. אבטחה ו-ops

| כלל | פירוט |
|---|---|
| Secrets | רק Edge / server |
| Auth worker | Bearer `CRON_SECRET`; בלי זה 401 |
| Payload | בלי `cardcom_token`, PAN, CVV |
| PII | מינימום; קוד קופון מלא רק לנמען הלגיטימי |
| Trigger errors | `RAISE WARNING` + return NEW; לא rollback דומיין |
| Ntfy / Sentry | DLQ insert, worker stall (אין drain 15 דק' ויש תור), Resend 429 מתמשך |

בדיקת בריאות יומית (ראה RUNBOOK): עומק `pending`, מספר `dead`, bounce ב-Resend.

---

## 11. מפת קבצים

### 11.1 יעד

```text
supabase/functions/notifications-worker/index.ts
supabase/functions/notifications-worker/templates/_layout.ts
supabase/functions/notifications-worker/templates/order-paid.ts
supabase/functions/notifications-worker/templates/supplier-sale.ts
supabase/functions/notifications-worker/templates/voucher-redeemed.ts
supabase/functions/notifications-worker/channels/resend.ts
supabase/migrations/0xx_notifications_align.sql
src/app/api/notifications/unsubscribe/route.ts
```

### 11.2 As-built (לייחוס; לא לשנות במסמך זה)

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
| T1 | הזמנה פיזית `paid_at` → outbox `order_paid` + `supplier_sale` | dedupe יציב ב-replay |
| T2 | הזמנת קופון → אין כפילות `order_paid` אם נשלח מייל QR | לקוח מקבל אישור אחד |
| T3 | redeem → `voucher_redeemed` ללקוח | אין כפילות ב-replay |
| T4 | Resend 500 × 5 → `dead` + DLQ | |
| T5 | bounce → suppression; enqueue הבא לא נכתב / drain skipped | |
| T6 | Edge/cron בלי Bearer → 401 | |
| T7 | HTML: `dir=rtl`, `lang=he`, בלי מילת Escrow | |
| T8 | Trigger זורק בתוך הבלוק → הזמנה/redeem עדיין מצליחים | |

---

## 13. Acceptance

- [ ] Resend + Trigger + Edge worker (או cron גשר עם אותה סמנטיקה), בלי Make/Zapier
- [ ] אישור הזמנה ללקוח על הזמנה בלי כפילות מול מייל קופון
- [ ] הודעת מכירה/קופון לספק בלי נוסח payout
- [ ] אישור סריקה ללקוח (וספק ביעד)
- [ ] תבניות עברית RTL עם מותג `#fed700` / `#333e48`
- [ ] Retry עם backoff + `dead` + DLQ + התראת ops
- [ ] Idempotency: `dedupe_key` + Resend Idempotency-Key
- [ ] Suppression / unsubscribe מכבדים; transactional רכישה/סריקה לא נחסם על ידי marketing off
- [ ] מסלול כסף לא מחכה ל-Resend

---

## 14. Out of scope

- קמפיינים שיווקיים (Marketing)
- Push native באפליקציה (Mobile App)
- SMS כערוץ ראשי
- שינוי מודל כסף / ledger / Escrow

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
| 2026-07-30 | V1: Resend + Trigger + Edge, קטלוג בסיסי |
| 2026-07-31 | V2: WhatsApp, QR, 48h, unsubscribe |
| 2026-08-02 | מיזוג V2 לקובץ קנוני (worktree קודם) |
| 2026-08-03 | כתיבה מחדש ב-`docs/final-pack`: ליבת 3 אירועים, Escrow 2026-07-27, retry/DLQ, Edge יעד + גשר cron 095 |
