# ארכיטקטורה: התראות (Notifications)

תור התראות טרנזקציוניות בעברית: outbox ב-Postgres, Resend (RTL), QStash wake, retry+DLQ.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
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

מודל כסף בנוסח: **שולם באתר** + **יתרה בעסק**. אין נאמן / held / J5.

---

## 0. החלטה (מחייבת)

| # | הכרעה |
|---|---|
| N1 | Outbox Postgres: `public.notification_outbox` (`095`) = מקור אמת למייל טרנזקציוני. |
| N2 | כתיבה יחידה: `fn_enqueue_notification(kind, email, dedupe_key, payload)`. |
| N3 | Emit מ-trigger SECURITY DEFINER; כשל enqueue נבלע (לא מפיל תשלום/מימוש). |
| N4 | Resend + תבניות `lang=he` `dir=rtl`; Idempotency-Key = `dedupe_key`. |
| N5 | Push דרך `push_tokens`; in-app עם `read_at` (טבלה נפרדת `029`). |
| N6 | Retry + DLQ: max 5 attempts; backoff; status `dead` + Sentry + ntfy לכסף. |
| N7 | כסף ב-payload: `*_agorot` integers בלבד. |
| N8 | שיווק רק opt-in (MARKETING). טרנזקציוני לא דורש opt-in שיווקי. |
| N9 | QStash לתזמון (expiry, abandoned cart) + wake drain; לא מחליף outbox. |
| N10 | שני שמות outbox: `notification_outbox` (095) פעיל למייל; `notifications_outbox` (029) ליעד איחוד. |

### ערוצים

| ערוץ | תשתית | תפקיד |
|---|---|---|
| email | Resend | ראשי טרנזקציוני RTL |
| push | Expo/APNs/FCM | אחרי אפ |
| in-app | פעמון RLS owner | מחובר |
| sms | ספק IL | OTP / fallback קריטי |
| ops | ntfy | DLQ / P1 כסף |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| Resend סינכרוני במסלול checkout | latency + failure = lost payment UX; outbox. |
| QStash כמקור אמת לתור | אין durability כ-Postgres TX; wake בלבד. |
| שני drains בלי dedupe_key משותף | מייל כפול; UNIQUE dedupe. |
| float ב-payload | כסף = agorot; MONEY. |
| שיווק בלי opt-in | חוק + deliverability; MARKETING. |
| enqueue שמפיל TX על שגיאה | תשלום לא יכול להיכשל על Resend; swallow. |
| ntfy ללקוח | ops בלבד; Resend/in-app ללקוח. |
| held/נאמן בנוסח מייל | No Escrow; N8 wording. |

---

## 2. סכמת DB (קיים; migrations 095/096)

### notification_outbox (095)

```sql
kind, recipient_email, payload jsonb,
dedupe_key text UNIQUE,
status text CHECK (pending|sent|failed|dead),
attempts int, last_error text, next_attempt_at timestamptz
```

### fn_enqueue_notification

- SECURITY DEFINER
- בדיקת `email_suppressions`
- ON CONFLICT (dedupe_key) DO NOTHING

### kinds

| kind | trigger |
|---|---|
| `order_paid` | paid_at set |
| `supplier_sale` | per supplier after paid |
| `voucher_issued` | הנפקה (096) |
| `voucher_redeemed` | סריקה |
| `coupon_expiry_48h` | QStash schedule |
| `wallet_cashback_earned` | קאשבק |
| `abandoned_cart_1` | שיווקי opt-in |

### notifications_outbox (029)

יעד איחוד רב-ערוצי + in-app bell. מיילים חדשים דרך 095 עד merge.

RLS: אדמין SELECT על outbox; drain = service role בלבד.

---

## 3. Pipeline

```text
אירוע דומיין → trigger → fn_enqueue (same TX)
  → pending → cron/QStash wake → drain SKIP LOCKED
       → Resend (Idempotency-Key = dedupe_key)
       → sent | pending+backoff | dead
  → DLQ: dead + Sentry + ntfy (issued/paid/supplier_sale)
```

Secrets:

```
RESEND_API_KEY, CRON_SECRET, service role (drain only)
```

---

## 4. Resend RTL

```text
נושא: הקופון שלך מוכן · {product_name}
גוף: שולם באתר ₪{paid_now}. יתרה בעסק ₪{balance_at_business}.
CTA: /account/coupons
```

פורמט ₪ בתבנית (`agorot/100`).

---

## 5. Retry + DLQ

| פרמטר | ערך |
|---|---|
| Max attempts | 5 |
| Backoff | 2, 8, 32, 128… דקות |
| Batch drain | 50 |
| 4xx non-retryable | מיד `dead` |

גשר:

```
/api/cron/notifications
/api/cron/notifications-dlq
```

---

## 6. מקרי קצה (טבלת תפעול)

| קוד | מקרה | התנהגות |
|---|---|---|
| N-E1 | Resend 5xx | retry backoff |
| N-E2 | Resend 4xx invalid email | dead + suppression |
| N-E3 | dedupe_key collision | DO NOTHING (idempotent) |
| N-E4 | enqueue fails mid-TX | swallow; payment succeeds |
| N-E5 | drain race שני workers | SKIP LOCKED |
| N-E6 | bounce/complaint | email_suppressions block |
| N-E7 | QStash job כפול | dedupe_id on schedule |
| N-E8 | paid בלי מייל 60s+ | DLQ alert; manual resend |
| N-E9 | marketing ללא opt-in | block enqueue |
| N-E10 | float ב-payload | reject at template layer |

---

## 7. פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | איחוד `notifications_outbox` + `notification_outbox` | migration מתוכנן |
| O2 | push_tokens production wiring | mobile launch |
| O3 | sms provider selection | OTP path |
| O4 | admin UI resend מ-dead | ops backlog |
| O5 | SLA p95 מדיד ב-OBSERVABILITY | ≤60s target |

עודכן: 2026-08-12.

---

## 8. SLA + Acceptance

| מדד | יעד |
|---|---|
| Enqueue after paid/redeem | same TX |
| מייל ראשון p95 | ≤ 60 שנ' |
| DLQ issued/paid/supplier_sale | ntfy מיידי |

- [ ] כל אירוע כסף → fn_enqueue_notification
- [ ] Resend RTL; Idempotency-Key = dedupe_key
- [ ] Retry + DLQ; QStash מתוזמן
- [ ] כשל enqueue לא שובר תשלום
- [ ] agorot ב-payload; נוסח No Escrow
- [ ] חלופות שנדחו + סכמת DB + מקרי קצה + פתוחות

---

## 9. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch #26/50: outbox, Resend, QStash, DLQ |
| 2026-08-12 | batch-2 pass-2: שכתוב לפי תבנית חובה |
