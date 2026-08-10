# PAYOUT-ARCHITECTURE.md

המנגנון החסר: תשלום לספק על מוצר פיזי.

Status: **DESIGN** · 2026-08-07 · Scope: docs only
סוגר את `GAPS-CODE-VS-DOCS.md` ‏**G1**, החוסם היחיד בדרגה 1.

מסמך מחייב מעודכן (סכימת באצ' + שער משלוח + ביצוע):

```
docs/ARCHITECTURE-PAYOUT-MECHANISM.md
```

---

## 0. מה קיים, מה לא, ומה שכבר נכתב פעם אחת ומת

**הכל נמדד מול הפרודקשן ב-07.08, לא נקרא מקובצי המיגרציה.**

### לא קיים בפרודקשן

```
to_regclass('public.payout_statements')        -> null
to_regclass('public.supplier_payouts')         -> null
to_regclass('public.payouts')                  -> null
to_regclass('public.supplier_bank_accounts')   -> null
to_regproc('public.generate_payout_statement') -> null
enum public.payout_status                      -> אינו קיים
```

**ל-`suppliers` אין ולו עמודה בנקאית אחת.** ‏18 עמודות, ואף אחת מהן אינה בנק,
סניף, חשבון או שם מוטב. ‏`LAUNCH-CHECKLIST.md` ‏B2 מבקש ממך לאסוף פרטי בנק
מספקים; **כרגע אין לאן לשים אותם.**

### כן קיים, ועליו נבנה

| אובייקט | מה יש בו |
|---|---|
| `settlement_events` | ה-ledger. אגורות `bigint`, ‏`idempotency_key` ייחודי, ‏`supplier_id`, ‏`order_item_id` |
| `settlement_events.kind` | ‏CHECK עם 7 ערכים, וביניהם כבר **`payout_settled`** ו-**`supplier_debit`** |
| `order_items.supplier_immediate_agorot` | חלק הספק פר שורה, `integer` |
| `order_items.settlement_status` | ‏`split_executed` הוא המצב שממנו נצבר חוב |
| `supplier_members` | מי מורשה מטעם הספק |

**‏`kind` כבר מכיל `payout_settled`.** כלומר מי שתכנן את ה-ledger השאיר את
המקום. אין צורך לשנות את האילוץ.

### מה שנכתב פעם ומת

בעץ יש **חמש** מיגרציות payout: `051_payout_terms`, `079_payout_escrow_release`,
`081_payout_no_escrow`, `083_payout_status_pending_approval`,
`091_supplier_payout_enums`. **אף אחת מהן לא הוחלה.**

הקוד עצמו מתעד למה. ‏`src/lib/db/enum-declarations.ts`:

> "‏`payout_status` was declared with four values in 026 ... `generate_payout_statement`
> raised on its final UPDATE, which is one of the two reasons **the payout engine
> was dead code**"

‏`src/server/domain/reports/settlement-report.ts` הולך צעד נוסף ומסביר במפורש
למה הוא **לא** קורא מ-`payout_statements`.

**שני נכסים אמיתיים ב-051, ואותם כן לוקחים:**

```sql
CREATE OR REPLACE FUNCTION public.add_business_days(p_from timestamptz, p_days integer)
CREATE OR REPLACE FUNCTION public.payout_available_at(p_event_at timestamptz)

ALTER TABLE ... ADD COLUMN min_payout_ils numeric(12,2) NOT NULL DEFAULT 100,
                ADD COLUMN payout_hold_business_days integer NOT NULL DEFAULT 3;
```

זה בדיוק המינימום של 100 ש"ח והעיכוב של T+3 שהמנגנון צריך, וזה כבר נוסח פעם.

---

## 1. ההכרעה: לא להחיות את `payout_statements`

**בונים מחדש על `settlement_events`, ולא מריצים את 026/051/083.**

שלוש סיבות, לפי משקל:

1. **ה-ledger כבר קיים ומאוזן.** ‏`settlement_events` מקבל היום `charge_settled`,
   ‏`voucher_redeemed`, ‏`refund_issued` ו-`supplier_debit`. ‏payout שנבנה עליו
   הוא **סיכום של ledger אחד**. ‏`payout_statements` הישן היה מקור אמת מקביל,
   וזה החוב שממנו נבע ה-COALESCE ב-1.3 של `MASTER-ARCHITECTURE.md`.
2. **המנוע הישן מת מסיבה מתועדת**, לא מהזנחה. הרצת חמש מיגרציות כדי להחיות
   קוד שנרשם כ-dead code היא החלטה שצריכה ראיה, ואין.
3. **כל עמודות הכסף שם הן `numeric` שקלים.** ‏`settlement_events` הוא `bigint`
   אגורות. בנייה על השקלים מייצרת חוב חדש ב-D3 במקום לצמצם אותו.

**מה שכן לוקחים מ-051:** שתי הפונקציות ושני שדות התצורה. הן נכונות ובלתי
תלויות בטבלאות המתות.

---

## 2. מודל הנתונים

> כל הסכומים **אגורות `bigint`**. אפס `numeric`, אפס שקלים, בשום עמודה.

### 2.1 פרטי בנק

```sql
CREATE TABLE public.supplier_bank_accounts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id       uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  beneficiary_name  text NOT NULL,          -- חייב להתאים לשם בחשבון, לא לשם המותג
  bank_code         text NOT NULL,          -- קוד בנק, 2 ספרות
  branch_code       text NOT NULL,          -- סניף, 3 ספרות
  account_number    text NOT NULL,
  business_id       text,                   -- ח.פ. / ע.מ. לחשבונית
  verified_at       timestamptz,            -- אושר ידנית מול הספק
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX supplier_bank_accounts_one_active_per_supplier
  ON public.supplier_bank_accounts (supplier_id) WHERE is_active;
```

**‏RLS: הטבלה הזו נקראת על ידי אדמין בלבד.** לא הספק ולא הלקוח. פרטי חשבון
בנק הם ה-PII הרגיש ביותר בסכימה, והם לא צריכים להופיע בשום REST ציבורי.

**`verified_at` אינו קישוט.** העברה בנקאית לחשבון שגוי אינה הפיכה. ריצת payout
מדלגת על ספק ללא חשבון פעיל ומאומת, ומדווחת עליו בשם.

### 2.2 ריצת תשלום

```sql
CREATE TYPE public.payout_run_status AS ENUM
  ('draft', 'pending_approval', 'approved', 'paid', 'failed', 'cancelled');

CREATE TABLE public.supplier_payouts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id        uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  period_start       date NOT NULL,
  period_end         date NOT NULL,
  gross_agorot       bigint NOT NULL,   -- סכום חלקי הספק שהבשילו
  debit_agorot       bigint NOT NULL,   -- קיזוז החזרים. חיובי במשמעות "מנוכה"
  net_agorot         bigint NOT NULL,   -- gross - debit
  status             public.payout_run_status NOT NULL DEFAULT 'draft',
  rolled_over        boolean NOT NULL DEFAULT false,
  min_payout_agorot  bigint NOT NULL,   -- צילום הסף שחל בזמן הריצה
  bank_account_id    uuid REFERENCES public.supplier_bank_accounts(id),
  approved_by        uuid REFERENCES auth.users(id),
  approved_at        timestamptz,
  paid_at            timestamptz,
  payment_reference  text,              -- אסמכתת ההעברה
  failure_reason     text,
  idempotency_key    text UNIQUE NOT NULL,   -- 'payout:<supplier>:<period_end>'
  created_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT supplier_payouts_amounts_sane
    CHECK (gross_agorot >= 0 AND debit_agorot >= 0 AND net_agorot = gross_agorot - debit_agorot),
  CONSTRAINT supplier_payouts_period_ordered CHECK (period_end >= period_start)
);
```

**`net_agorot` יכול להיות שלילי, וזה מכוון.** ספק שקיבל החזרים יותר משמכר חייב
כסף. ה-CHECK מאפשר את זה במפורש, כי `net = gross - debit` וזו זהות ולא תקווה.
מה שאסור הוא לשלם סכום שלילי; ראה 5.3.

### 2.3 שורות

```sql
CREATE TABLE public.supplier_payout_lines (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id           uuid NOT NULL REFERENCES public.supplier_payouts(id) ON DELETE CASCADE,
  settlement_event_id uuid NOT NULL REFERENCES public.settlement_events(id) ON DELETE RESTRICT,
  order_item_id       uuid REFERENCES public.order_items(id) ON DELETE RESTRICT,
  amount_agorot       bigint NOT NULL,   -- חיובי לזכות, שלילי לחובה
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- אירוע ledger אחד לא ייכנס לשתי ריצות. זה כל מנגנון ה"שולם כבר".
CREATE UNIQUE INDEX supplier_payout_lines_event_once
  ON public.supplier_payout_lines (settlement_event_id);
```

**האינדקס הזה הוא הלב.** אין עמודת `paid` על `settlement_events` ואין דגל
שצריך לתחזק. אירוע שולם **אם ורק אם** יש לו שורה. תשלום כפול הופך מבאג
לוגי להפרת אילוץ.

---

## 3. מה נצבר, ומתי

שורה נכנסת ל-payout כשמתקיימים **כל** התנאים:

| # | תנאי | למה |
|---|---|---|
| 1 | `order_items.product_type = 'physical'` | לשובר אין payout. הספק גובה בעצמו בעסק |
| 2 | `settlement_status = 'split_executed'` | לפני זה חלק הספק לא הוכר |
| 3 | קיים `settlement_events.kind='charge_settled'` עם `supplier_due_agorot > 0` | ה-ledger, לא ה-order |
| 4 | `payout_available_at(occurred_at) <= now()` | עיכוב T+3, סעיף 4 |
| 5 | אין `supplier_payout_lines` לאותו אירוע | סעיף 2.3 |
| 6 | לספק חשבון בנק פעיל עם `verified_at` | סעיף 2.1 |

**תנאי 3 הוא ההבדל בין המנגנון הזה למנוע שמת.** הסכום נקרא מה-ledger ולא
מ-`order_items`, ולכן הוא סכום שכבר נרשם חשבונאית ולא ערך שמחושב מחדש בכל ריצה.

---

## 4. עיכוב T+3

```sql
-- מ-051, נשמר כלשונו
public.payout_available_at(p_event_at timestamptz)  -- add_business_days(p_event_at, hold)
```

`suppliers.payout_hold_business_days`, ברירת מחדל **3 ימי עסקים**.

**מה זה מגן מפניו, בפועל:** ‏chargeback והחזר. הזמנה שמבוטלת יומיים אחרי
האספקה תיצור `supplier_debit`, ואם הכסף כבר יצא לספק, הקיזוז תלוי בכך שיהיה
תשלום עתידי לקזז ממנו. **העיכוב הופך את מרבית ההחזרים לקיזוז לפני התשלום
במקום גבייה אחריו**, וזה ההבדל בין ניכוי לבין חוב.

**ימי עסקים ולא ימי לוח**, כי `add_business_days` כבר כתובה כך, ו-72 שעות
שמתחילות בחמישי בערב הן שני בבוקר.

**עיכוב ארוך יותר לספק חדש** הוא ההחלטה הנכונה לשלושת החודשים הראשונים
(‏`payout_hold_business_days = 14`, פר ספק). הכי הרבה הונאה קורית בעסקה הראשונה.

---

## 5. סף מינימום, גלגול, וקיזוז

### 5.1 סף

`suppliers.min_payout_ils`, ברירת מחדל **100 ש"ח**, מצולם לריצה כ-`min_payout_agorot`.

**הצילום חיוני:** ספק ששאל למה קיבל 100 ולא 150 צריך תשובה מהריצה עצמה, לא
מהערך הנוכחי בטבלת הספקים שהשתנה מאז.

### 5.2 גלגול

`net_agorot < min_payout_agorot` ⇒ הריצה נסגרת `rolled_over = true`,
‏**`status = 'cancelled'`, ולא נכתבות שורות.** האירועים נשארים לא-משויכים
ונקלטים בריצה הבאה.

**זו הנקודה שבה המנוע הישן שיקר.** ‏`admin/payouts.ts` בקוד היום כבר מגן מפני
זה, ותיעד למה: הוא קורא את הריצה בחזרה במקום לדווח "נוצר", כי "‏telling the
admin a statement was produced when the balance was below the minimum would be
a lie by omission". שמור על ההתנהגות הזו.

### 5.3 קיזוז `supplier_debit`

```sql
-- החיובים שטרם קוזזו, לאותו ספק
SELECT e.id, e.supplier_due_agorot
FROM public.settlement_events e
LEFT JOIN public.supplier_payout_lines l ON l.settlement_event_id = e.id
WHERE e.kind = 'supplier_debit' AND e.supplier_id = $1 AND l.id IS NULL;
```

חיוב נכנס לריצה **כשורה שלילית**, ולכן הוא נצרך בדיוק פעם אחת, על ידי אותו
אינדקס ייחודי. אין דגל `settled` לתחזק.

**`net_agorot <= 0`:** אין העברה. הריצה נסגרת `cancelled`, **והשורות השליליות
לא נכתבות** כדי שהחוב יישאר פתוח לריצה הבאה. אחרת חוב שלא נגבה היה נמחק בשקט.

**חוב שמזדקן מעל [60] יום בלי תשלום שיקזז אותו** עולה למסך האדמין כפריט
לגבייה. זה סעיף 4.3(ב) ב-`SUPPLIER-AGREEMENT-DRAFT.md`, והוא הסיבה שהסעיף
נשאר בהסכם גם אחרי שהמנגנון נבנה.

---

## 6. הריצה השבועית

```
/api/cron/payouts   ·   ראשון 03:00 Asia/Jerusalem   ·   CRON_SECRET
```

לכל ספק פעיל, בטרנזקציה אחת פר ספק:

```
1. אירועים זכאים (סעיף 3)                    -> gross
2. חיובים שלא קוזזו (5.3)                     -> debit
3. net = gross - debit
4. net < min  או  net <= 0   -> cancelled + rolled_over, אפס שורות. סוף.
5. INSERT supplier_payouts (status='pending_approval', idempotency_key)
6. INSERT supplier_payout_lines לכל אירוע, זכות וחובה
7. commit
```

**‏`idempotency_key = 'payout:<supplier_id>:<period_end>'`.** ה-cron שרץ פעמיים
נכשל על ה-UNIQUE השני ולא מייצר תשלום שני. זו אותה תבנית שכבר מגנה על
`settlement_events` ועל `payments`.

**טרנזקציה פר ספק ולא לכולם יחד:** ספק אחד עם נתון פגום לא צריך להפיל את
התשלום של השאר.

**‏`pending_approval` ולא `approved`.** ראה סעיף 7.

---

## 7. אישור ידני, ובכוונה

**בשלב הראשון אף שקל לא יוצא בלי לחיצה שלך.**

```
/admin/payouts
```

| מצב | מי | מה |
|---|---|---|
| `pending_approval` | ה-cron | מחכה לך |
| `approved` | אדמין | אושר, טרם שולם |
| `paid` | אדמין / API | שולם, עם אסמכתה |
| `failed` | אדמין / API | נכשל, עם סיבה |
| `cancelled` | ה-cron | מתחת לסף או `net <= 0` |

המסך מציג לכל ריצה: שם הספק, החשבון (ארבע ספרות אחרונות בלבד), `gross`,
`debit`, `net`, ופירוט השורות עד רמת ההזמנה.

**ארבעה שערים לפני `approved`:**

1. חשבון בנק פעיל **ומאומת**.
2. `net_agorot > 0` ו-`>= min_payout_agorot`.
3. אין תלונה או dispute פתוחים על ספק זה.
4. כל שורה עדיין `split_executed` ולא `refunded` מאז יצירת הריצה.

**שער 4 הוא היחיד שקל לשכוח והוא היקר ביותר.** בין ריצת הלילה לאישור בבוקר
יכול להיכנס החזר. אישור שאינו בודק זאת משלם על שורה שכבר הוחזרה ללקוח, כלומר
משלם פעמיים.

**כל מעבר מצב נכתב ל-`audit_log`** עם המשתמש, ואישור אינו הפיך.

**מתי לעבור לאוטומטי:** אחרי שלושה חודשים רצופים בלי חריגה ידנית, ורק לספקים
שהשלימו [10] ריצות תקינות. עד אז, הלחיצה שלך היא ההגנה.

---

## 8. ההעברה עצמה

### שלב 1 (עכשיו): ידנית

`approved` ⇒ אתה מעביר בבנק ⇒ מזין `payment_reference` ⇒ `paid`.

**המערכת לא מעבירה כסף בשלב הזה, והיא לא מתיימרת.** היא מייצרת רשימה מדויקת,
מקוזזת ומאושרת. בהיקף של עשרות ספקים זה נכון, וזה מסיר את מלוא הסיכון של
העברה אוטומטית שגויה.

**ייצוא מסה"ב** למסך: CSV להעברות המוניות, בפורמט של הבנק. זה מקצר את הפעולה
הידנית מדקות לספק לדקה לכולם, בלי לתת למערכת גישה לכסף.

### שלב 2 (אחר כך): Cardcom Financial

`docs/CARDCOM-ARCHITECTURE.md` סעיף 1.5 מתאר `CompanyOperations + Financial`
כמודל "מאגד".

**שלוש אזהרות מדודות לפני שנשענים עליו:**

1. **המסמך ההוא מתאר v11 JSON, והלקוח החי הוא legacy `/Interface/*.aspx`.**
   ‏`src/lib/payments/cardcom.ts` נושא את ה-`TODO` היחיד ב-`src` בדיוק על
   הפער הזה. אין להעתיק שמות endpoint מהמסמך.
2. **הפרדת סמכויות.** ‏`CARDCOM_API_PASSWORD` נדרש לפעולות שמוציאות כסף.
   המפתח שמעביר לספקים לא צריך להיות אותו מפתח שמשמש את מסלול הקנייה.
3. **מעבר לאוטומטי אינו מבטל את סעיף 7.** האישור נשאר; רק הביצוע משתנה.

---

## 9. אינווריאנטות

| # | טענה | איך נאכפת |
|---|---|---|
| I1 | אירוע ledger לא ישולם פעמיים | `supplier_payout_lines_event_once` |
| I2 | `net = gross - debit` | CHECK על הטבלה |
| I3 | ריצה לא נוצרת פעמיים לאותה תקופה | `idempotency_key` UNIQUE |
| I4 | לא משלמים מתחת לסף | סעיף 5.2, `cancelled` |
| I5 | לא משלמים בלי חשבון מאומת | תנאי 6 בסעיף 3, שער 1 בסעיף 7 |
| I6 | לשובר אין payout | תנאי 1 בסעיף 3 |
| I7 | כל סכום באגורות integer | `bigint` בכל עמודה |

**‏I7 הוא היחיד שקל להפר בטעות**, כי הטבלאות הישנות `numeric` והפיתוי להתאים
אליהן גדול. אל תתאים. ה-`settlement_events` כבר `bigint`.

---

## 10. סדר בנייה

```
1. supplier_bank_accounts + RLS אדמין-בלבד   ← אפשר היום, פותח את B2
2. payout_available_at + add_business_days   ← העתקה מ-051, בלי שאר הקובץ
3. supplier_payouts + supplier_payout_lines + enum
4. חישוב טהור וטסטים            ← סף, גלגול, קיזוז, net שלילי, ללא DB
5. /api/cron/payouts
6. /admin/payouts               ← החלפת המסך השבור
7. ייצוא CSV לבנק
8. Cardcom Financial            ← רק אחרי 3 חודשים יציבים
```

**‏1 ו-2 בלי תלות ואפשר להתחיל בהם מיד.** ‏4 לפני 5 בכוונה: את הסף, הגלגול
והקיזוז אפשר לבדוק לגמרי בלי מסד נתונים, וזה הקוד שטעות בו עולה כסף אמיתי.

**מיגרציות דרך MCP בלבד**, אחת-אחת, עם `SELECT` אימות אחרי כל אחת.
‏**‏026, ‏051, ‏079, ‏081, ‏083 ו-091 לא מורצות.** מה שנחוץ מהן מועתק פנימה.

---

## 11. מה אסור שיקרה

1. **לא לשלם על שובר.** הספק כבר גבה בעסק. תשלום כזה הוא תשלום כפול.
2. **לא לקרוא סכומים מ-`order_items` בזמן התשלום.** ה-ledger הוא המקור.
3. **לא למחוק `supplier_debit` שלא קוזז** כשריצה נסגרת שלילית.
4. **לא לאשר בלי לבדוק מחדש שהשורות עדיין לא הוחזרו.** סעיף 7 שער 4.
5. **לא להריץ את המנוע הישן "רק כדי לראות".** הוא נרשם dead code בקוד עצמו.
6. **לא לשמור פרטי בנק בטבלה שנקראת דרך REST ציבורי.**

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-07 | תכנון ראשון. סוגר את G1. נמדד מול הפרודקשן; חמש מיגרציות payout קיימות בעץ ואף אחת לא הוחלה |
| 2026-08-10 | הפניה ל-`ARCHITECTURE-PAYOUT-MECHANISM.md` כמסמך BINDING |
