# ארכיטקטורה: התראות (Notifications)

תור התראות טרנזקציוניות בעברית: outbox ב-Postgres, Resend (RTL), Push (`push_tokens`), in-app (פעמון), retry+DLQ, העדפות, וציות לחוק הספאם.

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
docs/ARCHITECTURE-ACCOUNT-IDENTITY.md
docs/ARCHITECTURE-OBSERVABILITY.md
docs/CONTRADICTIONS.md
supabase/migrations/095_notification_outbox.sql
supabase/migrations/096_notification_voucher_issued.sql
supabase/migrations/029_accounts.sql
supabase/migrations/031_notifications.sql
```

---

## 0. המלצה אחת (מחייבת)

**Outbox ב-Postgres + `fn_enqueue_notification` באותה טרנזקציה של האירוע + drain (Cloudflare Worker יעד / Next cron גשר) + Resend לערוץ email + `push_tokens` ל-push + שורות in-app לפעמון.**

מסלול כסף לא שולח מייל סינכרוני. כשל enqueue נבלע ב-trigger (EXCEPTION) ולא מפיל תשלום/מימוש.

| ערוץ | תשתית | תפקיד |
|---|---|---|
| email | Resend | ראשי לכל אירוע טרנזקציוני ללקוח/ספק |
| push | Expo → APNs/FCM דרך `push_tokens` | אחרי השקת אפ; אותם kinds |
| in-app | פעמון באתר (RLS owner) | תמיד לטרנזקציוני למשתמש מחובר |
| sms | ספק ישראלי | fallback קריטי / OTP בלבד |

אין Make/Zapier. אין שיווק בלי הסכמה. **No Escrow** בנוסח. כסף ב-payload באגורות בלבד.

---

## 1. הכרעות

| # | הכרעה |
|---|---|
| N1 | טבלת תור פעילה למייל טרנזקציוני: `public.notification_outbox` (מיגרציה `095`). |
| N2 | כתיבה יחידה: `public.fn_enqueue_notification(kind, email, dedupe_key, payload)`. |
| N3 | Emit מ-trigger / SECURITY DEFINER בלבד; enqueue swallow errors. |
| N4 | ערוץ email: **Resend**. תבניות עברית **RTL** (`lang=he`, `dir=rtl`). |
| N5 | ערוץ push: רישום ב-`push_tokens`; שליחה מ-drain עם `channel=push`. |
| N6 | ערוץ in-app: שורה לבעלים עם `read_at`; פעמון קורא ב-RLS. |
| N7 | Event bus יעד: **Cloudflare Worker** (Queue/Cron). גשר זמני: `/api/cron/notifications`. |
| N8 | Retry + DLQ חובה; `dedupe_key` UNIQUE = Idempotency-Key ל-Resend. |
| N9 | כסף ב-payload: `*_agorot` integers; תצוגה ₪ בפורמט בלבד. |
| N10 | No Escrow: "שולם באתר" + "יתרה בעסק". אסור נאמן/J5/held. |
| N11 | שיווק רק עם opt-in מתועד + unsubscribe. טרנזקציוני לא דורש opt-in שיווקי. |

### 1.1 שני שמות outbox (מציאות הסכמה)

| טבלה | מקור | שימוש מחייב |
|---|---|---|
| `notification_outbox` | `095_notification_outbox.sql` | **פעיל** ל-email drain של paid / supplier_sale / voucher_* |
| `notifications_outbox` | `029` + הרחבות `031` | מודל רב-ערוצי (email/inapp/push/sms/whatsapp) + פעמון; לא למחוק; יעד איחוד הדרגתי |

עד איחוד מלא: מיילים טרנזקציוניים חדשים עוברים ב-`095` + `fn_enqueue_notification`. In-app/push נכתבים לפי חוזה `031` (או fanout מה-drain שיוצר שורת inapp אחרי email enqueue). אסור שתי מערכות ששולחות את אותו מייל בלי `dedupe_key` משותף.

---

## 2. Pipeline

```text
אירוע דומיין (paid / redeem / voucher_issued / …)
  → trigger SECURITY DEFINER
  → fn_enqueue_notification (אותה TX; ON CONFLICT dedupe DO NOTHING)
  → notification_outbox status=pending
  → wake: CF Queue / Cron / (גשר) /api/cron/notifications
  → drain FOR UPDATE SKIP LOCKED:
       email → Resend (Idempotency-Key = dedupe_key)
       push  → Expo/APNs/FCM לפי push_tokens
       inapp → insert/update שורת פעמון (read_at null)
       → sent | pending+backoff | dead
  → DLQ: status=dead + /api/cron/notifications-dlq + Sentry
```

Secrets: `RESEND_API_KEY`, DB service role מוגבל ל-drain, `CRON_SECRET`, מפתחות push. אין service role בדפדפן.

### 2.1 Cloudflare (יעד bus)

| רכיב | תפקיד |
|---|---|
| Worker | drain + שליחה |
| Queue / Cron Trigger | wake |
| DLQ Queue | אחרי max attempts |
| Payload בתור | `outbox.id` בלבד (לא PII מלא בלוגים) |

גשר Next נשאר חוקי עד Worker בפרוד; החוזה (סטטוסים, backoff, dedupe) זהה.

---

## 3. `fn_enqueue_notification` + סכימת `notification_outbox`

חוזה מ-`095` (תמצית מחייבת):

```sql
-- notification_outbox
kind            text NOT NULL  -- order_paid | supplier_sale | voucher_redeemed | (+ voucher_issued מ-096)
recipient_email text NOT NULL
payload         jsonb NOT NULL DEFAULT '{}'  -- money as agorot
dedupe_key      text NOT NULL UNIQUE
status          text NOT NULL DEFAULT 'pending'  -- pending|sent|failed|dead
attempts        integer NOT NULL DEFAULT 0
last_error      text
next_attempt_at timestamptz NOT NULL DEFAULT now()
created_at / sent_at

-- fn_enqueue_notification(p_kind, p_email, p_dedupe, p_payload)
-- SECURITY DEFINER; silent return על אימייל ריק / suppression; ON CONFLICT DO NOTHING
```

RLS: אדמין SELECT; drain = service role. לקוח לא קורא את טבלת המייל (מכילה כתובות של אחרים).

Kinds ליבה (מינימום):

| kind | מתי | ערוצים |
|---|---|---|
| `order_paid` | `paid_at` null→set, בלי vouchers כפולים | email (+ in-app אם user_id) |
| `supplier_sale` | per supplier בשורת הזמנה ששולמה | email לספק |
| `voucher_issued` | הנפקת קופון (`096`) | email + in-app + push |
| `voucher_redeemed` | סריקה | email (+ in-app) |
| `coupon_expiry_48h` | תזמון | email + in-app + push |
| `wallet_cashback_earned` | קאשבק | email + in-app |
| `abandoned_cart_1` | נטישה | email **שיווקי** (opt-in) |

---

## 4. ערוץ email (Resend, עברית RTL)

מעטפת: `EMAIL-TEMPLATES-SPEC.md` (`lang=he`, `dir=rtl`, מותג `#fed700`, plaintext מקביל).

דוגמת גוף (קופון מונפק, No Escrow):

```text
נושא: הקופון שלך מוכן · {product_name}
גוף: שלום {first_name}, הקופון ל-{product_name} מוכן.
שולם באתר ₪{paid_now}. יתרה בעסק ₪{balance_at_business}.
CTA: הקופונים שלי → /account/coupons
```

כללי payload:

- `total_agorot`, `amount_agorot`, `paid_agorot`, `balance_agorot` כמספרים שלמים.
- פורמט ₪ רק בשכבת התבנית (`agorot/100`), לא ב-DB כמקור אמת שני.
- אסור "מוחזק אצלנו" / Escrow / J5.

Idempotency: כותרת Resend = `dedupe_key` (למשל `order_paid:{order_id}`).

---

## 5. ערוץ push (`push_tokens`)

| פריט | ערך |
|---|---|
| טבלה | `push_tokens (user_id, platform, token, updated_at)` (ראה MOBILE-APP) |
| רישום | אחרי login + הרשאת OS |
| שליחה | drain בוחר טוקנים פעילים של `user_id` |
| kinds | issued, redeemed, expiry_48h, cashback, supplier_sale (לספק באפ ספק) |
| Deep link | `https://kenyonexpress.co.il/...` / scheme אפ לפי MOBILE-APP |

Transactional push לא תלוי ב-opt-in שיווקי. נטישה ב-push רק עם opt-in.

---

## 6. ערוץ in-app (פעמון)

| פריט | ערך |
|---|---|
| קריאה | בעלים: SELECT שורות שלו (`user_id = auth.uid()`) |
| סימון נקרא | UPDATE ל-`read_at` בלבד (לא לשנות kind/payload) |
| UI | פעמון ב-header / `/account/notifications` |
| תוכן | עברית; קיצור; קישור פנימי לקופון/הזמנה |

In-app תמיד לאירוע טרנזקציוני כשיש `user_id`. אורח: אין פעמון עד הרשמה (email בלבד לפי כתובת הזמנה).

---

## 7. העדפות + suppressions

```sql
-- יעד (preferences)
email_transactional / email_marketing
sms_transactional / sms_marketing
push_transactional / push_marketing
whatsapp_opt_in
```

- טרנזקציוני: ברירת מחדל true; כיבוי מלא דורש מסלול חלופי מתועד.
- שיווקי: ברירת מחדל false; דורש consent event.
- `email_suppressions` / `channel_suppressions`: bounce, complaint, STOP. `fn_enqueue_notification` בודק suppression **לפני** INSERT.

---

## 8. Retry + DLQ

| פרמטר | ערך |
|---|---|
| Max attempts | 5 |
| Backoff | 2, 8, 32, 128, … דקות על `next_attempt_at` |
| Batch | 50 לשורות drain |
| 4xx לא-retryable (כתובת מתה, 422 תבנית) | מיד `dead` |
| אחרי 5 כשלונות | `status=dead` + Sentry + cron DLQ |
| נתיב גשר | `/api/cron/notifications` + `/api/cron/notifications-dlq` |

אירועי כסף ב-dead (`voucher_issued`, `order_paid`, `supplier_sale`) → התראת מפעיל מיידית.

---

## 9. חוק ספאם ישראלי (כיוון הנדסי)

**[דורש עו״ד]** לפני פרסום מדיניות חיצונית.

| סוג | כלל |
|---|---|
| טרנזקציוני | הזמנה / קופון / מימוש: מותר בלי opt-in שיווקי |
| שיווקי | נטישה / דילים: הסכמה מפורשת + מקור + זמן |
| הסרה | unsubscribe בכל מייל שיווקי; כיבוי ב-preferences תוך דקות |
| איסור | רשימות קנויות; הסוואת שיווק כאישור הזמנה |

---

## 10. SLA

| מדד | יעד |
|---|---|
| Enqueue אחרי paid/redeem | אותה טרנזקציה |
| מייל ראשון p95 | ≤ 60 שנ' |
| Push/in-app p95 | ≤ 60 שנ' אחרי enqueue |
| DLQ על issued/paid/supplier_sale | התראה מיידית |

---

## 11. Acceptance

- [ ] כל אירוע כסף כותב outbox דרך `fn_enqueue_notification` (או fanout מתועד)
- [ ] Resend RTL; Idempotency-Key = dedupe_key
- [ ] Push דרך `push_tokens`; in-app עם RLS + `read_at`
- [ ] Retry + DLQ לפי טבלה §8
- [ ] Preferences + suppressions נאכפים ב-enqueue
- [ ] אין שיווק בלי opt-in
- [ ] אין Escrow בנוסח; agorot ב-payload
- [ ] כשל enqueue לא שובר תשלום

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-03 | מחזור קופון + Wallet |
| 2026-08-10 | חמשת אירועי הליבה; outbox; QStash |
| 2026-08-11 | CF Workers bus, SMS IL, preferences, חוק ספאם, Push לאפ |
| 2026-08-11 | §2.1 Cloudflare Queue/DLQ; outbox id בתור |
| 2026-08-11 | הרחבה BINDING: 095/`fn_enqueue_notification`, push_tokens, in-app, איחוד מול 029/031, RTL+agorot+No Escrow |
