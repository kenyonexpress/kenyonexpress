# ארכיטקטורה: התראות (Notifications)

התראות טרנזקציוניות בעברית: Resend (RTL), SMS ישראל, Push לאפ עתידית, bus על Cloudflare Workers, retry+DLQ, העדפות, וציות לחוק הספאם הישראלי.

Status: **BINDING** · עודכן: 2026-08-11  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/EMAIL-TEMPLATES-SPEC.md
docs/EMAIL-TEMPLATES-COPY.md
docs/ARCHITECTURE-EMAIL-TEMPLATES.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
docs/ARCHITECTURE-MOBILE-APP.md
docs/WHATSAPP-COMMERCE-SPEC.md
docs/ARCHITECTURE-OBSERVABILITY.md
docs/CONTRADICTIONS.md
```

---

## 0. המלצה אחת (מחייבת)

**Outbox ב-Postgres + Cloudflare Worker כ-event bus/drain + Resend כערוץ ראשי + QStash אופציונלי ל-wake.**

מסלול כסף לא שולח מייל סינכרוני. באותה טרנזקציה של האירוע נכתבת שורה ב-`notification_outbox` דרך `fn_enqueue_notification`. Worker ב-Cloudflare קורא pending, שולח, ומעדכן סטטוס. כשלים נכנסים ל-retry ואז ל-DLQ.

| ערוץ | תפקיד |
|---|---|
| Resend email | ראשי לכל אירוע טרנזקציוני |
| SMS ישראל | fallback קריטי / OTP תפעולי (ספק מקומי) |
| Push (Expo/APNs/FCM) | אחרי השקת אפ; אותם kinds |
| WhatsApp | utility משני אחרי opt-in (ראה WHATSAPP-COMMERCE) |

אין Make/Zapier. אין שיווק בלי הסכמה לפי חוק התקשורת (ספאם) / 30א.

---

## 1. הכרעות

| # | הכרעה |
|---|---|
| N1 | טבלת תור: `notification_outbox`. |
| N2 | העדפות: `notification_preferences` (+ suppressions). |
| N3 | Emit רק מ-trigger / SECURITY DEFINER; כשל enqueue לא מפיל תשלום/מימוש. |
| N4 | ערוץ ראשי: **Resend**. תבניות עברית **RTL** בלבד ללקוח ישראלי. |
| N5 | Event bus / drain: **Cloudflare Worker** (Queue או cron + pull מ-outbox). |
| N6 | Retry + DLQ חובה; `dedupe_key` UNIQUE = Idempotency-Key ל-Resend. |
| N7 | כסף ב-payload באגורות; תצוגה ב-₪ דרך format בלבד. |
| N8 | No Escrow בנוסח: שולם באתר + יתרה בעסק. אסור נאמן/J5/held. |
| N9 | שיווק (נטישה, דילים): רק עם opt-in מתועד + קישור הסרה. טרנזקציוני לא דורש opt-in שיווקי. |
| N10 | SMS: מספרים ישראליים מנורמלים; ספק SMS ישראלי עם חשבונית ₪. |

---

## 2. Pipeline (Cloudflare Workers)

```text
אירוע דומיין (paid / redeem / …)
  → fn_enqueue_notification (אותה TX)
  → notification_outbox (pending)
  → wake: CF Queue / Cron Trigger / (אופציונלי QStash)
  → Worker drain:
       SELECT … FOR UPDATE SKIP LOCKED
       → Resend | SMS | Push
       → sent | pending+backoff | dead
  → DLQ queue / status=dead + Sentry
```

Worker secrets (Cloudflare): `RESEND_API_KEY`, `DATABASE_URL` או service role מוגבל, `SMS_*`, `CRON_SECRET` / חתימת queue.  
אין service role בדפדפן. אין פתיחת Worker לאינטרנט בלי auth.

גישור זמני עד Worker בפרוד: אותו חוזה outbox יכול להישאב מ-`/api/cron/notifications` ב-Next. היעד המחייב ל-bus הוא Cloudflare.

### 2.1 Cloudflare (יעד)

| רכיב | תפקיד |
|---|---|
| Worker | drain + שליחה ל-Resend/SMS/Push |
| Queue (או Cron Trigger) | wake על הודעות חדשות / מרווח קבוע |
| DLQ Queue | הודעות אחרי max attempts |
| Secrets | `RESEND_API_KEY`, DB credentials מוגבלים, `SMS_*` |

אין לחשוף את ה-Worker ל-internet בלי חתימת cron/queue. Payload בתור = `outbox.id` בלבד (לא PII מלא ב-CF logs).

---

## 3. תבניות Resend (עברית RTL)

חוזה מעטפת: `EMAIL-TEMPLATES-SPEC.md` (`lang=he`, `dir=rtl`, `#fed700`, plaintext).

| kind | מתי | שיווקי? |
|---|---|---|
| `order_paid` / `voucher_issued` | תשלום / הנפקת קופון | לא |
| `voucher_redeemed` | סריקה | לא |
| `supplier_sale` | הזמנה לספק | לא |
| `wallet_cashback_earned` | קאשבק | לא |
| `coupon_expiry_48h` | תזכורת תוקף | לא (utility) |
| `abandoned_cart_1` | נטישה | **כן** (opt-in + unsubscribe) |

דוגמת גוף (קופון מונפק):

```text
נושא: הקופון שלך מוכן · {product_name}
גוף: שלום {first_name}, הקופון ל-{product_name} מוכן.
שולם באתר ₪{paid_now}. יתרה בעסק ₪{balance_at_business}.
CTA: הקופונים שלי → /account/coupons
```

---

## 4. SMS ישראל

| כלל | פירוט |
|---|---|
| מתי | fallback אם email נכשל לאירוע קריטי (`voucher_issued`), או OTP תמיכה |
| תוכן | עברית קצרה; בלי קישורי phishing; בלי PAN |
| נמען | `recipient_phone` מנורמל (`lib/whatsapp` / E.164 IL) |
| חוק | שיווק ב-SMS רק עם הסכמה מפורשת; טרנזקציוני מותר לפי דין **[דורש עו״ד]** לניסוח |
| ספק | BSP/ספק ישראלי; secrets ב-CF/Vercel בלבד |

---

## 5. Push (אפ עתידית)

| פריט | ערך |
|---|---|
| תשתית | Expo Notifications → APNs/FCM |
| רישום | `push_tokens` אחרי login + הרשאת OS |
| שליחה | outbox `channel=push` מאותו Worker |
| kinds | issued, redeemed, expiry_48h, cashback, supplier_sale |
| Deep link | `kenyonexpress://coupons/{id}` (ראה MOBILE-APP) |

Transactional push לא תלוי ב-opt-in שיווקי. נטישה ב-push רק עם opt-in.

---

## 6. סכימות

### 6.1 `notification_outbox`

```sql
-- תמצית; kinds מורחבים לפי EMAIL-TEMPLATES-SPEC
channel IN ('email','sms','whatsapp','push')
status  IN ('pending','sent','failed','dead')
dedupe_key UNIQUE
payload jsonb  -- money as agorot integers
```

RLS: אדמין SELECT; drain = service / Worker credentials.

### 6.2 `notification_preferences`

```sql
CREATE TABLE public.notification_preferences (
  user_id              uuid PRIMARY KEY REFERENCES auth.users(id),
  email_transactional  boolean NOT NULL DEFAULT true,   -- לא לכיבוי מלא בלי מסלול חלופי
  email_marketing      boolean NOT NULL DEFAULT false,
  sms_transactional     boolean NOT NULL DEFAULT true,
  sms_marketing         boolean NOT NULL DEFAULT false,
  push_transactional    boolean NOT NULL DEFAULT true,
  push_marketing        boolean NOT NULL DEFAULT false,
  whatsapp_opt_in       boolean NOT NULL DEFAULT false,
  updated_at            timestamptz NOT NULL DEFAULT now()
);
```

אורחים: הסכמה ב-cookie/session לנטישה; אחרי הרשמה ממזגים לטבלה.

`notification_suppressions` (email/phone): bounce / complaint / הסרה ידנית.

---

## 7. Retry + DLQ

| פרמטר | ערך |
|---|---|
| Max attempts | 5 |
| Backoff | 2, 8, 32, 128, … דקות |
| Batch | 50 לשורות drain |
| 4xx לא-retryable | מיד `dead` |
| אחרי 5 כשלונות | `dead` + Sentry |
| DLQ | CF Queue נפרדת או `status=dead` + cron התראת SEV |

אירועי כסף (`voucher_issued`, `order_paid`, `supplier_sale`) ב-dead → התראת מפעיל מיידית.

---

## 8. חוק ספאם ישראלי (כיוון הנדסי)

**[דורש עו״ד]** לפני פרסום מדיניות.

| כלל מוצר | פירוט |
|---|---|
| טרנזקציוני | אישור הזמנה / קופון / מימוש: מותר בלי opt-in שיווקי |
| שיווקי | נטישה, דילים, רימרקטינג: הסכמה מפורשת + תיעוד מקור + זמן |
| הסרה | קישור unsubscribe בכל מייל שיווקי; כיבוי ב-preferences תוך דקות |
| SMS שיווקי | אותה רמת הסכמה; שעת שליחה סבירה |
| איסור | רשימות קנויות; הסתרת זהות השולח; הסוואת שיווק כ"אישור הזמנה" |

מקור פנימי: `ARCHITECTURE-LEGAL-COMPLIANCE.md` + באנר עוגיות / Consent Mode ל-Pixel.

---

## 9. SLA

| מדד | יעד |
|---|---|
| Enqueue אחרי paid/redeem | אותה טרנזקציה |
| מייל ראשון p95 | ≤ 60 שנ' |
| DLQ על issued/paid/supplier_sale | התראה מיידית |
| נטישה | ≤ תזכורת אחת / 24ש למשתמש עם opt-in |

---

## 10. Acceptance

- [ ] Resend RTL לכל kinds ליבה  
- [ ] Worker drain + retry + DLQ  
- [ ] `notification_preferences` נאכף ב-enqueue  
- [ ] SMS רק לנתיבים מאושרים  
- [ ] Push מוכן לחוזה outbox (גם אם טוקנים ריקים)  
- [ ] אין שיווק בלי opt-in  
- [ ] אין Escrow בנוסח  
- [ ] כשל enqueue לא שובר תשלום  

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-03 | מחזור קופון + Wallet |
| 2026-08-10 | חמשת אירועי הליבה; outbox; QStash |
| 2026-08-11 | CF Workers bus, SMS IL, preferences, חוק ספאם, Push לאפ |
| 2026-08-11 | §2.1 Cloudflare Queue/DLQ bindings; outbox id בתור |
