# ארכיטקטורה: התראות (Notifications)

התראות טרנזקציוניות: הזמנה שולמה, קופון נסרק, הודעת ספק על פיזי, קאשבק נכנס, נטישת עגלה.

Status: **BINDING** · עודכן: 2026-08-10  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-EMAIL-TEMPLATES.md
docs/ARCHITECTURE-CASHBACK-WALLET.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
docs/ARCHITECTURE-OBSERVABILITY.md
docs/CONTRADICTIONS.md
```

---

## 0. המלצה אחת (מחייבת)

**Outbox ב-Postgres + drain ב-Next + QStash ל-wake/retry/DLQ + Resend כערוץ ראשי.**

מסלול כסף לא שולח מייל סינכרוני. שורה נכתבת באותה טרנזקציה של האירוע (`fn_enqueue_notification`). ה-drain ב-

```
/api/cron/notifications
```

שולח דרך Resend. QStash מעיר את ה-drain ומנתב כשלונות ל-

```
/api/cron/notifications-dlq
```

וואטסאפ = utility template משני. Push דפדפן/אפ = עתידי אחרי soft-open. אין Make/Zapier.

---

## 1. הכרעות

| # | הכרעה |
|---|---|
| N1 | טבלת התורים המחייבת: `notification_outbox` (זו "טבלת ההתראות"). |
| N2 | Emit רק מ-trigger / SECURITY DEFINER; כשל enqueue לא מפיל תשלום/מימוש. |
| N3 | ערוץ ראשי: Resend email. משני: WhatsApp Cloud API. Push: עתידי. |
| N4 | תבניות עברית RTL בלבד ללקוח ישראלי. |
| N5 | כסף ב-payload באגורות; תצוגה ב-₪ דרך `formatAgorot` בלבד. |
| N6 | No Escrow בנוסח: שולם באתר + יתרה בעסק. אסור נאמן/J5/held. |
| N7 | `dedupe_key` UNIQUE = גם `Idempotency-Key` ל-Resend. |
| N8 | הזמנת קופון: `voucher_issued` במקום `order_paid` כפול. |

---

## 2. Pipeline

```text
אירוע דומיין
  → fn_enqueue_notification (אותה טרנזקציה)
  → notification_outbox (pending)
  → wakeNotificationsDrain (QStash) או cron דקה
  → drainNotificationOutbox → Resend / WA
  → sent | pending+backoff | dead
  → QStash Failure-Callback → notifications-dlq
```

קבצים:

```
src/lib/notifications/drain.ts
src/lib/notifications/qstash.ts
src/app/api/cron/notifications/route.ts
src/app/api/cron/notifications-dlq/route.ts
src/lib/email/notifications.ts
supabase/functions/notifications-worker/index.ts
supabase/migrations/095_notification_outbox.sql
supabase/migrations/096_notification_voucher_issued.sql
```

---

## 3. חמשת האירועים (חוזה מלא)

### 3.1 הזמנה שולמה (פיזי בלבד ללקוח)

| שדה | ערך |
|---|---|
| kind | `order_paid` |
| ערוץ | Resend (חובה). WhatsApp: לא ב-MVP. Push: עתידי. |
| טריגר | `AFTER UPDATE OF paid_at ON orders` → `tg_orders_notify_paid` כשאין vouchers בהזמנה |
| dedupe | `order_paid:{order_id}` |
| מתי לא | הזמנת קופון (אז `voucher_issued`) |

**Template (RTL):**

```text
נושא: ההזמנה שלך שולמה · {order_ref}
גוף: שלום {customer_name}, התשלום על ₪{total} התקבל.
מספר הזמנה: {order_ref}. {item_count} פריטים.
CTA: מעקב הזמנה → /account/orders/{order_id}
```

### 3.2 קופון נסרק

| שדה | ערך |
|---|---|
| kind | `voucher_redeemed` |
| ערוץ | Resend (חובה). WhatsApp utility אם יש טלפון+template. Push: עתידי / Wallet void. |
| טריגר | `tg_vouchers_notify_redeemed` כש-`vouchers.status` עובר ל-`redeemed` (מתוך `redeem_voucher`) |
| dedupe | `voucher_redeemed:{voucher_id}` |

**Template (RTL):**

```text
נושא: הקופון מומש · {product_name}
גוף: הקופון ל-{product_name} מומש אצל {supplier_name}.
קוד: {code} (dir=ltr). אין יתרה נוספת לגבייה באתר.
CTA: האזור האישי → /account
```

### 3.3 הודעה לספק על מוצר פיזי

| שדה | ערך |
|---|---|
| kind | `supplier_sale` |
| ערוץ | Resend ל-`suppliers.contact_email` (חובה). WhatsApp לספק: עתידי. |
| טריגר | אותו `tg_orders_notify_paid`: לולאה פר `supplier_id` על `order_items` אחרי `paid_at` |
| dedupe | `supplier_sale:{order_id}:{supplier_id}` |
| סינון פיזי | בשליחה/תבנית: מדגישים שורות `product_type=physical` + כתובת משלוח מההזמנה כשיש |

**Template (RTL):**

```text
נושא: הזמנה חדשה · {order_ref}
גוף: התקבלה הזמנה {order_ref}.
פריטים: {lines: name × qty}. סכום שורות: ₪{amount}.
לפיזי: הכן משלוח/איסוף ועדכן סטטוס בפורטל.
CTA: פורטל ספק → /supplier/orders/{order_id}
```

קופון באותה הזמנה: הספק מקבל התראה תפעולית בלי ציפיית payout (No Escrow).

### 3.4 קאשבק נכנס

| שדה | ערך |
|---|---|
| kind | `wallet_cashback_earned` |
| ערוץ | Resend (חובה אם יש מייל). Push עתידי לארנק באפ. WhatsApp: לא. |
| טריגר | אחרי כתיבת ledger `wallet_cashback_earned` (finalize paid + cashback_percent > 0): `fn_enqueue_notification` מ-SECURITY DEFINER / trigger על `wallet_ledger` |
| dedupe | `wallet_cashback_earned:{ledger_entry_id}` |

**Template (RTL):**

```text
נושא: נוספו ₪{amount} לקאשבק שלך
גוף: קיבלת קאשבק ₪{amount} על הזמנה {order_ref}.
היתרה בארנק הפנימי: ₪{balance}. למימוש ברכישה הבאה באתר בלבד (אין משיכה החוצה).
CTA: הארנק → /account/wallet
```

### 3.5 נטישת עגלה

| שדה | ערך |
|---|---|
| kind | `abandoned_cart_1` |
| ערוץ | Resend בלבד ב-MVP (opt-in שיווקי). WhatsApp רק אם opt-in מפורש + template. Push: עתידי. |
| טריגר | cron `fn_enqueue_abandoned_cart_reminders` (מ-031): עגלה לא שולמה אחרי X שעות, משתמש עם הסכמה |
| dedupe | `abandoned_cart_1:{cart_id}:{day}` |
| מרווח | תזכורת ראשונה אחרי **3 שעות** חוסר פעילות; בלי סדרה אגרסיבית ב-MVP |

**Template (RTL):**

```text
נושא: שכחת משהו בעגלה
גוף: הפריטים בעגלה מחכים. הסיכום האחרון: ₪{cart_total}.
CTA: חזרה לעגלה → /cart
ביטול הרשמה: קישור העדפות /account/preferences
```

אסור שיווק בלי opt-in. אסור מחיר ב-Offer שלא תואם קופה.

---

## 4. סכימת `notification_outbox` (מלאה)

אגורות ב-payload כ-`bigint` JSON numbers. ערוץ בעמודה נפרדת.

```sql
CREATE TABLE public.notification_outbox (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind             text NOT NULL,
  channel          text NOT NULL DEFAULT 'email'
                   CHECK (channel IN ('email', 'whatsapp', 'sms', 'push')),
  recipient_email  text,
  recipient_phone  text,
  user_id          uuid REFERENCES auth.users(id),
  payload          jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key       text NOT NULL UNIQUE,
  status           text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'sent', 'failed', 'dead')),
  attempts         integer NOT NULL DEFAULT 0,
  last_error       text,
  next_attempt_at  timestamptz NOT NULL DEFAULT now(),
  qstash_message_id text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  sent_at          timestamptz,

  CONSTRAINT notification_outbox_kind_check CHECK (kind IN (
    'order_paid',
    'voucher_issued',
    'voucher_redeemed',
    'supplier_sale',
    'wallet_cashback_earned',
    'abandoned_cart_1',
    'coupon_expiry_48h',
    'coupon_expired',
    'coupon_refunded'
  )),
  CONSTRAINT notification_outbox_recipient_present CHECK (
    (channel = 'email' AND recipient_email IS NOT NULL)
    OR (channel IN ('whatsapp', 'sms') AND recipient_phone IS NOT NULL)
    OR (channel = 'push' AND user_id IS NOT NULL)
  )
);

CREATE INDEX notification_outbox_due_idx
  ON public.notification_outbox (next_attempt_at)
  WHERE status = 'pending';

CREATE INDEX notification_outbox_dead_idx
  ON public.notification_outbox (created_at)
  WHERE status = 'dead';
```

RLS: אדמין SELECT בלבד. drain = service role. אין REST ללקוח.

`fn_enqueue_notification(kind, email, dedupe, payload [, channel, phone, user_id])`:  
בודק suppressions, `ON CONFLICT (dedupe_key) DO NOTHING`, לא זורק ל-caller.

---

## 5. Retry + DLQ דרך QStash

| פרמטר | ערך |
|---|---|
| Max attempts (outbox) | **5** (`NOTIFICATION_MAX_ATTEMPTS`) |
| Backoff דקות | `2 * 4^(attempts-1)` → 2, 8, 32, 128, … |
| Batch ל-drain | **50** |
| QStash retries | **5** (`NOTIFICATIONS_QSTASH_RETRIES`) |
| Failure callback | `POST /api/cron/notifications-dlq` |
| Auth drain | `Bearer CRON_SECRET` או חתימת `Upstash-Signature` |

כללי DLQ:

1. 4xx לא-retryable מ-Resend → מיד `dead` (בלי סולם backoff).  
2. אחרי 5 ניסיונות outbox → `dead` + לוג/Sentry.  
3. QStash exhausted → DLQ route רושם את ה-message; outbox נשאר מקור האמת לשורה.  
4. `dead` על `voucher_issued` / `order_paid` / `supplier_sale` → התראת SEV מיידית (OBS).

בלי `QSTASH_TOKEN` (לוקאלי/CI): cron Vercel/Supabase בלבד; אין כשל במסלול כסף.

---

## 6. ערוצים

| ערוץ | שימוש |
|---|---|
| Resend | כל חמשת האירועים ללקוח/ספק; `Idempotency-Key = dedupe_key` |
| WhatsApp | `voucher_redeemed` + `abandoned_cart_1` (opt-in) בלבד ב-MVP מורחב |
| SMS | fallback ישראלי רק אם מייל+WA נכשלו וזה אירוע קריטי (`voucher_issued`) |
| Push | אחרי השקת אפ/PWA; אותם kinds, `channel=push` |

סודות שרת בלבד:

```
RESEND_API_KEY
EMAIL_FROM
CRON_SECRET
QSTASH_TOKEN
QSTASH_CURRENT_SIGNING_KEY
META_WA_TOKEN
META_WA_PHONE_NUMBER_ID
```

---

## 7. SLA

| מדד | יעד |
|---|---|
| Enqueue אחרי paid/redeem | אותה טרנזקציה |
| מייל ראשון p95 | ≤ 60 שנ' |
| DLQ על issued/paid/supplier_sale | התראה מיידית |
| נטישה | לא יותר מתזכורת אחת / 24ש למשתמש |

---

## 8. Acceptance

- [ ] חמשת האירועים ב-outbox עם templates RTL  
- [ ] QStash wake + DLQ מחוברים  
- [ ] אין מייל כפול קופון (`voucher_issued` ≠ `order_paid`)  
- [ ] נוסח בלי Escrow  
- [ ] כשל enqueue לא שובר תשלום/סריקה  

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-03 | מחזור קופון + Wallet |
| 2026-08-10 | חמשת אירועי הליבה; סכימת outbox מלאה; QStash retry/DLQ מחייב |
