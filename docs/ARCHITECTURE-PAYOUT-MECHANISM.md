# ארכיטקטורה: מנגנון תשלום לספקים (מוצר פיזי)

תשלום יתרת ספק על **מוצר פיזי בלבד**: מתי נצבר, איך יוצא כסף, סכימה באגורות, מסך אישור אדמין, וחריגים.

Status: **BINDING** · עודכן: 2026-08-10  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/PAYOUT-ARCHITECTURE.md
docs/CONTRADICTIONS.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/ARCHITECTURE-SUPPLIER-PORTAL.md
docs/ARCHITECTURE-SUPPLIER-ONBOARDING.md
docs/ARCHITECTURE-ADMIN-DASHBOARD.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/RUNBOOK-PRODUCTION.md
docs/GAPS-CODE-VS-DOCS.md
```

סוגר את G1 ב-
`GAPS-CODE-VS-DOCS.md`
(מסך payouts שבור בפרודקשן). בונים מחדש על
`settlement_events`
; **לא** מחיים את
`payout_statements`
/
`generate_payout_statement`
.

---

## 0. המלצה אחת (מחייבת)

**העברה בנקאית ידנית אחרי אישור אדמין**, מתוך באצ' שבועי, עם ייצוא CSV בפורמט הבנק (מסה"ב / העברות מרובות) לביצוע מחוץ למערכת.

הסיבה: בהיקף הנוכחי אין לסמוך על העברה אוטומטית. הלקוח החי של Cardcom הוא legacy
`/Interface/*.aspx`
(לא v11 Financial), ואין הפרדת מפתחות מוכנה לפעולות שמוציאות כסף. מסה"ב אוטומטי דורש גישה לכסף ומסלול שגוי עולה בכסף אמיתי. המערכת מייצרת רשימה מדויקת, מקוזזת ומאושרת; האדם מבצע את ההעברה ומזין אסמכתה.

קופון: **אין payout** מהפלטפורמה (No Escrow; יתרה נגבית בבית העסק).

---

## 1. הכרעות

| # | הכרעה |
|---|---|
| PY1 | פיזי בלבד. שורות קופון לא נכנסות ל-payout. |
| PY2 | מקור סכום = `settlement_events` (אגורות `bigint`), לא חישוב מחדש מ-`order_items` בזמן תשלום. |
| PY3 | זכאות: `charge_settled` + `split_executed` + שעון T+N ימי עסקים + שער מימוש משלוח (סעיף 2). |
| PY4 | ביצוע כסף: העברה בנקאית ידנית + CSV באצ'; אישור אדמין חובה לפני `paid`. |
| PY5 | סף מינימום מצולם לריצה (ברירת מחדל 100 ₪ = 10_000 אגורות). מתחת לסף: גלגול, בלי שורות. |
| PY6 | ספק חסום / בלי חשבון מאומת: לא נכנס לבאצ'; ריצות ממתינות מתבטלות או מוקפאות. |
| PY7 | אחרי payout: החזר יוצר `supplier_debit` ומתקזז בבאצ' הבא; לא מוחקים חוב. |
| PY8 | מיגרציות prod דרך MCP בלבד. לא מריצים 026/051/079/081/083/091 כמכלול מת. |

---

## 2. מתי משולם (טריגר)

לא "ברגע אישור משלוח בלבד" ולא "אחרי X ימים בלי ledger".

### 2.1 שעון כסף (ראשי)

| תנאי | פירוט |
|---|---|
| סוג | `order_items.product_type = 'physical'` |
| פיצול | `settlement_status = 'split_executed'` |
| ledger | קיים `settlement_events.kind = 'charge_settled'` עם `supplier_due_agorot > 0` |
| עיכוב | `payout_available_at(occurred_at) <= now()` |
| חד-פעמי | אין שורה ב-`supplier_payout_lines` לאותו אירוע |

`payout_available_at` =
`add_business_days(event_at, suppliers.payout_hold_business_days)`
.

ברירת מחדל: **T+3 ימי עסקים**. ספק חדש (שלושת החודשים הראשונים): **T+14** פר ספק.

### 2.2 שער מימוש משלוח (חובה לפני זכאות)

בנוסף לשעון הכסף, השורה חייבת להיות לפחות במצב:

```text
shipped | ready_for_pickup | fulfilled
```

אישור משלוח / איסוף **אינו** מחליף את T+N. הוא מונע תשלום על הזמנה ששולמה ועדיין לא יצאה.

### 2.3 מתי רצה המנוע

```text
/api/cron/payouts
ראשון 03:00 Asia/Jerusalem
כותרת: CRON_SECRET (השוואה בזמן קבוע)
```

ה-cron יוצר באצ' + ריצות ספק במצב
`pending_approval`
. **אף שקל לא יוצא בלי לחיצת אדמין.**

---

## 3. איך משולם (ביצוע)

```text
cron (draft/pending)
  -> /admin/payouts (אישור)
  -> ייצוא CSV באצ'
  -> העברה בבנק (ידנית)
  -> הזנת payment_reference
  -> status = paid
  -> settlement_events.kind = payout_settled (פר שורות ששולמו)
```

| שלב | אחריות |
|---|---|
| יצירת באצ' | cron |
| אישור / דחייה | admin |
| העברת כסף | אדם + בנק |
| סימון שולם | admin (אסמכתה חובה) |

Cardcom Financial ו-מסה"ב אוטומטי **אינם** בנתיב המחייב כעת (סעיף 0).

---

## 4. סכימה (אגורות integer / `bigint`)

כל סכום כסף: **`bigint` אגורות**. אפס `numeric`, אפס float, אפס עמודות בשקלים.

### 4.1 תשתית נדרשת (לא באצ')

```sql
-- פרטי בנק: RLS אדמין בלבד. בלי REST ציבורי.
CREATE TABLE public.supplier_bank_accounts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id       uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  beneficiary_name  text NOT NULL,
  bank_code         text NOT NULL,
  branch_code       text NOT NULL,
  account_number    text NOT NULL,
  business_id       text,
  verified_at       timestamptz,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX supplier_bank_accounts_one_active_per_supplier
  ON public.supplier_bank_accounts (supplier_id)
  WHERE is_active;

-- מ-051 (העתקה נקודתית בלבד): add_business_days + payout_available_at
-- על suppliers: min_payout מוצג ב-UI כ₪; בריצות תמיד מצולם לאגורות.
-- suppliers.payout_hold_business_days integer NOT NULL DEFAULT 3
-- suppliers.min_payout_agorot bigint NOT NULL DEFAULT 10000
```

### 4.2 `payout_batches`

באצ' שבועי אחד = קובץ CSV אחד + מסך אישור אחד.

```sql
CREATE TYPE public.payout_batch_status AS ENUM (
  'draft',
  'pending_approval',
  'partially_approved',
  'approved',
  'exporting',
  'paid',
  'failed',
  'cancelled'
);

CREATE TABLE public.payout_batches (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start        date NOT NULL,
  period_end          date NOT NULL,
  status              public.payout_batch_status NOT NULL DEFAULT 'draft',
  suppliers_count     integer NOT NULL DEFAULT 0,
  gross_agorot        bigint NOT NULL DEFAULT 0,
  debit_agorot        bigint NOT NULL DEFAULT 0,
  net_agorot          bigint NOT NULL DEFAULT 0,
  csv_exported_at     timestamptz,
  csv_storage_path    text,
  approved_by         uuid REFERENCES auth.users(id),
  approved_at         timestamptz,
  paid_at             timestamptz,
  failure_reason      text,
  idempotency_key     text NOT NULL UNIQUE,  -- 'batch:<period_end>'
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT payout_batches_period_ordered
    CHECK (period_end >= period_start),
  CONSTRAINT payout_batches_amounts_nonneg
    CHECK (gross_agorot >= 0 AND debit_agorot >= 0),
  CONSTRAINT payout_batches_net_identity
    CHECK (net_agorot = gross_agorot - debit_agorot)
);
```

### 4.3 `supplier_payouts`

ריצה פר ספק בתוך באצ'.

```sql
CREATE TYPE public.payout_run_status AS ENUM (
  'draft',
  'pending_approval',
  'approved',
  'paid',
  'failed',
  'cancelled'
);

CREATE TABLE public.supplier_payouts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id           uuid NOT NULL REFERENCES public.payout_batches(id) ON DELETE RESTRICT,
  supplier_id        uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  period_start       date NOT NULL,
  period_end         date NOT NULL,
  gross_agorot       bigint NOT NULL,
  debit_agorot       bigint NOT NULL,
  net_agorot         bigint NOT NULL,
  status             public.payout_run_status NOT NULL DEFAULT 'draft',
  rolled_over        boolean NOT NULL DEFAULT false,
  min_payout_agorot  bigint NOT NULL,
  hold_business_days integer NOT NULL,
  bank_account_id    uuid REFERENCES public.supplier_bank_accounts(id),
  approved_by        uuid REFERENCES auth.users(id),
  approved_at        timestamptz,
  paid_at            timestamptz,
  payment_reference  text,
  failure_reason     text,
  idempotency_key    text NOT NULL UNIQUE,  -- 'payout:<supplier_id>:<period_end>'
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT supplier_payouts_amounts_sane
    CHECK (
      gross_agorot >= 0
      AND debit_agorot >= 0
      AND net_agorot = gross_agorot - debit_agorot
    ),
  CONSTRAINT supplier_payouts_period_ordered
    CHECK (period_end >= period_start)
);

CREATE INDEX supplier_payouts_batch_idx
  ON public.supplier_payouts (batch_id);

CREATE INDEX supplier_payouts_supplier_status_idx
  ON public.supplier_payouts (supplier_id, status);
```

`net_agorot` יכול להיות שלילי בחישוב ביניים; **אסור לשלם סכום ≤ 0** (סעיף 6).

### 4.4 שורות (חובה לתקינות כפולה)

```sql
CREATE TABLE public.supplier_payout_lines (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id           uuid NOT NULL REFERENCES public.supplier_payouts(id) ON DELETE CASCADE,
  settlement_event_id uuid NOT NULL REFERENCES public.settlement_events(id) ON DELETE RESTRICT,
  order_item_id       uuid REFERENCES public.order_items(id) ON DELETE RESTRICT,
  amount_agorot       bigint NOT NULL,  -- חיובי = זכות; שלילי = קיזוז debit
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX supplier_payout_lines_event_once
  ON public.supplier_payout_lines (settlement_event_id);
```

אירוע ledger שולם **אם ורק אם** יש לו שורה. תשלום כפול = הפרת UNIQUE.

---

## 5. אלגוריתם באצ' (cron)

לכל ספק פעיל **שאינו חסום**, בטרנזקציה נפרדת:

```text
1. אסוף אירועי charge_settled זכאים (סעיף 2)           -> gross
2. אסוף supplier_debit שלא קוזזו                       -> debit
3. net = gross - debit
4. אם אין חשבון פעיל+מאומת / ספק חסום / net < min / net <= 0
     -> אין INSERT שורות; רישום דילוג / cancelled+rolled_over
5. INSERT payout_batches (פעם אחת לתקופה) אם חסר
6. INSERT supplier_payouts status=pending_approval
7. INSERT supplier_payout_lines (זכויות + חובות)
8. עדכון סכומי באצ' מצטברים
9. commit
```

`idempotency_key` על באצ' ועל ריצת ספק מונע כפילות אם ה-cron רץ פעמיים.

---

## 6. מסך אדמין

נתיב:

```text
/admin/payouts
```

### 6.1 רשימת באצ'ים

| עמודה | תוכן |
|---|---|
| תקופה | `period_start` … `period_end` |
| סטטוס | enum באצ' |
| ספקים | `suppliers_count` |
| ברוטו / קיזוז / נטו | אגורות → תצוגת ₪ |
| CSV | כפתור ייצוא אחרי אישור |

### 6.2 פירוט ריצת ספק

שם ספק, 4 ספרות אחרונות של חשבון, `gross` / `debit` / `net`, פירוט שורות עד הזמנה.

### 6.3 שערים לפני `approved`

1. חשבון בנק פעיל עם `verified_at`.  
2. ספק לא חסום / לא מושעה.  
3. `net_agorot > 0` ו-`>= min_payout_agorot`.  
4. אין dispute פתוח על הספק.  
5. **בדיקה מחדש:** כל שורה עדיין לא `refunded` מאז יצירת הריצה (בין הלילה לבוקר יכול להיכנס החזר).

אישור נכתב ל-
`audit_log`
ואינו הפיך. מעבר ל-`paid` דורש
`payment_reference`
לא ריק.

### 6.4 הרשאות

| תפקיד | יכולת |
|---|---|
| admin | אישור, ייצוא CSV, סימון paid/failed |
| support | קריאה בלבד (בלי mark paid) |
| ספק | רואה ריצות `approved`/`paid` שלו בפורטל; לא רואה פרטי בנק מלאים של אחרים |

---

## 7. Edge cases

### 7.1 החזר אחרי payout

1. מסלול refund כותב `settlement_events.kind = 'supplier_debit'`.  
2. האירוע **לא** נמחק ולא מסומן "סגור" ידנית.  
3. הבאצ' הבא מכניס אותו כשורה שלילית (UNIQUE צורך אותו פעם אחת).  
4. אם אין זכויות עתידיות לקיזוז מעל 60 יום: פריט בגבייה במסך אדמין (לא מחיקה שקטה).

T+3 קיים כדי שרוב ההחזרים ייקלטו **לפני** התשלום ולא אחריו.

### 7.2 ספק חסום / מושעה

| מצב | התנהגות |
|---|---|
| לפני באצ' | דילוג מוחלט; אין `supplier_payouts` |
| `pending_approval` | ביטול אוטומטי ל-`cancelled`; שורות לא נצרכות מחדש (או rollback שורות אם עדיין לא approved) |
| `approved` טרם paid | הקפאה: אסור CSV / אסור mark paid עד שחרור חסימה + אישור חוזר |
| אחרי `paid` | אין clawback אוטומטי; חוב עתידי דרך `supplier_debit` בלבד |

חסימה גם חוסמת redeem/publish לפי
`ARCHITECTURE-ADMIN-DASHBOARD.md`
; payout הוא שער נוסף, לא תחליף.

### 7.3 מתחת לסף / נטו ≤ 0

`rolled_over = true`, `status = cancelled`, **אפס שורות**. האירועים נשארים פתוחים לבאצ' הבא. אסור לדווח לאדמין ש"נוצר תשלום".

### 7.4 בלי חשבון מאומת

דילוג בשם הספק בדוח באצ' (`skipped_unverified_bank`). לא חוסם סריקת קופונים (ONBOARDING O3).

### 7.5 קופון בטעות ברשימה

אם generator מנסה לכלול קופון: reject בבדיקת PY1. אין מסלול Escrow/held/J5.

---

## 8. אינווריאנטות

| # | טענה |
|---|---|
| I1 | אירוע ledger לא בשתי ריצות (`supplier_payout_lines_event_once`) |
| I2 | `net = gross - debit` בבאצ' ובריצת ספק |
| I3 | באצ'/ריצה לא נוצרים פעמיים לאותה תקופה (`idempotency_key`) |
| I4 | אין תשלום מתחת לסף או על נטו ≤ 0 |
| I5 | אין תשלום בלי חשבון מאומת ובלי אישור אדמין |
| I6 | לשובר אין payout |
| I7 | כל סכום באגורות `bigint` |
| I8 | ספק חסום לא מגיע ל-`paid` |

---

## 9. סדר בנייה

```text
1. supplier_bank_accounts + RLS אדמין
2. add_business_days + payout_available_at (העתקה מ-051)
3. payout_batches + supplier_payouts + supplier_payout_lines + enums
4. חישוב טהור + vitest (סף, גלגול, קיזוז, חסום, refund אחרי paid)
5. /api/cron/payouts
6. /admin/payouts (החלפת המסך השבור)
7. ייצוא CSV לבנק
```

מיגרציות: MCP, אחת-אחת, עם
`SELECT`
אימות אחרי כל אחת.

---

## 10. Acceptance

- [ ] באצ' שבועי נוצר עם `idempotency_key` יציב  
- [ ] רק פיזי + T+N + שער משלוח נכנסים  
- [ ] אישור אדמין חובה; paid רק עם אסמכתה  
- [ ] CSV באצ' תואם פורמט הבנק  
- [ ] החזר אחרי paid → debit בבאג' הבא  
- [ ] ספק חסום לא משולם  
- [ ] קופון: 0 שורות payout  
- [ ] אין float / numeric בסכימת payout  

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-10 | מסמך מחייב: T+N + שער משלוח; באצ' + ריצות; העברה ידנית+CSV; edge cases |
