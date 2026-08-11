# ארכיטקטורה: התראות (Notifications)

תור התראות טרנזקציוניות בעברית: outbox ב-Postgres, Resend (RTL), QStash wake, retry+DLQ.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: `arch/docs-batch-2` · batch #26/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-EMAIL-TEMPLATES.md
docs/ARCHITECTURE-NOTIFICATIONS-MARKETING.md
docs/ARCHITECTURE-OBSERVABILITY.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
docs/CONTRADICTIONS.md
supabase/migrations/095_notification_outbox.sql
supabase/migrations/096_notification_voucher_issued.sql
```

---

## 0. המלצה אחת

**Outbox ב-Postgres + `fn_enqueue_notification` באותה TX של האירוע + drain + Resend (RTL) + retry/DLQ.**  
כשל enqueue נבלע ב-trigger ולא מפיל תשלום/מימוש. אין מייל סינכרוני במסלול כסף.

| ערוץ | תשתית | תפקיד |
|---|---|---|
| email | Resend | ראשי לטרנזקציוני (עברית RTL) |
| push | `push_tokens` → Expo/APNs/FCM | אחרי השקת אפ |
| in-app | פעמון (RLS owner) | תמיד לטרנזקציוני מחובר |
| sms | ספק ישראלי | OTP / fallback קריטי בלבד |
| ops | ntfy | DLQ / P1 כסף; לא ללקוח |
| תזמון | QStash + `next_attempt_at` | expiry, abandoned, wake |

---

## 1. הכרעות

| # | הכרעה |
|---|---|
| N1 | תור מייל פעיל: `public.notification_outbox` (`095`). |
| N2 | כתיבה יחידה: `fn_enqueue_notification(kind, email, dedupe_key, payload)`. |
| N3 | Emit מ-trigger / SECURITY DEFINER; enqueue swallow errors. |
| N4 | Resend + תבניות `lang=he` `dir=rtl`. |
| N5 | Push דרך `push_tokens`; in-app עם `read_at`. |
| N6 | Retry + DLQ חובה; `dedupe_key` UNIQUE = Idempotency-Key ל-Resend. |
| N7 | כסף ב-payload: `*_agorot` integers בלבד. |
| N8 | נוסח: "שולם באתר" + "יתרה בעסק". אסור נאמן / held / J5. |
| N9 | שיווק רק עם opt-in (ראה MARKETING). טרנזקציוני לא דורש opt-in שיווקי. |
| N10 | QStash לתזמון + wake אופציונלי; לא מחליף outbox כמקור אמת. |

### שני שמות outbox

| טבלה | שימוש |
|---|---|
| `notification_outbox` (`095`) | **פעיל** ל-email drain (paid / supplier_sale / voucher_*) |
| `notifications_outbox` (`029`/`031`) | רב-ערוצי + פעמון; יעד איחוד הדרגתי |

מיילים טרנזקציוניים חדשים עוברים ב-`095`. אסור שתי מערכות ששולחות אותו מייל בלי `dedupe_key` משותף.

---

## 2. Pipeline

```text
אירוע דומיין (paid / redeem / voucher_issued / …)
  → trigger SECURITY DEFINER
  → fn_enqueue_notification (אותה TX; ON CONFLICT dedupe DO NOTHING)
  → notification_outbox status=pending
  → wake: CF Queue / Cron / QStash / גשר /api/cron/notifications
  → drain FOR UPDATE SKIP LOCKED
       email → Resend (Idempotency-Key = dedupe_key)
       push  → push_tokens
       inapp → שורת פעמון
       → sent | pending+backoff | dead
  → DLQ: status=dead + cron DLQ + Sentry (+ ntfy לכסף)
```

Secrets: `RESEND_API_KEY`, service role ל-drain בלבד, `CRON_SECRET`, מפתחות push. אין service role בדפדפן.

### QStash

| שימוש | דפוס |
|---|---|
| `coupon_expiry_48h` | schedule/delay + `dedupe_id=expiry48:{voucher_id}` → enqueue |
| `abandoned_cart_1` | delay אחרי עגלה; opt-in לפני enqueue שיווקי |
| Wake drain | אופציונלי אחרי INSERT outbox |
| Retry Resend | על `next_attempt_at` ב-outbox; QStash לא משכפל מייל בלי dedupe |

חתימת Upstash על כל job. כשל QStash ≠ כשל תשלום.

### סכימה (תמצית מ-`095`)

```sql
-- notification_outbox
kind, recipient_email, payload jsonb, dedupe_key UNIQUE,
status (pending|sent|failed|dead), attempts, last_error, next_attempt_at
-- fn_enqueue_notification: SECURITY DEFINER; suppression check; ON CONFLICT DO NOTHING
```

RLS: אדמין SELECT; drain = service role. לקוח לא קורא את טבלת המייל.

| kind | מתי |
|---|---|
| `order_paid` | `paid_at` null→set |
| `supplier_sale` | per supplier אחרי paid |
| `voucher_issued` | הנפקה (`096`) |
| `voucher_redeemed` | סריקה |
| `coupon_expiry_48h` | תזמון |
| `wallet_cashback_earned` | קאשבק |
| `abandoned_cart_1` | שיווקי (opt-in) |

---

## 3. Resend RTL

מעטפת: `lang=he`, `dir=rtl`, מותג `#fed700`, plaintext מקביל.

```text
נושא: הקופון שלך מוכן · {product_name}
גוף: שולם באתר ₪{paid_now}. יתרה בעסק ₪{balance_at_business}.
CTA: /account/coupons
```

פורמט ₪ רק בתבנית (`agorot/100`). Idempotency-Key = `dedupe_key`.

---

## 4. Retry + DLQ

| פרמטר | ערך |
|---|---|
| Max attempts | 5 |
| Backoff | 2, 8, 32, 128, … דקות על `next_attempt_at` |
| Batch | 50 לשורות drain |
| 4xx לא-retryable | מיד `dead` |
| אחרי 5 כשלונות | `dead` + Sentry + cron DLQ |
| גשר | `/api/cron/notifications` + `/api/cron/notifications-dlq` |

`voucher_issued` / `order_paid` / `supplier_sale` ב-dead → התראת מפעיל מיידית (ntfy).

---

## 5. העדפות (תמצית)

- טרנזקציוני: ברירת מחדל true.
- שיווקי: ברירת מחדל false + `consent_events` (ראה MARKETING).
- `email_suppressions`: bounce/complaint נבדקים לפני INSERT.

---

## 6. SLA + Acceptance

| מדד | יעד |
|---|---|
| Enqueue אחרי paid/redeem | אותה TX |
| מייל ראשון p95 | ≤ 60 שנ' |
| DLQ על issued/paid/supplier_sale | התראה מיידית |

- [ ] כל אירוע כסף כותב outbox דרך `fn_enqueue_notification`
- [ ] Resend RTL; Idempotency-Key = dedupe_key
- [ ] Retry + DLQ לפי §4; QStash לתזמון מתועד
- [ ] כשל enqueue לא שובר תשלום
- [ ] אין שיווק בלי opt-in; agorot ב-payload; נוסח "שולם באתר" + "יתרה בעסק"

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch #26/50: ריענון BINDING ממוקד (outbox, Resend RTL, QStash, DLQ) |
| 2026-08-12 | batch-2 #26 pass-2: BINDING על arch/docs-batch-2 (המשך תור) |
