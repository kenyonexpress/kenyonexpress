# PAYOUT-ARCHITECTURE.md
# ארכיטקטורת תשלום לספק (מוצר פיזי) דרך Cardcom

מסמך **קנוני מחייב** ל-payout run על מוצר פיזי: חישוב זכאות, טבלאות, קריאה ל-

```text
POST /api/v11/Financial/TransferFromDigitalBank
```

Reconciliation יומי מול Cardcom, וקיזוז `supplier_debit`.

Status: **BINDING** · עודכן: 2026-08-11  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/CARDCOM-ARCHITECTURE.md
docs/ARCHITECTURE-PAYOUT-MECHANISM.md
docs/VENDOR-PAYOUT-SPEC.md
docs/CONTRADICTIONS.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/GO-LIVE-CHECKLIST.md
docs/GAPS-CODE-VS-DOCS.md
```

יישור: `CARDCOM-ARCHITECTURE.md` §1.5 (Multi-Account / Financial) ו-§7.1 (client v11; אותם `ApiName`/`ApiPassword`/`TerminalNumber` לפעולות כספיות).  
`FINAL-REPORT.md` (בתיקייה הראשית, קריאה בלבד) §7 מתעד חסמי נתונים להשקה; שערי go-live כולל payout: `GO-LIVE-CHECKLIST.md`.

---

## 0. הכרעות מחייבות

| # | הכרעה |
|---|---|
| P1 | **קופון: אין payout** מהפלטפורמה (No Escrow; יתרה בעסק). |
| P2 | **פיזי בלבד:** חלק הספק נצבר אחרי חיוב לקוח מאומת ב-Cardcom + `split_executed`. |
| P3 | ביצוע כסף לספק: **`TransferFromDigitalBank`** מהבנק הדיגיטלי של מסוף הפלטפורמה לחשבון הספק. |
| P4 | מקור סכום = ledger (`settlement_events`) באגורות `bigint`; לא חישוב מחדש מ-`order_items` בזמן התשלום. |
| P5 | טבלאות ריצה: `payout_statements` + שורות + `supplier_bank_accounts`. |
| P6 | זכאות: `payout_available_at` = **T+3 ימי עסקים** (ברירת מחדל; ספק חדש T+14). |
| P7 | מינימום נטו לתשלום: **₪100 = 10_000 אגורות**. מתחת: גלגול. |
| P8 | החזר אחרי payout → `supplier_debit`; קיזוז בבאצ' הבא; אין מחיקת חוב. |
| P9 | Reconciliation **יומי** מול `GetMoneyTransfers` / דוחות Financial. |
| P10 | אישור אדמין חובה לפני קריאת Transfer (לפחות עד יציבות מוכחת). |
| P11 | Fallback: ייצוא CSV + העברה בנקאית ידנית רק אם Transfer נכשל או Financial לא מופעל מסחרית עדיין. |
| P12 | מיגרציות prod רק MCP. לא להריץ את חבילת 026/051/079/081/083/091 כמכלול מת. |

**יחס ל-`ARCHITECTURE-PAYOUT-MECHANISM.md`:** אותו מודל כסף וזכאות; מסמך זה קובע את **צינור הביצוע Cardcom** ואת שם הטבלה הקנוני `payout_statements` (alias מושגי ל-`supplier_payouts`/`payout_batches` במסמך המנגנון). ביישום: טבלה אחת לריצת ספק בשם `payout_statements` או view תואם; לא שני מקורות אמת.

---

## 1. זרימה מקצה לקצה

```text
לקוח משלם פיזי (Cardcom Low Profile / legacy Interface לפי הקוד החי)
  → אימות paid (GetLpResult = מקור אמת; webhook רק טריגר)
  → order paid + snapshot platform_percent
  → settlement_events.kind = charge_settled (supplier_due_agorot)
  → שעון: payout_available_at(occurred_at) <= now()   # T+3
  → שער משלוח: shipped | ready_for_pickup | fulfilled
  → cron שבועי (או ידני): בונה payout_statements (pending_approval)
  → admin מאשר
  → Cardcom TransferFromDigitalBank (סכום נטו באגורות→ILS)
  → status=paid + payment_reference + settlement_events.payout_settled
  → יום למחרת: reconcile מול GetMoneyTransfers
```

קופון לעולם לא נכנס לזרימה זו.

---

## 2. זכאות לשורה

| # | תנאי |
|---|---|
| 1 | `order_items.product_type = 'physical'` |
| 2 | `settlement_status = 'split_executed'` |
| 3 | קיים `settlement_events.kind = 'charge_settled'` עם `supplier_due_agorot > 0` |
| 4 | `payout_available_at(occurred_at) <= now()` |
| 5 | שער משלוח/איסוף עבר |
| 6 | אין שורת payout קיימת לאותו `settlement_event_id` |
| 7 | ספק לא חסום; חשבון בנק `verified_at` + `is_active` |

### 2.1 `payout_available_at` (T+3)

```sql
-- מועתק מ-051 בלי שאר המנוע המת
CREATE OR REPLACE FUNCTION public.add_business_days(
  p_from timestamptz, p_days integer
) RETURNS timestamptz
LANGUAGE sql STABLE AS $$
  -- דילוג שישי-שבת (ישראל); חגים: הרחבה עתידית
  SELECT ...
$$;

CREATE OR REPLACE FUNCTION public.payout_available_at(p_event_at timestamptz)
RETURNS timestamptz
LANGUAGE sql STABLE AS $$
  SELECT public.add_business_days(
    p_event_at,
    COALESCE(
      (SELECT payout_hold_business_days FROM suppliers s
       WHERE s.id = /* supplier from context */ LIMIT 1),
      3
    )
  );
$$;
```

ברירת מחדל: **3 ימי עסקים**. ספק חדש (שלושת החודשים הראשונים): **14**.  
שדות תצורה על `suppliers`: `payout_hold_business_days`, `min_payout_agorot` (ברירת מחדל 10_000).

---

## 3. סכמת נתונים (אגורות `bigint`)

### 3.1 `supplier_bank_accounts`

```sql
CREATE TABLE public.supplier_bank_accounts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id       uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  beneficiary_name  text NOT NULL,
  bank_code         text NOT NULL,   -- 2 ספרות
  branch_code       text NOT NULL,   -- 3 ספרות
  account_number    text NOT NULL,
  business_id       text,            -- ח.פ / ע.מ
  verified_at       timestamptz,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX supplier_bank_accounts_one_active_per_supplier
  ON public.supplier_bank_accounts (supplier_id)
  WHERE is_active;
```

RLS: אין קריאה/כתיבה ל-client. רק service role אחרי `requireAdminSession`.  
אסור ב-REST ציבורי. אסור לוגים/Sentry.

### 3.2 `payout_statements` (ריצת payout פר ספק)

```sql
CREATE TYPE public.payout_statement_status AS ENUM (
  'draft',
  'pending_approval',
  'approved',
  'transfer_submitted',
  'paid',
  'failed',
  'cancelled',
  'rolled_over'
);

CREATE TABLE public.payout_statements (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id        uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  bank_account_id    uuid NOT NULL REFERENCES public.supplier_bank_accounts(id),
  period_start       date NOT NULL,
  period_end         date NOT NULL,
  gross_agorot       bigint NOT NULL CHECK (gross_agorot >= 0),
  debit_agorot       bigint NOT NULL CHECK (debit_agorot >= 0),
  net_agorot         bigint NOT NULL,
  min_payout_agorot  bigint NOT NULL DEFAULT 10000,
  hold_business_days integer NOT NULL DEFAULT 3,
  status             public.payout_statement_status NOT NULL DEFAULT 'draft',
  approved_by        uuid REFERENCES auth.users(id),
  approved_at        timestamptz,
  transfer_submitted_at timestamptz,
  paid_at            timestamptz,
  payment_reference  text,           -- מזהה Cardcom / אסמכתת בנק
  failure_reason     text,
  idempotency_key    text NOT NULL UNIQUE,  -- 'payout:<supplier_id>:<period_end>'
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payout_statements_net_identity
    CHECK (net_agorot = gross_agorot - debit_agorot),
  CONSTRAINT payout_statements_period_ordered
    CHECK (period_end >= period_start)
);

CREATE INDEX payout_statements_supplier_status_idx
  ON public.payout_statements (supplier_id, status);
```

באצ' שבועי אופציונלי: עמודה `batch_id` או טבלת `payout_batches` כמו במנגנון; לא חובה לשני מקורות.

### 3.3 שורות

```sql
CREATE TABLE public.payout_statement_lines (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id        uuid NOT NULL REFERENCES public.payout_statements(id) ON DELETE CASCADE,
  settlement_event_id uuid NOT NULL REFERENCES public.settlement_events(id) ON DELETE RESTRICT,
  order_item_id       uuid REFERENCES public.order_items(id) ON DELETE RESTRICT,
  amount_agorot       bigint NOT NULL,  -- חיובי=זכות; שלילי=קיזוז debit
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX payout_statement_lines_event_once
  ON public.payout_statement_lines (settlement_event_id);
```

---

## 4. אלגוריתם payout run

לכל ספק פעיל, בטרנזקציה:

```text
1. אסוף charge_settled זכאים (§2)           → gross_agorot
2. אסוף supplier_debit שלא קוזזו           → debit_agorot
3. net = gross - debit
4. אם אין חשבון מאומת / ספק חסום / net < 10000 / net <= 0
     → rolled_over או דילוג (בלי Transfer)
5. INSERT payout_statements status=pending_approval
6. INSERT payout_statement_lines
7. אחרי אישור אדמין → status=approved
8. קרא TransferFromDigitalBank (§5)
9. הצלחה → paid + payout_settled ב-ledger
   כשל → failed; fallback CSV (§8) או retry לפי מדיניות
```

`idempotency_key` מונע כפילות אם cron רץ פעמיים.

---

## 5. Cardcom `TransferFromDigitalBank`

לפי `CARDCOM-ARCHITECTURE.md` §1.5:

| שדה בקשה | מקור |
|---|---|
| `ApiName` / `ApiPassword` | env (מפתחות Financial מופרדים כשאפשר) |
| `TerminalNumber` | מסוף פלטפורמה (מספר) |
| `Amount` | `net_agorot / 100` (decimal ILS ל-API; פנימית רק אגורות) |
| `Description` | `payout:{statement_id}` |
| `BeneficiaryBankCode` | `supplier_bank_accounts.bank_code` |
| `BeneficiaryBankBranch` | `branch_code` |
| `BeneficiaryAccountNumber` | `account_number` |

תגובה: boolean / קוד תשובה לפי Swagger v11.  
לפני הפעלה בפרוד: הסכם מאגד/בנק דיגיטלי מול Cardcom + sandbox.

```text
status flow:
  approved
    → transfer_submitted   (אחרי HTTP OK מה-API)
    → paid                 (אחרי אימות reconcile או אישור מיידי אם ה-API אטומי)
    → failed               (שגיאה / דחיית בנק)
```

אין לפצל עגלת לקוח ל-N מסופי ספק. הפלטפורמה סולקת; payout נפרד.

קוד לדוגמה ללקוח v11 (סליקה): `CARDCOM-ARCHITECTURE.md` §7.1. אותו בסיס URL:

```text
https://secure.cardcom.solutions/api/v11
```

לנתיבי `/Financial/*`. הקוד החי היום עדיין legacy `/Interface/*` לסליקת לקוח; מעבר Financial ל-payout הוא שכבה נפרדת אחרי מפתחות v11.

---

## 6. `supplier_debit` וקיזוז

```text
refund ללקוח (Cardcom) על פיזי שכבר שולם לספק
  → settlement_events.kind = supplier_debit (amount > 0 לחוב)
  → בבאצ' הבא: debit_agorot מצטבר מקוזז מ-gross
  → אם net < min אחרי קיזוז: rolled_over
```

אין hard-delete של debit. אין תשלום נטו שלילי.

---

## 7. Reconciliation יומי

| שלב | פעולה |
|---|---|
| 1 | ייצוא `payout_statements` ב-`paid` / `transfer_submitted` ל-24ש האחרונות |
| 2 | Cardcom: `GetMoneyTransfers` (ו/או `FinancialTransactions`) |
| 3 | התאמת `payment_reference` / סכום / חשבון מוטב |
| 4 | חוסר ב-Cardcom: חקירה; אל תסמן paid מחדש |
| 5 | עודף ב-Cardcom בלי statement: freeze + תיק ידני |
| 6 | דוח יומי לאדמין / התראת Sentry על diff |

אין לפתוח מדיה ממומנת / פיזי חדש בהיקף גדול כש-reconcile אדום שלושה ימים ברצף.

---

## 8. Fallback CSV

אם Financial לא זמין מסחרית או Transfer נכשל אחרי N ניסיונות:

1. ייצוא CSV (עמודות כמו `VENDOR-PAYOUT-SPEC.md` §3.1).  
2. העברה ידנית בבנק.  
3. הזנת `payment_reference` → `paid` + `payout_settled`.  

Fallback אינו מבטל את היעד הקנוני (TransferFromDigitalBank).

---

## 9. מסך אדמין

```text
/admin/payouts
```

| פעולה | תוצאה |
|---|---|
| רשימת statements | סטטוס, נטו, ספק |
| אישור / דחייה | audit |
| הפעלת Transfer | רק `approved` |
| סימון paid ידני | רק עם אסמכתה (fallback) |
| דוח reconcile | diff יומי |

סוגר G1 ב-`GAPS-CODE-VS-DOCS.md`.

---

## 10. שערי הפעלה (לפני כסף אמיתי לספק)

- [ ] מסוף Cardcom עם בנק דיגיטלי + הרשאת Transfer  
- [ ] מפתחות API נפרדים לקריאה מול יציאת כסף (יעד)  
- [ ] Sandbox: statement קטן → Transfer → GetMoneyTransfers ירוק  
- [ ] `supplier_bank_accounts` מאומתים לספקי פיזי  
- [ ] Kill switch: השבתת cron Transfer בלי להשבית סליקת לקוח  
- [ ] CSV fallback מתועד ומנוסה  

ראה גם `GO-LIVE-CHECKLIST.md`.

---

## 11. מה אסור

1. לשלם על קופון / שובר.  
2. לקרוא סכומים מ-`order_items` בזמן Transfer.  
3. למחוק `supplier_debit` שלא קוזז.  
4. לאשר Transfer בלי בדיקה שהאירועים עדיין זכאים.  
5. להריץ את מנוע `generate_payout_statement` הישן מ-026 כמות שהוא.  
6. לחשוף פרטי בנק ב-client או בלוגים.  

---

## 12. Acceptance

- [ ] אין שורות coupon ב-statements  
- [ ] T+3 מחושב ב-`payout_available_at`  
- [ ] מינימום 10_000 אגורות מגולגל  
- [ ] UNIQUE על `settlement_event_id` בשורות  
- [ ] Transfer רק אחרי אישור אדמין  
- [ ] reconcile יומי מתועד  
- [ ] כל הסכומים `bigint` אגורות  

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-07 | תכנון ראשון על settlement_events (לפני צינור Cardcom) |
| 2026-08-10 | סומן DEPRECATED לטובת PAYOUT-MECHANISM (CSV ידני) |
| 2026-08-11 | **BINDING מחדש:** TransferFromDigitalBank קנוני; `payout_statements` + bank accounts; T+3; min ₪100; debit; reconcile יומי |
