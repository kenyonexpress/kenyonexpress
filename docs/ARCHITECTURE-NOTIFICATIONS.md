# ARCHITECTURE-NOTIFICATIONS.md

ארכיטקטורת התראות KenyonExpress (מסמך מחייב).

Status: BINDING for `arch/admin-supplier` (2026-07-30)
Worktree בלבד: `/Users/ofir/kenyonexpress-web/ke-arch`. **Documentation only.**
Stack: **Resend** (מייל) + **Supabase Database Trigger** (emit) + **Edge Function / cron worker** (drain). בלי Make. בלי Zapier.
Companions: `docs/ADMIN-PRODUCT-PAGE-SPEC.md`, `docs/ARCHITECTURE-SUPPLIER-PORTAL.md`, `docs/ARCHITECTURE-SEO-PERFORMANCE.md`, `docs/ARCHITECTURE-SECURITY-COMPLIANCE.md`.

---

## 0. אילוצי מודל כסף (חייבים להופיע נכון בהתראות)

| כלל | השלכה על התראות |
|---|---|
| קופון משולם **במלואו באתר** (`coupon_price_ils`) | במייל ללקוח: "שולם באתר" = מחיר הקופון. לא לגזור אחוז משווי העסקה. |
| **אין Escrow** | אסור לומר נאמן / Escrow / J5. מקדמת הקופון נשארת אצל הפלטפורמה. |
| `platform_percent` דינמי | תמיד מהסנאפשוט ב-`order_items`, לא מ-`products` החי. אין 5%/10% קבוע. |
| יתרה בבית העסק | `price_ils - coupon_price_ils` נגבית בסריקת QR אצל הספק, מחוץ לפלטפורמה. |
| פיזי | תשלום מלא באתר (אחרי הנחה); פיצול לספק לפי הסנאפשוט; העברה אחרי T+3 ומינימום payout. |

כסף ב-DB / JSON: **אגורות (integer)**. כסף בגוף המייל: ₪ עם שתי ספרות אחרי הנקודה.

---

## 1. צינור משלוח

```
מוטציית דומיין נשמרת ב-DB
  -> AFTER Trigger / SECURITY DEFINER RPC
  -> INSERT notification_events (dedupe_key ייחודי)
  -> fanout -> notification_log
  -> Edge Function או POST /api/cron/notifications-worker (Bearer CRON_SECRET)
  -> Resend (email) | in-app | Ntfy (אדמין בלבד)
  -> עדכון סטטוס / webhook ספק
  -> אחרי ניסיונות כושלים: DLQ + התראת Ntfy
```

כללים:

1. Webhook של Cardcom, RPC של redeem, ופעולות payout **לא ממתינים** ל-Resend. רק enqueue באותה טרנזקציה כשאפשר.
2. ל-worker יש service role. הדפדפן לא מחזיק מפתחות Resend/Ntfy.
3. מימוש אחד יכול לרוץ כ-Edge Function או כ-cron ב-Next; אותה סמנטיקת drain.

---

## 2. קטלוג אירועים (מלא לפי הדרישה)

| `event_type` | מתי | מקור | קהל עיקרי |
|---|---|---|---|
| `order.paid` | קנייה הושלמה (הזמנה `paid` אחרי אימות Cardcom) | finalize / trigger על `orders` | לקוח |
| `coupon.issued` | שובר נוצר לשורות קופון אחרי תשלום | finalize אחרי insert ל-`vouchers` | לקוח |
| `coupon.redeemed` | קופון נסרק בהצלחה (QR / ידני) | `redeem_voucher` | לקוח (ספק אופציונלי, כבוי כברירת מחדל) |
| `coupon.expired` | קופון פג תוקף בלוח שנה בלי מימוש | `expire_vouchers` / cron | לקוח |
| `payment.failed` | תשלום נכשל / pending פג | payments / cancel path | לקוח; Ntfy בגל |
| `order.physical_supplier_alert` | ספק קיבל הזמנה פיזית אחרי `order.paid` | fanout לפי `supplier_id` | owner/manager של הספק |
| `settlement.split_transferred` | פיצול הועבר (payout statement שולם / העברה נרשמה) | מסלול payout לאדמין | owner של הספק |
| `order.refunded` | זיכוי הושלם | refund finalize | לקוח (+ ספק אם שורותיו הושפעו) |

אירועים תומכים (אותו צינור): `order.pending` (ברירת מחדל בלי מייל), `refund.initiated`, `coupon.redeem_rate_limited` (Ntfy בלבד).

### 2.1 מפת ערוצים

| אירוע | מייל לקוח | in-app לקוח | מייל ספק | Ntfy אדמין |
|---|---|---|---|---|
| `order.paid` | כן | כן | לא (רק דרך התראת פיזי) | לא |
| `coupon.issued` | כן (או מקופל ל-paid) | כן | לא | לא |
| `coupon.redeemed` | כן | כן | כבוי כברירת מחדל | fraud/rate בלבד |
| `coupon.expired` | כן | כן | לא | לא |
| `payment.failed` | כן | כן | לא | בגל |
| `order.physical_supplier_alert` | לא | לא | כן | לא |
| `settlement.split_transferred` | לא | לא | כן | אופציונלי |
| `order.refunded` | כן | כן | אם רלוונטי | לא |
| DLQ / worker stall | לא | לא | לא | כן |

נמעני ספק: `supplier_members` פעילים עם `owner` או `manager` בלבד (לא scanner כברירת מחדל).

---

## 3. מפתחות idempotency

| שכבה | פורמט |
|---|---|
| Fact | `{event_type}:{entity_id}` ב-`notification_events.dedupe_key` |
| Log לנמען | `{channel}:{event_type}:{entity_id}:{recipient_user_id}` |
| Resend | `Idempotency-Key: {notification_log.id}` |
| Ntfy | `ntfy:{kind}:{floor(epoch/300)}` (חלון 5 דק') |

דוגמאות:

| אירוע | Fact key |
|---|---|
| `order.paid` | `order.paid:{order_id}` |
| `coupon.issued` | `coupon.issued:{voucher_id}` |
| `coupon.redeemed` | `coupon.redeemed:{voucher_id}` |
| `coupon.expired` | `coupon.expired:{voucher_id}` |
| `payment.failed` | `payment.failed:{payment_id}` |
| `order.physical_supplier_alert` | `order.physical_supplier_alert:{order_id}:{supplier_id}` |
| `settlement.split_transferred` | `settlement.split_transferred:{payout_statement_id}` |
| `order.refunded` | `order.refunded:{order_id}` |

`INSERT … ON CONFLICT DO NOTHING`. ניסיון חוזר של worker עם אותו מפתח Resend לא יוצר מייל כפול.

---

## 4. Retry + DLQ

### 4.1 הבטחת משלוח

- Enqueue לפחות פעם אחת אחרי commit.
- אפקט אצל הספק (Resend) exactly-once בפועל בזכות idempotency.
- כשל Resend לא מפיל את טרנזקציית הכסף.

### 4.2 לוח ניסיונות

| ניסיון | השהייה עד הבא |
|---|---|
| 1 | מיידי |
| 2 | 2 דק' |
| 3 | 4 דק' |
| 4 | 8 דק' |
| 5 | 16 דק' |
| 6 | 32 דק' ואז `dead` |

Claim: `FOR UPDATE SKIP LOCKED` על שורות due.

### 4.3 DLQ

1. `notification_log.status = 'dead'`
2. Insert ל-`notification_delivery_dlq`
3. Ntfy כשעומק ≥ 25 או על כל insert (לפי קונפיג)
4. Replay ידני מאדמין + `audit_log`
5. לא לזרוק בשקט `order.paid` / `coupon.issued` / `order.refunded` / `settlement.split_transferred`

---

## 5. תבניות מייל RTL בעברית

כל HTML: `dir="rtl"` `lang="he"`. נושא בעברית. משתנים מסנאפשוטים בלבד.

| מפתח תבנית | אירוע | נושא (דוגמה) | תוכן חובה |
|---|---|---|---|
| `customer.order_paid` | `order.paid` | קיבלנו את התשלום · הזמנה {order_short} | שם, מזהה, **שולם באתר ₪X.XX**, יתרה בבית העסק אם קופון / פירוט פיזי |
| `customer.coupon_issued` | `coupon.issued` | הקופון שלך מוכן | שם מוצר, רמז קוד / קישור ארנק, תוקף, שולם באתר, יתרה בבית העסק |
| `customer.coupon_redeemed` | `coupon.redeemed` | הקופון מומש | מוצר, זמן, שם עסק, יתרה שנגבתה בבית העסק |
| `customer.coupon_expired` | `coupon.expired` | הקופון פג תוקף | מוצר, תאריך, זיכוי ארנק אם יש |
| `customer.payment_failed` | `payment.failed` | התשלום לא הושלם | מזהה הזמנה, קישור ניסיון חוזר, תמיכה |
| `supplier.physical_order` | `order.physical_supplier_alert` | הזמנה חדשה לפיזי · {order_short} | שורות, שולם באתר, **platform_percent מהסנאפשוט**, יתרת ספק, קישור פורטל |
| `supplier.split_transferred` | `settlement.split_transferred` | בוצעה העברת פיצול · {statement_short} | סכום, תקופה, מזהה דוח |
| `customer.order_refunded` | `order.refunded` | הזיכוי בוצע · הזמנה {order_short} | סכום, אמצעי, זמן |

איסורים בטקסט: Escrow, עמלה קבועה, הבטחה שהספק מקבל את מקדמת הקופון מהפלטפורמה, חשיפת `platform_percent` ללקוח.

---

## 6. טבלאות DB נדרשות (טיוטת סכימה)

```sql
CREATE TABLE IF NOT EXISTS public.notification_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key   text NOT NULL UNIQUE,
  event_type   text NOT NULL,
  entity_type  text NOT NULL,
  entity_id    uuid NOT NULL,
  user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notification_log (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key         text NOT NULL UNIQUE,
  event_id                uuid NOT NULL REFERENCES public.notification_events(id) ON DELETE CASCADE,
  event_type              text NOT NULL,
  channel                 text NOT NULL CHECK (channel IN ('email', 'inapp', 'ntfy', 'push')),
  recipient_user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_email         text,
  supplier_id             uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  template_key            text,
  status                  text NOT NULL DEFAULT 'queued'
                            CHECK (status IN (
                              'queued', 'retry', 'sending', 'sent', 'failed',
                              'dead', 'skipped', 'skipped_folded'
                            )),
  attempt_count           integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at         timestamptz NOT NULL DEFAULT now(),
  last_error              text,
  provider_message_id     text,
  paid_on_site_agorot     integer CHECK (paid_on_site_agorot IS NULL OR paid_on_site_agorot >= 0),
  coupon_price_agorot     integer CHECK (coupon_price_agorot IS NULL OR coupon_price_agorot >= 0),
  balance_due_agorot      integer CHECK (balance_due_agorot IS NULL OR balance_due_agorot >= 0),
  platform_fee_agorot     integer CHECK (platform_fee_agorot IS NULL OR platform_fee_agorot >= 0),
  supplier_due_agorot     integer CHECK (supplier_due_agorot IS NULL OR supplier_due_agorot >= 0),
  refund_agorot           integer CHECK (refund_agorot IS NULL OR refund_agorot >= 0),
  payout_agorot           integer CHECK (payout_agorot IS NULL OR payout_agorot >= 0),
  platform_percent_snapshot numeric(5,2),
  payload                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  related_log_id          uuid REFERENCES public.notification_log(id) ON DELETE SET NULL,
  sent_at                 timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_log_drain_idx
  ON public.notification_log (status, next_attempt_at)
  WHERE status IN ('queued', 'retry');

CREATE TABLE IF NOT EXISTS public.notification_delivery_dlq (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_log_id uuid REFERENCES public.notification_log(id) ON DELETE SET NULL,
  idempotency_key     text NOT NULL,
  event_type          text NOT NULL,
  channel             text NOT NULL,
  payload             jsonb NOT NULL,
  last_error          text,
  attempt_count       integer NOT NULL,
  status              text NOT NULL DEFAULT 'dead'
                        CHECK (status IN ('dead', 'replayed', 'discarded')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  resolved_at         timestamptz
);

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  channel    text NOT NULL CHECK (channel IN ('email', 'inapp', 'push')),
  enabled    boolean NOT NULL DEFAULT true,
  PRIMARY KEY (user_id, event_type, channel)
);

ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_delivery_dlq ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- לקוח קורא רק in-app שלו. כתיבות: trigger + worker בלבד.
CREATE POLICY notification_log_recipient_read
  ON public.notification_log FOR SELECT TO authenticated
  USING (channel = 'inapp' AND recipient_user_id = auth.uid());

CREATE POLICY notification_preferences_own
  ON public.notification_preferences FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
-- DLQ: בלי policies ללקוח (service role בלבד).
```

פונקציית עזר: `fn_emit_notification_event(...)` → event + fanout ל-`notification_log`.

---

## 7. אבטחה

| בקרה | דרישה |
|---|---|
| סודות | Resend / Ntfy / CRON_SECRET רק בשרת / Edge secrets |
| Auth worker | Bearer cron secret; לא cookie של משתמש |
| RLS | לקוח לא כותב ל-log/events; DLQ סגור ללקוח |
| PII | בלי מספרי כרטיס; קודי שובר ממוסכים בלוגים |
| קצב | Rate limit לנמען; worker נסוג על 429 מ-Resend |
| כסף | אגורות בלוג; מייל מציג ₪; סנאפשוט בלבד |
| Ntfy | אדמין/ops בלבד, לא ללקוחות/ספקים |

---

## 8. Ntfy (אדמין)

| סוג | טריגר |
|---|---|
| `notif.dlq` | insert ל-DLQ או עומק ≥ 25 |
| `notif.worker_stall` | אין drain מוצלח 15 דק' ויש תור |
| `payments.verify_burst` | כשלי אימות Cardcom בגל |
| `redeem.rate_burst` | `rate_limited` בגל |

---

## 9. בדיקות (תמצית)

1. תשלום מוצלח → `order.paid` + `coupon.issued` פעם אחת; replay finalize בלי כפילות.
2. סריקה כפולה → `coupon.redeemed` פעם אחת.
3. פקיעה → `coupon.expired` פעם אחת.
4. הזמנה פיזית → התראת ספק לפי `supplier_id`.
5. סימון payout שולם → `settlement.split_transferred` פעם אחת.
6. כשל Resend ×6 → `dead` + DLQ + Ntfy; replay בטוח.

---

## 10. Acceptance

- [ ] Resend + Trigger + Edge/cron בלי Make/Zapier
- [ ] כל האירועים מהטבלה ב-§2 נפלטים עם מפתחות יציבים
- [ ] תבניות RTL בעברית לכל אירוע חובה
- [ ] Retry + DLQ + Ntfy
- [ ] `notification_log` עם אגורות ו-RLS
- [ ] אין ניסוח Escrow; `platform_percent` מסנאפשוט בלבד להתראות ספק פיזי

---

## 11. Related

`docs/ARCHITECTURE-SEO-PERFORMANCE.md`, `docs/ARCHITECTURE-SUPPLIER-PORTAL.md`, `docs/ADMIN-PRODUCT-PAGE-SPEC.md`.
