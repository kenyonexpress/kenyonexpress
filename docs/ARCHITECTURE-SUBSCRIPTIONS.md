# ARCHITECTURE-SUBSCRIPTIONS.md
# ארכיטקטורה: מנוי חודשי (Cardcom Recurring Token)

מודל מנוי מלא: הצטרפות, מחזור חיוב, כשלי חיוב ו-retry, ביטול/הקפאה, וזכויות צרכן.  
לא חלק מהשקת הקופונים. דורש threat model + מיגרציה + אישור עו״ד לניסוח ללקוח לפני קוד פרוד.

Status: **BINDING (design)** · עודכן: 2026-08-11  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/SUBSCRIPTIONS-BILLING-SPEC.md
docs/BUSINESS-MODEL.md
docs/CARDCOM-ARCHITECTURE.md
docs/ARCHITECTURE-COMMERCE.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
docs/REFUNDS-CANCELLATION-POLICY.md
docs/CHECKOUT-OPTIMIZATION.md
docs/EMAIL-TEMPLATES-SPEC.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/CONTRADICTIONS.md
docs/GO-LIVE-CHECKLIST.md
```

**יחס ל-`SUBSCRIPTIONS-BILLING-SPEC.md`:** המסמך הזה = הכרעות ארכיטקטורה מחייבות. ה-SPEC נשאר לסיכום מוצר קצר ומפנה לכאן.

---

## 0. הכרעות מחייבות

| # | הכרעה |
|---|---|
| SU1 | סוג מוצר: `products.type = 'subscription'`. |
| SU2 | Interval ראשוני: **`monthly`** בלבד. שנתי = phase 2 על אותו מודל. |
| SU3 | סכומים: integer **agorot** בכל מקום פנימי. |
| SU4 | אמצעי: **Cardcom Token** אחרי חיוב ראשון מוצלח (`ChargeAndCreateToken` / מקבילה legacy `ChargeToken` לפי הקוד החי). |
| SU5 | אין Escrow. מנוי ≠ מקדמת קופון. אין held לספק. |
| SU6 | פיצול לספק (אם יש): `platform_percent` **snapshot פר מחזור חיוב**, כמו commerce. |
| SU7 | משתמש מחובר חובה בהצטרפות (לא אורח). |
| SU8 | Cron חיוב: idempotency מפתח `(subscription_id, billing_period)`. |
| SU9 | ביטול מנוי: מאזור אישי + `/cancel` לפי דין; ניסוח סופי **[דורש עו״ד]**. |
| SU10 | Apple/Google IAP: **מחוץ למסמך** (כללי חנות נפרדים). |
| SU11 | מיגרציות prod רק MCP. לא חלק מ-soft-open קופונים. |

---

## 1. מה הלקוח קונה

| רכיב | פירוט |
|---|---|
| מוצר | קורס / שירות מתמשך / גישה תקופתית (לא קופון מימוש בעסק) |
| מחיר | `recurring_amount_agorot` בדף המוצר (או `recurring_amount` שמומר לאגורות) |
| מחזור | חודש קלנדרי או 30 ימים מ-`anchor` (הכרעה מוצר: **חודש מ-`paid_at` הראשון**, Asia/Jerusalem) |
| מספר מחזורים | `max_billing_cycles` או `null` = ללא הגבלה |
| הנפקה | כל חיוב מוצלח = שורת `orders` + `subscription_invoices` |

אין לערבב במנוי זה הנפקת voucher למימוש בעסק בלי מפרט נפרד.

---

## 2. מודל נתונים

### 2.1 שדות מוצר

| שדה | סוג | הערה |
|---|---|---|
| `type` | `'subscription'` | |
| `billing_interval` | `'monthly'` | CHECK |
| `recurring_amount_agorot` | `bigint` | מקור אמת לתצוגה ולחיוב |
| `max_billing_cycles` | `int` null | null = אין תקרה |
| `platform_percent` | כמו שאר המוצרים | חובה לפרסום |

### 2.2 `subscriptions`

```sql
CREATE TYPE public.subscription_status AS ENUM (
  'incomplete',   -- חיוב ראשון לא הושלם
  'active',
  'past_due',     -- כשל soft; בחלון retry
  'paused',       -- השהיה יזומה
  'cancelled',
  'expired'       -- הגיע max_cycles או בוטל אחרי תקופה ששולמה
);

CREATE TABLE public.subscriptions (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                    uuid NOT NULL REFERENCES auth.users(id),
  product_id                 uuid NOT NULL REFERENCES public.products(id),
  supplier_id                uuid REFERENCES public.suppliers(id),
  status                     public.subscription_status NOT NULL DEFAULT 'incomplete',
  amount_agorot              bigint NOT NULL,              -- snapshot ממחיר המוצר בהצטרפות
  platform_percent_snapshot  numeric(5,2) NOT NULL,
  billing_interval           text NOT NULL DEFAULT 'monthly'
                             CHECK (billing_interval = 'monthly'),
  cardcom_token              text,                         -- server-only; לא ל-client
  cardcom_token_exp          text,                         -- MMYY אם זמין
  card_last4                 text,                         -- תצוגה בלבד
  next_billing_at            timestamptz,
  current_period_start       timestamptz,
  current_period_end         timestamptz,
  cycles_completed           integer NOT NULL DEFAULT 0,
  max_billing_cycles         integer,                      -- null = unlimited
  retry_count                integer NOT NULL DEFAULT 0,
  cancel_at_period_end       boolean NOT NULL DEFAULT false,
  cancelled_at               timestamptz,
  cancel_reason              text,
  paused_at                  timestamptz,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);
```

RLS: לקוח `own` read; כתיבות כסף/טוקן רק service role אחרי שער שרת.

### 2.3 `subscription_invoices`

```sql
CREATE TYPE public.subscription_invoice_status AS ENUM (
  'pending', 'paid', 'failed', 'refunded', 'void'
);

CREATE TABLE public.subscription_invoices (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id   uuid NOT NULL REFERENCES public.subscriptions(id),
  order_id          uuid REFERENCES public.orders(id),
  period_start      timestamptz NOT NULL,
  period_end        timestamptz NOT NULL,
  amount_agorot     bigint NOT NULL,
  status            public.subscription_invoice_status NOT NULL DEFAULT 'pending',
  attempt_count     integer NOT NULL DEFAULT 0,
  last_attempt_at   timestamptz,
  cardcom_ref       text,
  failure_code      text,
  idempotency_key   text NOT NULL UNIQUE,  -- sub:{subscription_id}:{period_start_iso}
  created_at        timestamptz NOT NULL DEFAULT now()
);
```

---

## 3. הצטרפות (חיוב ראשון + Token)

```text
PDP type=subscription
  → חובה session (Google / OTP)
  → הצגת מחיר חודשי + תנאי ביטול (קישור)
  → Low Profile: ChargeAndCreateToken (או ChargeOnly + יצירת טוקן לפי מסוף)
  → return / webhook → אימות GetLpResult (מקור אמת; כמו checkout רגיל)
  → אם הצליח:
       INSERT subscriptions status=active
       שמירת cardcom_token (server-only)
       invoice #1 paid + order paid
       next_billing_at = period_end
       מייל subscription_started + קישור ביטול
  → אם נכשל:
       status=incomplete או מחיקת טיוטה; אין טוקן לשימוש חוזר
```

כללי כסף בחיוב ראשון:

- סכום = `recurring_amount_agorot` (לא face של קופון).  
- Snapshot `platform_percent` לשורת order/invoice.  
- Kill switch: אותו `CHECKOUT_ENABLED` או דגל `SUBSCRIPTIONS_ENABLED` נפרד (מומלץ נפרד כדי לא לחסום קופונים).

---

## 4. מחזור חיוב (cron)

```text
Cron (שעתי או יומי, CRON_SECRET):
  SELECT * FROM subscriptions
  WHERE status = 'active'
    AND cancel_at_period_end = false
    AND next_billing_at <= now()
    AND (max_billing_cycles IS NULL OR cycles_completed < max_billing_cycles)

  לכל מנוי, טרנזקציה אחת:
    1. INSERT invoice pending עם idempotency_key
       (ON CONFLICT DO NOTHING → יציאה בטוחה)
    2. ChargeToken / API טוקן בסכום amount_agorot
    3a. הצלחה:
          invoice=paid, order חדש, settlement אם פיזי/שירות עם ספק
          cycles_completed++
          קדם current_period_* ו-next_billing_at בחודש
          אם cycles_completed >= max → status=expired/cancelled
          מייל invoice_paid
    3b. כשל → סעיף 5
```

**אין double-charge:** המפתח הייחודי לתקופה הוא חומת האש.  
חיוב ידני מאדמין חייב אותו מפתח או מפתח `manual:{invoice_id}`.

תזמון `next_billing_at`: לשמור על יום העוגן כשאפשר (למשל 11 בכל חודש); אם אין יום בחודש (31→30/28) → יום אחרון בחודש.

---

## 5. כשלי חיוב ו-retry

### 5.1 סיווג

| סוג | דוגמאות | התנהגות |
|---|---|---|
| Soft decline | אין כיסוי, bank decline זמני | `past_due` + retry |
| Hard decline | כרטיס גנוב/חסום, טוקן לא תקף | עצירת retry; בקשת עדכון אמצעי |
| Technical | timeout, 5xx Cardcom | retry עם backoff; לא לספור כ-hard מיד |

### 5.2 מדיניות retry (יעד מוצר)

| ניסיון | מתי | פעולה |
|---|---|---|
| 1 | מיידי ב-cron | ChargeToken |
| 2 | +2 ימים | ChargeToken + מייל תזכורת |
| 3 | +5 ימים מניסיון 1 | ChargeToken + מייל דחוף |
| אחרי 3 כשלונות soft בחלון 7 ימים | | `paused` או `cancelled` לפי מדיניות; גישה נחסמת |

`retry_count` ו-`last_attempt_at` על המנוי/invoice.  
אותו `idempotency_key` לתקופה בכל הניסיונות (לא מפתח חדש לכל retry של אותה תקופה).

### 5.3 עדכון אמצעי תשלום

```text
חשבון → "עדכון כרטיס"
  → Low Profile CreateTokenOnly או ChargeAndCreateToken בסכום 0/אימות לפי מסוף
  → החלפת cardcom_token בשרת
  → אם past_due: ניסיון מיידי לחיוב התקופה הפתוחה (אותו idempotency_key)
```

Rate limit fail-closed על עדכון כרטיס.  
אין לשמור PAN/CVV (SAQ-A).

### 5.4 התראות

| אירוע | מייל kind (יעד) |
|---|---|
| הצטרפות | `subscription_started` |
| חיוב הצליח | `subscription_invoice_paid` |
| כשל soft | `subscription_payment_failed` |
| נחסם אחרי retries | `subscription_paused_payment` |
| בוטל | `subscription_cancelled` |

RTL / Resend לפי `EMAIL-TEMPLATES-SPEC.md`. להוסיף kinds לפני השקת מנויים.

---

## 6. ביטול והקפאה

### 6.1 מכונת מצבים (תמצית)

```text
incomplete → active          (חיוב ראשון OK)
active → past_due            (soft fail)
past_due → active            (retry/עדכון כרטיס OK)
active|past_due → paused     (משתמש/admin)
paused → active              (חידוש + אמצעי תקף)
active|paused|past_due → cancelled
active → expired             (max_cycles)
```

### 6.2 ביטול ע״י לקוח

| מצב | התנהגות יעד |
|---|---|
| ביטול מיידי | `cancelled`; אין חיוב עתידי; גישה עד `current_period_end` אם התקופה שולמה |
| `cancel_at_period_end=true` | נשאר `active` עד סוף התקופה; cron לא מחדש |
| תוך חלון ביטול עסקה ראשונה | ראה סעיף 7 (החזר אפשרי לפי דין) |

UI חובה באזור אישי: כפתור "ביטול מנוי", אישור בעברית, סיכום "לא תחויבו שוב אחרי {date}".

Admin יכול לבטל/להשהות עם audit.

### 6.3 הקפאה (`paused`)

- Cron מדלג על חיוב.  
- אין גישה לתוכן בתשלום (אלא אם מדיניות מוצר אומרת אחרת).  
- חידוש: משתמש מאשר + אמצעי תקף → `active`; אם התקופה פגה בזמן pause → חיוב מיידי לתקופה חדשה או יישור תאריכים (הכרעת מוצר: **חיוב מיידי לתקופה חדשה**).

---

## 7. זכויות צרכן (ישראל): כיוון הנדסי

**[דורש עו״ד]** לפני פרסום ללקוחות. המסמך אינו ייעוץ משפטי.

| נושא | כיוון מוצר | מקור פנימי |
|---|---|---|
| שקיפות מחיר | מחיר חודשי, תדירות, תנאי ביטול בדף לפני תשלום | BUSINESS-MODEL |
| ביטול מנוי מתמשך | מנגנון ביטול פשוט באזור אישי + אישור במייל | LEGAL / REFUNDS |
| עסקת מכר מרחוק (חיוב ראשון) | חלון 14 יום כשחל החוק ואין פטור; דמי ביטול לפי REFUNDS | LEGAL L2/L3 |
| אחרי תחילת שימוש בשירות דיגיטלי | ייתכן פטור/הגבלה לביטול 14 יום **[דורש עו״ד]** | |
| חיובים חוזרים אחרי ביטול | אסורים; cron חייב לכבד `cancelled` / `cancel_at_period_end` | SU8/SU9 |
| החזר על מחזור ששולם | לפי דין + מדיניות; לא אוטומטי אחרי שימוש מלא בתקופה | REFUNDS |
| הודעות | אישור הצטרפות, כשל חיוב, ביטול | EMAIL |
| נגישות | כפתורי ביטול נגישים (ת״י 5568 כיוון) | LEGAL |

קישור ביטול גם מ-footer / `/cancel` כשחל על עסקת ההצטרפות.

נוסח ללקוח (כיוון):

> ניתן לבטל מנוי בכל עת מאזור אישי. הביטול ייכנס לתוקף בסוף התקופה ששולמה, אלא אם חלה זכות ביטול נוספת לפי חוק על העסקה הראשונה.

---

## 8. כסף לספק (אם רלוונטי)

| מקרה | התנהגות |
|---|---|
| מנוי פלטפורמה טהור (תוכן שלנו) | אין payout לספק |
| מנוי לשירות ספק | פר חיוב: snapshot `platform_percent`; יתרה לספק לפי `PAYOUT-ARCHITECTURE.md` אם מוגדר כפיזי/שירות משולם לספק |

אין לערבב עם No Escrow של קופון.

---

## 9. אבטחה ו-observability

| כלל | פירוט |
|---|---|
| Token | עמודה מופרדת; service role בלבד; לא ב-Sentry |
| Secrets | `ApiPassword` רק לנתיבי ChargeToken / refund / payout |
| Rate limit | fail-closed על subscribe, update-card, cancel spam |
| Audit | כל שינוי `status`, החלפת טוקן, ביטול admin |
| Alert | spike ב-`past_due` / כשל cron המוני |
| Idempotency | חובה בכל ChargeToken למנוי |

Threat model קצר לפני קוד: גניבת טוקן מ-DB, double-charge, ביטול שלא נאכף ב-cron.

---

## 10. אנליטיקה (יעד)

| event | מתי |
|---|---|
| `subscribe` | אחרי active |
| `subscription_renew` | חיוב חוזר paid |
| `subscription_payment_failed` | כשל |
| `subscription_cancel` | ביטול |
| `subscription_pause` / `resume` | הקפאה/חידוש |

בלי PII; כסף מאגורות. Consent לפי `ANALYTICS-SPEC.md`.

---

## 11. סדר יישום

```text
1. Threat model + אישור עו״ד לניסוח ביטול
2. מיגרציית subscriptions + invoices (MCP)
3. הצטרפות + Token + מיילים
4. Cron חיוב + idempotency + retry
5. UI ביטול/הקפאה/עדכון כרטיס
6. דגל SUBSCRIPTIONS_ENABLED בפרוד
7. Soft-open מנויים נפרד מקופונים
```

---

## 12. Acceptance

- [ ] אין מנוי `active` בלי חיוב ראשון מאומת  
- [ ] אין ChargeToken בלי `idempotency_key` ייחודי לתקופה  
- [ ] soft decline → בדיוק מדיניות 3 ניסיונות / 7 ימים  
- [ ] hard decline → אין לולאת חיוב אינסופית  
- [ ] ביטול מונע את החיוב הבא  
- [ ] טוקן לא ב-client bundle / לוגים  
- [ ] אין שפת Escrow  
- [ ] ניסוח צרכן אושר ע״י עו״ד לפני פרסום  
- [ ] `SUBSCRIPTIONS_ENABLED` נפרד מ-`CHECKOUT_ENABLED` או מתועד כמשותף  

---

## 13. Out of scope

- מנוי שמנפיק קופוני מימוש חודשיים  
- שנתי עם הנחה (phase 2)  
- מאגד Cardcom / מסוף פר ספק לחיוב מנוי  
- IAP בחנויות אפ  

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-11 | ארכיטקטורת מנוי חודשי מלאה: Token, מחזור, retry, ביטול/הקפאה, זכויות צרכן |
