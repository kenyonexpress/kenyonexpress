# ARCHITECTURE: Notifications

ארכיטקטורת התראות טרנזקציוניות של KenyonExpress.

Status: **BINDING** · Updated: 2026-08-03 (rev B)  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה ב-worktree הראשי (`kenyonexpress`).

Companions:

```
docs/ARCHITECTURE-NOTIFICATIONS-MARKETING.md
docs/ARCHITECTURE-MOBILE-APP.md
docs/ARCHITECTURE-ACCOUNT-WALLET.md
docs/ARCHITECTURE-PERSONAL-AREA.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
```

Stack מחייב:

| רכיב | בחירה | אסור |
|---|---|---|
| Email | **Resend** HTTP API | SMTP מהדפדפן, SendGrid כברירת מחדל, Make/Zapier |
| WhatsApp | **Meta Cloud API** (תבניות utility מאושרות) | שליחה חופשית בלי template, BSP חובה ל-MVP |
| SMS | אגרגטור ישראלי (InforU / 019 לפי מחיר) | SMS שיווקי; SMS כערוץ ראשי לקופון |
| Emit | **Supabase Database Trigger** / `SECURITY DEFINER` enqueue | קריאה סינכרונית לספק מתוך `finalizeOrder` |
| Drain | **Supabase Edge Function** `notifications-worker` | אוטומציה חיצונית כמסלול ייצור |
| Retry | **Upstash QStash** + outbox `next_attempt_at` | לולאת retry בלי תקרה / בלי DLQ |
| Wallet push | Apple Wallet / Google Wallet pass update + channel `push` | Zapier ל-push |
| Templates | עברית **RTL** (`lang="he"`, `dir="rtl"`) | LTR / אנגלית כברירת מחדל ללקוח |

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
NTFY_*
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
| N1 | מסלול כסף **לא מחכה** לספק הודעות. Trigger / enqueue בלבד. כשל מייל/WA/SMS לא מגלגל תשלום או redeem. |
| N2 | At-least-once enqueue; exactly-once אפקט לנמען דרך `dedupe_key` UNIQUE + Idempotency לכל ערוץ. |
| N3 | מחזור חיי קופון: **הונפק / מומש / פג (או עומד לפוג)** חייב fan-out לערוצים לפי העדפות. |
| N4 | ערוץ ברירת מחדל לקופון: **email**. WhatsApp משני (utility). SMS רק fallback כשאין email ואין WA, או תזכורת פקיעה קצרה. |
| N5 | תבניות RTL עברית. מותג: צהוב `#fed700` / `#f5c518`, דיו `#333e48` / `#1a1a1a`. |
| N6 | כסף ב-payload: **אגורות (integer)**. בגוף ההודעה: ₪ עם שני עשרונים (`he-IL`). |
| N7 | קופון (Escrow פנימי 2026-07-27): ללקוח **שולם באתר** + **יתרה בבית העסק**. אין נוסח "Escrow"/"נאמן". אין לספר לספק על payout לפני מימוש. |
| N8 | QR **לא** מוטמע כ-`data:` URI בגוף המייל. המייל נושא קוד קריא + קישור לדף שמציג QR. |
| N9 | Wallet push (Apple/Google) הוא עדכון ל-pass קיים או הנפקה ראשונה; לא מחליף את המייל. |
| N10 | Transactional לא דורש opt-in שיווקי. Suppression / STOP תמיד מכבדים. |
| N11 | אין Make / Zapier בייצור. טבלת שוברים קנונית: `vouchers`. |

---

## 1. Pipeline

```text
Domain commit
  (finalizeOrder / vouchers issued / redeem_voucher / expiry cron / wallet ledger)
        │
        ▼
AFTER TRIGGER  (SECURITY DEFINER, EXCEPTION swallowed)
  או fn_enqueue_notification(...)
        │
        ▼
notification_outbox
  (dedupe_key UNIQUE, channel, status pending|sent|dead|skipped, attempts, next_attempt_at)
        │
        ├─ wake: cron / QStash publish  (לא חוסם את ה-commit)
        ▼
Edge Function notifications-worker
  (twin מותר: POST /api/cron/notifications עם Bearer CRON_SECRET)
        │
        ├─ claim due rows (FOR UPDATE SKIP LOCKED)
        ├─ route by channel: email | whatsapp | sms | push | wallet_push
        ├─ render Hebrew RTL template / Meta template vars / SMS short text
        │
        ├─ 2xx → status=sent, provider_message_id
        ├─ 429/5xx/network → QStash retry + outbox backoff
        └─ attempts exhausted / permanent → status=dead + DLQ / Ntfy
```

| שכבה | היום (095 + cron) | יעד מחייב |
|---|---|---|
| Emit | Triggers על `orders.paid_at` ו-`vouchers.status` | + expiry cron + wallet ledger + multi-channel fan-out |
| Drain | `GET /api/cron/notifications` | Edge `notifications-worker` + twin זהה |
| Channels | email בלבד | email + WhatsApp + SMS + push + wallet_push |
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
  "html": "<div dir=\"rtl\" lang=\"he\" …>",
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
| wallet ledger | `wallet_ledger` / equivalent | credit/debit settled | `wallet_activity` (אופציונלי לפי prefs) |

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
3. לפי `channel`: Resend / Meta WA / SMS / Expo-APNs-FCM / Wallet pass update.
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

### 5.1 מטריצת ערוצים

| אירוע | kind | Email | WhatsApp | SMS | App push | Wallet push |
|---|---|---|---|---|---|---|
| הונפק אחרי תשלום | `coupon_issued` | חובה | utility אם opt-in טלפון + template מאושר | fallback בלבד | כן (אם token) | הנפקת/עדכון pass |
| מומש בסריקה | `coupon_redeemed` | חובה | utility קצר | לא כברירת מחדל | כן | עדכון pass ל-void/redeemed |
| תזכורת 48ש לפני פקיעה | `coupon_expiry_48h` | חובה (ניתן לכיבוי) | utility אם פעיל | מותר (קצר) | כן | עדכון תוקף על ה-pass |
| פג בפועל | `coupon_expired` | כן | אופציונלי | לא | כן | void pass |

כלל: מייל קופון שהונפק **הוא** אישור הרכישה. לא לשלוח גם `order_paid` גנרי על אותה הזמנה כשיש vouchers.

### 5.2 `coupon_issued` (הונפק)

| שדה | ערך |
|---|---|
| Emit | אחרי הנפקת `vouchers` תחת הזמנה paid |
| Dedupe email | `coupon_issued:{voucher_id}:customer:email` |
| Dedupe WA | `coupon_issued:{voucher_id}:customer:whatsapp` |
| Dedupe SMS | `coupon_issued:{voucher_id}:customer:sms` |
| Dedupe push | `coupon_issued:{voucher_id}:customer:push` |
| Dedupe wallet | `coupon_issued:{voucher_id}:customer:wallet_push` |

תוכן חובה (כל ערוץ ארוך מספיק):

- שם מוצר בעברית
- קוד קופון (`dir=ltr`)
- שולם באתר / יתרה בעסק / תוקף
- CTA ל-`/coupon/{voucher_id}` או deep link `kenyonexpress://coupon/{id}`

Subject מייל:

```
הקופון שלך מוכן · {PRODUCT_NAME_HE}
```

WhatsApp template (utility, מאושר מראש), דוגמת משתנים:

```
{{1}} = שם מוצר
{{2}} = קוד
{{3}} = שולם באתר
{{4}} = יתרה בעסק
{{5}} = תוקף
{{6}} = קישור קצר לקופון
```

SMS (מקס ~2 סגמנטים UCS-2, ~134 תווים):

```
KenyonExpress: הקופון {{code}} מוכן. יתרה בעסק {{due}}. פרטים: {{short_url}}
```

### 5.3 `coupon_redeemed` (מומש)

| שדה | ערך |
|---|---|
| Emit | `vouchers.status` → `redeemed` |
| נמען ראשי | לקוח |
| נמען משני | ספק (סיכום סריקה; email או WA לפי prefs ספק) |

תוכן ללקוח: מוצר, בית עסק, זמן `he-IL`, קוד, סכום שנגבה בעסק אם > 0, משפט "אם לא אתם מימשתם, פנו מיד".

Subject:

```
הקופון מומש · {PRODUCT_NAME}
```

Wallet push: מעדכן את ה-pass לסטטוס redeemed/void ומדכא הצגה ב-lock screen.

### 5.4 `coupon_expiry_48h` / `coupon_expired` (פג)

| שדה | ערך |
|---|---|
| 48h job | cron יומי/שעתי; רק `issued` עם `expires_at` בחלון |
| Dedupe 48h | `coupon_expiry_48h:{voucher_id}:customer:{channel}` |
| Expired | כשסטטוס עובר ל-`expired` או job סימון פקיעה |

תזכורת נשארת טרנזקציונית רק בלי תוכן קידומי ("קנו עוד").  
כיבוי מפורש ב-`user_notification_preferences.coupon_expiry_*` מכבדים.  
אישור רכישה/מימוש/החזר לא נחסמים ע"י כיבוי expiry.

### 5.5 ספק על מחזור הקופון

| אירוע | ספק מקבל | נוסח אסור |
|---|---|---|
| הנפקה | `supplier_sale` תפעולי (נמכר קופון; מימוש ב-QR) | "קיבלתם תשלום מהפלטפורמה" |
| מימוש | סיכום סריקה + `collected_agorot` | הבטחת תאריך payout |
| פקיעה | לא כברירת מחדל | אין נוסח payout |

---

## 6. WhatsApp + SMS

### 6.1 WhatsApp (Meta Cloud API)

| כלל | פירוט |
|---|---|
| סוג הודעה | utility templates מאושרים בלבד למחזור קופון |
| נמען | E.164 ישראל; רק אם יש טלפון ב-profile והמשתמש לא עשה STOP |
| Idempotency | `dedupe_key` בשורת outbox; שמירת `wamid` כ-`provider_message_id` |
| כשל template | 4xx קבוע → `dead` (לא backoff מלא) |
| STOP | webhook → suppression על channel whatsapp |

Feature flag יעד: `WHATSAPP_NOTIFICATIONS_ENABLED` (כבוי עד templates מאושרים).

### 6.2 SMS

| כלל | פירוט |
|---|---|
| שימוש | fallback להנפקה בלי email/WA; תזכורת פקיעה קצרה |
| ספק | אגרגטור ישראלי (לא Twilio כברירת מחדל) |
| אורך | UCS-2: תבניות קצרות, עד 2 סגמנטים |
| שיווק | אסור בשלב זה |
| הסרה | "הסר" / webhook אגרגטור → opt-out `marketing_sms` (טרנזקציוני קריטי נשאר לפי מדיניות נדירה) |

### 6.3 סדר fan-out מומלץ ל-`coupon_issued`

```text
1. email (תמיד אם יש כתובת ולא suppressed)
2. wallet_push (אם הלקוח הוסיף pass או ביקש "הוסף לארנק")
3. push (אם push_token קיים)
4. whatsapp (אם flag + template + טלפון)
5. sms (רק אם אין email ולא נשלח WA, או preference מפורשת ל-SMS expiry)
```

כל ערוץ = שורת outbox נפרדת עם `dedupe_key` נפרד.

---

## 7. Wallet push (Apple Wallet / Google Wallet)

### 7.1 מטרה

הלקוח שומר את הקופון בארנק המכשיר. כשהסטטוס משתנה (הונפק / מומש / פג), השרת דוחף עדכון ל-pass בלי לפתוח את האפ.

זה **לא** ארנק הכסף הפנימי (`wallet_accounts`). לארנק הכסף ראה §8 ו-

```
docs/ARCHITECTURE-ACCOUNT-WALLET.md
```

### 7.2 מודל

| פלטפורמה | מנגנון |
|---|---|
| Apple Wallet | PassKit web service: register device, `push` על שינוי pass, הורדת `.pkpass` מעודכן |
| Google Wallet | Google Wallet API: create/update Generic Object / Offer Object; push לתצוגה |

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

### 7.3 אירועים → wallet_push

| אירוע | פעולת pass |
|---|---|
| `coupon_issued` | יצירת pass (אם המשתמש לחץ "הוסף לארנק") או עדכון שדות ראשונים |
| `coupon_redeemed` | סימון redeemed / void + הודעת עדכון |
| `coupon_expiry_48h` | עדכון שדה תוקף / באנר תזכורת על ה-pass |
| `coupon_expired` | void |

שורת outbox:

```text
channel = wallet_push
kind    = coupon_issued | coupon_redeemed | coupon_expiry_48h | coupon_expired
dedupe  = {kind}:{voucher_id}:customer:wallet_push:{platform}
```

### 7.4 תוכן על ה-pass

- שם מוצר בעברית
- קוד + QR (מ-`qr_payload` שנוצר בשרת בעת הנפקה)
- שולם באתר / יתרה בעסק
- תוקף
- לוגו/צהוב מותג בגבולות מדריכי Apple/Google

סודות חתימת pass רק בשרת. האפ/web מקבלים URL חתום להורדה, לא את המפתח הפרטי.

### 7.5 קשר למייל

המייל מציע CTA "הוסף לארנק" → מנחית `.pkpass` / Google Save link.  
המייל עצמו לא מטמיע QR כ-`data:` URI.

---

## 8. Push לארנק כסף (wallet activity) + app push

### 8.1 App push (Expo / APNs / FCM)

רישום:

```text
push_tokens (user_id, platform ios|android, token, updated_at)
UNIQUE (user_id, token)
```

| אירוע | Deep link |
|---|---|
| `coupon_issued` | `kenyonexpress://coupon/{id}` |
| `coupon_redeemed` | `kenyonexpress://coupons` |
| `coupon_expiry_48h` | `kenyonexpress://coupons` |
| `wallet_activity` | `kenyonexpress://wallet` |

Transactional push לא תלוי ב-marketing opt-in. בקשת הרשאה אחרי ערך (אחרי רכישה / כניסה לארנק), לא ב-cold start אגרסיבי.

### 8.2 `wallet_activity`

כש-ledger פנימי מזכה/מחייב (cashback, זיכוי החזר ליתרה וכו'):

| שדה | ערך |
|---|---|
| kind | `wallet_activity` |
| channels | email (אם pref) + push |
| ברירת מחדל | כבוי למייל ב-029-style prefs; push לפי הרשאת מערכת |
| Dedupe | `wallet_activity:{ledger_id}:customer:{channel}` |

אין משיכת כסף החוצה; ההודעה מתארת יתרה פנימית בלבד.

---

## 9. תבניות מייל עברית RTL

### 9.1 מעטפת

- `lang="he"` ו-`dir="rtl"` על השורש ועל בלוקים פנימיים
- `text-align: right`
- פונט מייל: `Arial, Helvetica, sans-serif` (Heebo רק אם מובטח)
- קודים/סכומים ב-`dir="ltr"` או `<bdi>`
- Escape לכל משתנה
- חלק plaintext בעברית תמיד

### 9.2 Subjects

| kind | subject |
|---|---|
| `coupon_issued` | הקופון שלך מוכן · {{product_name}} |
| `coupon_redeemed` | הקופון מומש · {{product_name}} |
| `coupon_expiry_48h` | תזכורת: הקופון שלך פג תוך 48 שעות |
| `coupon_expired` | הקופון פג תוקף · {{product_name}} |
| `order_paid` | ההזמנה שלך התקבלה · {{order_ref}} |
| `supplier_sale` | הזמנה חדשה ב-KenyonExpress · {{order_ref}} |
| `wallet_activity` | עדכון בארנק · {{amount_ils}} |

### 9.3 סדר כסף בגוף קופון

1. שולם באתר: `coupon_price_agorot`
2. לתשלום בבית העסק: `remaining_due_agorot`
3. (משני) מחיר מלא: `face_value_agorot`
4. בתוקף עד: תאריך `he-IL`

---

## 10. Coupon QR delivery (מייל)

```text
1. paid → issue vouchers (code + qr_payload חתום בשרת)
2. enqueue coupon_issued (multi-channel)
3. Worker → Resend: קוד + סכומים + CTA ל-/coupon/{id}
4. לקוח פותח דף → QR מרונדר בזמן תצוגה
5. אופציונלי: הוסף לארנק → PassKit / Google Wallet
6. ספק סורק → redeem → coupon_redeemed (+ wallet_push void)
```

אסור: PNG/SVG כ-`data:` במייל; `qr_payload` ב-query ציבורי; הבטחת payout לספק בהנפקה.

---

## 11. העדפות, suppression, משפטי

| נושא | ברירת מחדל | הערות |
|---|---|---|
| הנפקה / מימוש / החזר | on | Transactional; לא תלוי marketing |
| תזכורת פקיעה | on | ניתן לכיבוי |
| WhatsApp utility | on אם טלפון + template | STOP מכבדים |
| SMS | fallback | בלי שיווק |
| Wallet activity email | off | לפי prefs |
| Marketing | off | ראה MARKETING doc + חוק 30א |

Unsubscribe חתום (יעד):

```
/api/notifications/unsubscribe?u=…&t=…&sig=…&exp=…
```

Topics: `marketing`, `coupon_expiry`. לא חוסמים הנפקה/מימוש/החזר אלא ב-opt-out טרנזקציונלי נדיר ומפורש.

---

## 12. אבטחה ו-ops

- אין מפתחות ספקים בדפדפן / באפ.
- Worker בלי Bearer → 401.
- Outbox: אין RLS כתיבה ללקוח; אדמין SELECT.
- Trigger errors לא מפילים תשלום/סריקה.
- Ntfy/Sentry: DLQ, stall (אין drain 15 דק' ויש תור), Meta/Resend 429 מתמשך.
- עדיפות DLQ: `coupon_issued` > refund > `order_paid` > `coupon_redeemed` > supplier.

---

## 13. מפת קבצים (יעד)

```
supabase/functions/notifications-worker/index.ts
supabase/functions/notifications-worker/channels/resend.ts
supabase/functions/notifications-worker/channels/whatsapp.ts
supabase/functions/notifications-worker/channels/sms.ts
supabase/functions/notifications-worker/channels/push.ts
supabase/functions/notifications-worker/channels/wallet-push.ts
supabase/functions/notifications-worker/templates/*
src/app/api/cron/notifications/route.ts
src/app/api/cron/notifications-dlq/route.ts
src/app/api/wallet/passes/[voucherId]/route.ts
src/lib/notifications/qstash.ts
```

---

## 14. Acceptance

- [ ] Resend + Trigger + Edge worker (או cron twin), בלי Make/Zapier
- [ ] מחזור קופון: issued / redeemed / expiry+expired עם fan-out לערוצים
- [ ] מייל RTL: קוד + לינק `/coupon/{id}`, בלי QR מוטמע
- [ ] WhatsApp utility מאחורי flag + templates מאושרים
- [ ] SMS רק fallback / תזכורת קצרה
- [ ] Wallet push מעדכן pass ב-issued/redeemed/expired
- [ ] App push + deep links; `wallet_activity` לפי prefs
- [ ] QStash retries + DLQ; מסלול כסף לא מחכה לספקים
- [ ] Idempotency: `dedupe_key` לכל channel + Resend Idempotency-Key

---

## 15. SLA תפעולי (מחזור קופון)

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

## 16. Out of scope

- קמפיינים שיווקיים (ראה MARKETING)
- שינוי מודל כסף / ledger / Escrow
- שינוי קוד ב-worktree הראשי

---

## 17. Revision

| Date | Change |
|---|---|
| 2026-07-23 | Draft ישן: outbox + templates |
| 2026-07-29 | V1: Resend + Trigger + Edge |
| 2026-07-31 | V2: WhatsApp, QR, 48h, unsubscribe |
| 2026-08-02 | איחוד מחייב + QStash + QR דרך `/coupon/{id}` |
| 2026-08-03 | מחזור קופון מלא (issued/redeemed/expired) על email+WA+SMS; Wallet push (Apple/Google); app push לארנק; docs-only ב-`ke-arch` |
| 2026-08-03 | rev B: SLA תפעולי לערוצים + אישור מחייב Resend/Edge/WA/SMS/Wallet push |
