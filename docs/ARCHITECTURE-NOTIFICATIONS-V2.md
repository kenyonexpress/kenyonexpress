# ARCHITECTURE-NOTIFICATIONS-V2.md

ארכיטקטורת התראות **V2** למודל הסופי של KenyonExpress.

Status: BINDING · supersedes thinner drafts where they conflict · worktree

```
/Users/ofir/kenyonexpress-web/ke-arch-notifications-v2
```

branch:

```
arch/notifications-v2
```

Date: 2026-07-31  
Scope: **docs בלבד.** אין שינוי קוד ב-repo הראשי במסגרת המסמך הזה.

Companions:

- `ke-arch-notifications/docs/ARCHITECTURE-NOTIFICATIONS.md` (V1 Resend+Edge; V2 מרחיב אירועים + WhatsApp + unsubscribe)
- `docs/ARCHITECTURE-NOTIFICATIONS.md` ב-main (draft ישן; **לא** מקור אמת אם סותר)
- checkout / voucher / account-area arch docs
- מיגרציות עוגן: `029_accounts.sql`, `031_notifications.sql` (+ מיגרציית יישור עתידית)

## Stack מחייב (סופי)

| רכיב | בחירה | אסור |
|---|---|---|
| Email | **Resend** API | SMTP ידני מהדפדפן, SendGrid כברירת מחדל |
| Emit | **Supabase Database Trigger** / `SECURITY DEFINER` emit אחרי commit דומיין | קריאה סינכרונית ל-Resend מ-`finalizeOrder` |
| Drain | **Supabase Edge Function** `notifications-worker` (+ אופציה: Vercel cron לאותו קוד) | **Make.com**, **Zapier**, n8n כמסלול ייצור |
| WhatsApp | Meta Cloud API / ספק מאושר עם תבניות מאושרות מראש | שליחה חופשית בלי template |
| תזמון תזכורות | `pg_cron` / Edge cron שקורא `fn_enqueue_coupon_expiry_48h` | Zapier schedule |

סודות רק ב-Edge / Vercel server:

```
RESEND_API_KEY
RESEND_FROM
WHATSAPP_TOKEN (או ספק)
WHATSAPP_PHONE_NUMBER_ID
CRON_SECRET
SUPABASE_SERVICE_ROLE_KEY
NTFY_* (אופציונלי ל-DLQ אדמין)
UNSUBSCRIBE_SIGNING_SECRET
```

---

## 0. הכרעות מחייבות

| # | הכרעה |
|---|---|
| N1 | מסלול כסף **לא מחכה** לספק הודעות. רק emit/fanout. |
| N2 | At-least-once enqueue; exactly-once אפקט ללקוח דרך `dedupe_key` / `idempotency_key` + Resend `Idempotency-Key`. |
| N3 | תבניות **RTL עברית**, Heebo/stack בטוח למייל, מותג `#fed700` / ink `#333e48`. |
| N4 | קופון: אין Escrow בנוסח; שולם באתר נשאר בפלטפורמה; יתרה בבית העסק. |
| N5 | התראת ספק על רכישת קופון = תפעולית ("נמכר קופון"), **בלי** סכום payout. |
| N6 | תזכורת פקיעה: **48 שעות** לפני `expires_at` (V2 מחייב; 7d אופציונלי משני). |
| N7 | Transactional לא דורש opt-in שיווקי; עדיין מכבדים suppression (bounce/complaint) ו-unsubscribe לנושאים שאינם חובה חוקית. |
| N8 | טבלת שוברים הקנונית להתראות: `vouchers` (לא לכתוב מחדש ל-`coupon_codes`). |
| N9 | אין Make/Zapier בייצור. אם קיים automation חיצוני: לנתק. |

---

## 1. Pipeline

```
Domain commit
  (finalizeOrder / redeem_voucher / expiry cron / physical paid)
        │
        ▼
AFTER TRIGGER or fn_emit_notification_event
  → notification_events (dedupe_key UNIQUE, payload jsonb)
        │
        ▼
fn_fanout_notification_events
  → notifications_outbox  (או notification_log ב-V1 naming)
     שורה לכל (recipient × channel × template)
        │
        ▼
Edge Function notifications-worker  (Bearer CRON_SECRET)
  → claim batch → render RTL → Resend / WhatsApp
  → sent | retry | skipped | dead
        │
        ├─ retry: backoff next_attempt_at
        └─ dead: DLQ row + Ntfy אדמין
```

שמות טבלאות: ליישר ל-`031` (`notifications_outbox`) כמקור סכימה; אם V1 הציע `notification_log`, זה alias לוגי לאותו תפקיד. מיגרציית יישור אחת, לא שתי מערכות מקבילות.

---

## 2. קטלוג אירועים (V2 מחייב)

### 2.1 רכישת קופון (`coupon.purchased` / אחרי issue ב-finalize)

| נמען | ערוץ | template_key | תוכן חובה |
|---|---|---|---|
| לקוח | email | `customer.coupon_issued` | אישור, שם מוצר, קוד, **QR** (cid/attachment או קישור חתום ל-`/account/coupons`), שולם באתר, יתרה בעסק, תוקף |
| לקוח | whatsapp | `customer.coupon_issued_wa` | תבנית Meta: קוד + לינק QR/חשבון + תוקף |
| ספק | email | `supplier.coupon_sold` | "נמכר קופון" + שם מוצר + מזהה הזמנה קצר; **בלי** סכום לתשלום מהפלטפורמה |
| ספק | whatsapp (אופציונלי prefs) | `supplier.coupon_sold_wa` | אותו מסר קצר |

Emit: אחרי `issueVoucher` / מעבר voucher ל-`issued` תחת הזמנה `paid`.  
Dedupe: `coupon.purchased:{voucher_id}:customer:email` וכו'.

### 2.2 סריקת קופון (`coupon.redeemed`)

| נמען | ערוץ | template_key | תוכן |
|---|---|---|---|
| לקוח | email (+ wa אם opted) | `customer.coupon_redeemed` | אישור מימוש, שם עסק, תאריך, תזכורת שיתרה שולמה בעסק |
| ספק | email (+ wa) | `supplier.coupon_redeemed` | סיכום: קוד (מקוצר), מוצר, שעת סריקה, `collect_amount` שהעסק גבה |

Emit: מתוך `redeem` route אחרי הצלחה (לא replay).  
Dedupe: `coupon.redeemed:{voucher_id}:customer:email`.

### 2.3 קופון פג בקרוב (`coupon.expiry_48h`)

| נמען | ערוץ | template_key | תוכן |
|---|---|---|---|
| לקוח | email | `customer.coupon_expiry_48h` | תזכורת, ימי/שעות נותרים, קישור לקופון + QR |
| לקוח | whatsapp אם `coupon_expiry_whatsapp` | `customer.coupon_expiry_48h_wa` | תבנית Meta קצרה |

Enqueue: job כל שעה:

```
fn_enqueue_coupon_expiry_48h()
```

בוחר `vouchers` בסטטוס `issued`,  
`expires_at` בין עכשיו ל-+48h,  
עדיין לא נשלח (dedupe `coupon.expiry_48h:{voucher_id}`).

לא שולחים אם כבר `used` / `expired` / `refunded`.

### 2.4 מוצר פיזי: הזמנה לספק לשליחה (`order.physical_supplier_alert`)

| נמען | ערוץ | template_key | תוכן |
|---|---|---|---|
| ספק | email (חובה) | `supplier.new_order_physical` | שורות פיזיות בלבד, כתובת משלוח, קישור לפורטל ספק |
| ספק | whatsapp/SMS אופציונלי | `supplier.new_order_physical_wa` | התראה קצרה + לינק |

Emit: כש-`orders.paid_at` נקבע ויש לפחות שורת `product_type = physical` לספק.  
Dedupe: `order.physical:{order_id}:{supplier_id}:email`.

ללקוח על אותה הזמנה: אפשר למזג ל-`customer.order_paid` (לא חובה כפול עם קופון).

### 2.5 אירועים מחוץ לליבת V2 (לא חוסמים)

- `customer.order_paid` / קבלה
- `order.refunded`
- `supplier.payout_transferred` (פיזי בלבד; לא קופון)
- marketing journeys: מסמך נפרד

---

## 3. סכימה (חוזה V2 על בסיס 029/031)

### 3.1 טבלאות ליבה

| טבלה | תפקיד |
|---|---|
| `notification_events` | עובדות דומיין, append-only, `dedupe_key UNIQUE` |
| `notifications_outbox` | תור שליחה per channel |
| `notification_templates` | גרסאות RTL per `template_key, channel, locale` |
| `notification_delivery_events` | webhooks Resend/Meta |
| `notification_delivery_dlq` | עותק סופי אחרי max attempts |
| `user_notification_preferences` | דגלי ערוץ/נושא |
| `consent_events` | ראיות 30א / unsubscribe |
| `channel_suppressions` | bounce, complaint, stop |

סטטוסי outbox:

```
queued → sending → sent
                 → retry → … → dead
                 → skipped   (suppressed / no consent / missing phone)
```

### 3.2 עמודות outbox קריטיות

```
id, event_id, template_id, template_key,
channel ('email'|'whatsapp'|'sms'|'inapp'),
locale ('he'),
recipient_user_id, recipient_email, recipient_phone_e164,
status, attempt_count, next_attempt_at, last_error,
provider_message_id, dedupe_key UNIQUE,
payload jsonb, created_at, updated_at, sent_at
```

### 3.3 Retry + DLQ

| ניסיון | השהיה |
|---|---|
| 1 | מיידי |
| 2 | 2 דק׳ |
| 3 | 4 דק׳ |
| 4 | 8 דק׳ |
| 5 | 16 דק׳ |
| 6 | 32 דק׳ ואז `dead` + שורת DLQ |

שגיאות 4xx קבועות (כתובת לא חוקית, template WhatsApp נדחה): `skipped` או `dead` בלי backoff מלא.  
שגיאות 429/5xx: retry.

אחרי `dead`: Ntfy/admin alert (SEV2), לא לולאת שליחה אינסופית.

---

## 4. Triggers ו-Emit

### 4.1 כללים

1. Trigger `AFTER UPDATE/INSERT` על טבלאות דומיין, או קריאה מפורשת מ-finalize אחרי commit (העדפה: trigger כדי שלא ישכחו).
2. `fn_emit_notification_event(event_type, entity_type, entity_id, user_id, payload)` אידמפוטנטי על `dedupe_key`.
3. Fan-out נפרד (`fn_fanout_notification_events` או worker ראשון שעושה fanout) כדי שה-trigger יישאר קצר.

### 4.2 מיפוי דומיין → אירוע

| מקור | תנאי | event_type |
|---|---|---|
| `orders.paid_at` set | יש שורות coupon שהונפקו | `coupon.purchased` (פר voucher או פר order_item) |
| `orders.paid_at` set | יש שורות physical | `order.physical_supplier_alert` |
| `vouchers.status` → `used` | redeem הצלחה | `coupon.redeemed` |
| cron hourly | issued, expires in 48h | `coupon.expiry_48h` |

Payload מינימלי (בלי PII מיותר; אימייל/טלפון נשלפים ב-fanout):

```json
{
  "order_id": "…",
  "voucher_id": "…",
  "supplier_id": "…",
  "product_name_he": "…",
  "code": "…",
  "expires_at": "…",
  "coupon_price_agorot": 5000,
  "remaining_due_agorot": 15000,
  "qr_url": "https://…/account/coupons?v=…"
}
```

QR במייל: העדפה ל-PNG מצורף/`cid` או לינק חתום קצר. לא לשלוח סוד `VOUCHER_QR_SECRET` ללקוח.

---

## 5. Edge Function: `notifications-worker`

### 5.1 כניסה

```
POST /functions/v1/notifications-worker
Authorization: Bearer $CRON_SECRET
```

Schedule: כל דקה (Supabase cron / external).  
אותו handler יכול לרוץ מ-

```
POST /api/cron/notifications-worker
```

ב-Next אם רוצים כפילות גיאוגרפית; **קוד drain אחד**.

### 5.2 אלגוריתם

```
1. assertAuth Bearer
2. rpc fn_claim_notification_batch(limit=25)  -- FOR UPDATE SKIP LOCKED
3. לכל שורה:
   a. טען prefs + suppressions → skipped אם חסום
   b. טען template פעיל (he)
   c. render RTL (email HTML / WA components)
   d. email → Resend עם Idempotency-Key = outbox.id
      wa → Meta template send עם client idempotency
   e. הצלחה → sent + provider_message_id
   f. כשל → retry או dead+DLQ
4. החזר { claimed, sent, retried, dead, skipped }
```

### 5.3 Resend

```
POST https://api.resend.com/emails
Authorization: Bearer RESEND_API_KEY
Idempotency-Key: <outbox.id>
```

From: `KenyonExpress <noreply@kenyonexpress.co.il>` (או דומיין מאומת).  
Webhook Resend → `notification_delivery_events` (delivered/bounced/complained) → suppression.

### 5.4 WhatsApp

- רק template names מאושרים ב-Meta (`whatsapp_template_name` ב-`notification_templates`).
- גוף חופשי אסור מחוץ לחלון שיחה.
- מספר יעד: E.164 מ-`profiles.phone`; חסר טלפון → `skipped` על ערוץ wa בלבד (מייל עדיין נשלח).

---

## 6. תבניות RTL בעברית

### 6.1 מעטפת מייל

```html
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width" />
  <title>{{title}}</title>
</head>
<body style="margin:0;background:#f5f5f5;font-family:Heebo,Arial,sans-serif;color:#333e48;direction:rtl;text-align:right;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="560" style="max-width:560px;background:#ffffff;border:1px solid #e4e4e4;border-radius:4px;">
        <tr><td style="background:#fed700;padding:16px 20px;font-weight:700;font-size:18px;">
          KenyonExpress
        </td></tr>
        <tr><td style="padding:24px 20px;">
          {{body}}
        </td></tr>
        <tr><td style="padding:16px 20px;font-size:12px;color:#768b9e;border-top:1px solid #e4e4e4;">
          {{footer}}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
```

כללים:

- `dir="rtl"`, `lang="he"`, יישור ימין.
- סכומים: `₪` + `he-IL` שני עשרונים מ-agorot.
- אין "Escrow" / "נאמן" / "10% עכשיו" כנוסח קשיח.
- CTA: רקע `#333e48`, טקסט `#fed700`, או הפוך לצהוב מלא לפי המותג.
- תמונות QR עם alt בעברית.

### 6.2 נושאים (subject) מחייבים

| template_key | subject |
|---|---|
| `customer.coupon_issued` | הקופון שלך מוכן |
| `customer.coupon_redeemed` | הקופון מומש בהצלחה |
| `customer.coupon_expiry_48h` | תזכורת: הקופון שלך פג תוך 48 שעות |
| `supplier.coupon_sold` | נמכר קופון · {{product_name_he}} |
| `supplier.coupon_redeemed` | קופון נסרק · {{product_name_he}} |
| `supplier.new_order_physical` | הזמנה חדשה למשלוח · {{order_short}} |

### 6.3 גוף לדוגמה: לקוח אחרי רכישת קופון (חוזה תוכן)

```
שלום {{customer_first_name}},

הקופון "{{product_name_he}}" מוכן למימוש.

קוד: {{code}}
[QR]
שולם באתר: {{paid_ils}}
יתרה לתשלום בבית העסק: {{due_ils}}
בתוקף עד: {{expires_at_he}}

הציגו את הקוד או את ה-QR בבית העסק.
לצפייה באזור האישי: {{account_coupons_url}}
```

### 6.4 גוף לדוגמה: ספק הזמנה פיזית

```
שלום {{supplier_name}},

התקבלה הזמנה פיזית חדשה ({{order_short}}).
נא להכין למשלוח.

{{lines_table}}
כתובת: {{address_block}}

לפורטל הספק: {{supplier_portal_url}}
```

---

## 7. העדפות, הסכמה, Unsubscribe

### 7.1 העדפות (`user_notification_preferences`)

| דגל | ברירת מחדל | משמעות |
|---|---|---|
| `order_updates_email` | true | אישורי הזמנה/קופון במייל (transactional) |
| `order_updates_whatsapp` | false | אותו דבר ב-WA (דורש טלפון) |
| `coupon_expiry_email` | true | תזכורת 48ש |
| `coupon_expiry_whatsapp` | false | תזכורת 48ש ב-WA |
| `marketing_*` | false | שיווק בלבד |

Transactional קריטי (אישור רכישה, QR): נשלח גם אם marketing כבוי, אלא אם:

- suppression קשיח (complaint/bounce), או
- המשתמש כיבה במפורש `order_updates_email` (נדיר; UI מזהיר).

תזכורת 48ש: מכבדת `coupon_expiry_*`.

התראות ספק: לפי אימייל/טלפון ספק בטבלת `suppliers` + prefs ספק (לא `auth.users` של לקוח).

### 7.2 Unsubscribe

מסלולים:

1. קישור חתום בפוטר מייל (HMAC עם `UNSUBSCRIBE_SIGNING_SECRET`, TTL ארוך):

```
/api/notifications/unsubscribe?u=<user_id>&t=<topic>&sig=<hmac>&exp=<ts>
```

topics: `marketing`, `coupon_expiry`, `whatsapp_all` (לא חוסם אישור רכישה אלא אם topic=`transactional_optout` מפורש ונדיר).

2. `fn_unsubscribe_marketing` / `fn_set_marketing_consent` מ-031.
3. Resend/Meta complaint webhook → `channel_suppressions`.
4. דף `/account` (או prefs) למתגי ערוץ.

כל פעולת unsubscribe כותבת `consent_events` (ראיה).

פוטר מייל (עברית):

```
הודעה זו קשורה לרכישה או לחשבון שלך.
להסרה מתזכורות קופון: {{unsubscribe_expiry_url}}
להסרה מדיוור שיווקי: {{unsubscribe_marketing_url}}
```

---

## 8. אבטחה ו-RLS

| אובייקט | לקוח | אדמין | Service |
|---|---|---|---|
| `notification_events` | אין | SELECT | ALL |
| `notifications_outbox` | אין (או SELECT own inapp בלבד) | SELECT | ALL |
| `notification_delivery_dlq` | אין | SELECT | ALL |
| `notification_templates` | אין | ALL | ALL |
| `user_notification_preferences` | SELECT/UPDATE own | ALL | ALL |
| `consent_events` | SELECT own | SELECT | INSERT |

- אין `RESEND_API_KEY` בדפדפן.
- Edge דוחה בלי Bearer.
- Payload לא כולל `cardcom_token` / PAN.
- לינקי QR חתומים; לא חושפים service role.

---

## 9. אינטגרציה עם checkout / redeem (בלי לחכות)

```
finalizeOrder success
  → DB triggers emit events
  → return to client immediately

redeem success
  → emit coupon.redeemed
  → return JSON to scanner

expire-vouchers cron
  → wallet credit (C6)
  → לא מחליף תזכורת 48h (זו לפני הפקיעה)
```

אם trigger נכשל: לא לשבור תשלום; מדד/alert על emit failures.

---

## 10. מפת קבצים (יעד)

```
supabase/functions/notifications-worker/index.ts
supabase/functions/notifications-worker/templates/_layout.ts
supabase/functions/notifications-worker/templates/customer-coupon-issued.ts
supabase/functions/notifications-worker/templates/customer-coupon-redeemed.ts
supabase/functions/notifications-worker/templates/customer-coupon-expiry-48h.ts
supabase/functions/notifications-worker/templates/supplier-coupon-sold.ts
supabase/functions/notifications-worker/templates/supplier-coupon-redeemed.ts
supabase/functions/notifications-worker/templates/supplier-new-order-physical.ts
supabase/functions/notifications-worker/channels/resend.ts
supabase/functions/notifications-worker/channels/whatsapp.ts
supabase/migrations/031_notifications.sql          # בסיס
supabase/migrations/0xx_notifications_v2_align.sql # vouchers triggers, 48h, DLQ table if missing
src/app/api/notifications/unsubscribe/route.ts
src/app/api/cron/notifications-worker/route.ts     # אופציונלי twin
```

---

## 11. פערים מול המצב הקיים

| ID | פער | חומרה |
|---|---|---|
| G1 | `finalizeOrder` כמעט לא פולט הודעות ללקוח/ספק | P0 |
| G2 | Make/Zapier אם קיים ב-ops: לנתק לטובת Edge | P0 מדיניות |
| G3 | תזכורת 48h על `vouchers` לא מחוברת | P1 |
| G4 | WhatsApp templates לא רשומים ב-Meta | P1 ל-WA |
| G5 | דף coupons בלי QR פוגע בלינק מהמייל | P1 (account-area) |
| G6 | שני שמות (`notification_log` vs `outbox`) במסמכי V1 | P2 יישור |
| G7 | Unsubscribe UI באזור האישי חלקי | P2 |

---

## 12. טסטים נדרשים

| # | בדיקה | צפי |
|---|---|---|
| T1 | paid + coupon → outbox customer email+wa + supplier email | dedupe יציב ב-replay |
| T2 | redeem → customer + supplier | אין כפילות ב-replay redeem |
| T3 | voucher expires_at = now+47h → enqueue 48h פעם אחת | |
| T4 | Resend 500 → retry; אחרי 6 → DLQ | |
| T5 | bounce webhook → suppression; שליחה הבאה skipped | |
| T6 | unsubscribe marketing → לא נשלח marketing; coupon issued עדיין נשלח | |
| T7 | Edge בלי Bearer → 401 | |
| T8 | מייל HTML: `dir=rtl`, אין מילת Escrow | |
| T9 | הזמנה פיזית → ספק מקבל; ספק קופון לא מקבל "לשליחה" | |

---

## 13. רצף יישום מומלץ

1. יישור סכימה (outbox + DLQ + prefs) על בסיס 031.
2. Edge worker + Resend בלבד (בלי WA) ל-`customer.coupon_issued` + `supplier.new_order_physical`.
3. Triggers מ-`vouchers` / `orders`.
4. תזכורת 48h cron.
5. WhatsApp templates + ערוץ.
6. Unsubscribe routes + webhooks.
7. ניתוק מוחלט מ-Make/Zapier.

---

## 14. Out of scope

- קמפיינים שיווקיים מורכבים (מסמך marketing נפרד)
- Push מובייל native
- SMS כערוץ ראשי (אופציונלי משני לספק בלבד)
- שינוי מודל כסף / Escrow

---

## 15. Revision

| Date | Change |
|---|---|
| 2026-07-31 | V2: Resend + Trigger + Edge (ללא Make/Zapier); אירועי רכישה/סריקה/48ש/פיזי; RTL; retry+DLQ; unsubscribe (`arch/notifications-v2`) |
