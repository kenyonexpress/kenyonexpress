# GAPS-CODE-VS-DOCS.md

פערים בין הארכיטקטורה המתועדת לקוד בפועל, בתחומי **payments, coupons, refund**.

Status: **AUDIT** · 2026-08-07 · worktree `ke-arch`, branch `arch/docs-lifecycle`
Scope: **docs only.** הקריאה בקוד ובפרודקשן הייתה קריאה בלבד; לא נכתבה שורה
לתיקייה הראשית ולא הורצה מיגרציה.

**איך נמדד:** הקוד נקרא ב-`main`, והסכימה נשאלה ישירות מהפרודקשן דרך MCP
(`information_schema`, `pg_constraint`, `to_regclass`). כשמסמך ומיגרציה חלוקים,
**הפרודקשן קובע** - קובצי `supabase/migrations/` אינם מתארים את מה שהוחל.

מדרג החומרה:

| דרגה | משמעות |
|---|---|
| **1** | שבור עכשיו בפרודקשן, או ישבור בפעם הראשונה שמישהו ילחץ |
| **2** | המסמך מפנה לטבלה או למסלול שאינם קיימים |
| **3** | הפרה של כלל מחייב, בלי פגם ערכי מדוד |
| **4** | שריד או שם שמטעה קורא, בלי נזק ריצה |

---

## דרגה 1

### G1. מסך ה-payouts קורא לטבלה ולפונקציה שאינן קיימות בפרודקשן

```
to_regclass('public.payout_statements')      -> null
to_regproc('public.generate_payout_statement') -> null
```

שבעה מקומות בקוד מניחים ששניהם קיימים:

```
src/server/actions/admin/payouts.ts
src/app/(admin)/admin/payouts/page.tsx
src/app/(admin)/admin/reports/page.tsx
src/server/domain/reports/settlement-report.ts
src/lib/admin/payouts.ts
src/components/admin/AdminSidebar.tsx
src/lib/db/enum-declarations.ts
```

`admin/payouts.ts` קורא `supabase.rpc('generate_payout_statement', ...)` ואז
קורא את התוצאה מ-`payout_statements`. שתי הקריאות ייכשלו בפרודקשן.

**למה זו הדרגה הגבוהה ביותר, ולא סתם מסך שבור:** מנגנון ה-`supplier_debit`
שנוסף ב-[48] כותב חיוב לספק על כל שורה שהוחזרה אחרי שהחלק שלו כבר שוחרר,
והמנגנון הזה בנוי על ההנחה שהחיוב **יתקזז מה-payout הבא**. אין payout. החיובים
נצברים ב-`settlement_events` בלי שום דבר שצורך אותם, וכל עוד זה המצב **הפלטפורמה
סופגת את חלק הספק בכל החזר של שורה פיזית שכבר פוצלה**, בזמן שהספרים מראים שהחוב
נרשם.

המסמכים שמניחים שהפונקציה חיה: `MASTER-ARCHITECTURE.md` סעיף 1.3
("‏`generate_payout_statement` קוראת COALESCE"), ו-`ARCHITECTURE-MASTER-CHECKOUT-REDEMPTION.md`
‏D6, שכבר סומן שם כ"חלקי" בסבב 06.08.

**‏07.08: יש עכשיו תכנון סוגר** - `PAYOUT-ARCHITECTURE.md`.  
**‏10.08: מסמך מחייב** - `ARCHITECTURE-PAYOUT-MECHANISM.md` (באצ' + העברה ידנית).  
הפער **עדיין פתוח בפרודקשן** ולכן נשאר בדרגה 1; מה שהשתנה הוא שיש דרך מוגדרת לסגור אותו.
שני דברים נוספים שהתגלו בזמן התכנון:

**(א) ל-`suppliers` אין ולו עמודה בנקאית אחת.** ‏18 עמודות, ואף אחת מהן אינה
בנק, סניף, חשבון או שם מוטב. ‏`LAUNCH-CHECKLIST.md` ‏B2 מבקש לאסוף פרטי בנק
מספקים, וכרגע **אין לאן לשים אותם**.

**(ב) המנוע לא חסר, הוא מת.** בעץ יש **חמש** מיגרציות payout (‏051, ‏079,
‏081, ‏083, ‏091) ואף אחת לא הוחלה. ‏`src/lib/db/enum-declarations.ts` מתעד
ש-`generate_payout_statement` נפלה ב-UPDATE האחרון שלה ושזו אחת משתי הסיבות
ש**"the payout engine was dead code"**. לכן התכנון בונה על `settlement_events`
(שכבר מכיל `payout_settled` ו-`supplier_debit` באילוץ) ולא מחייה את הישן.

---

## דרגה 2

### G2. `coupon_redemptions` אינה קיימת, ומעולם לא הייתה בקוד

```
to_regclass('public.coupon_redemptions') -> null
grep -rl coupon_redemptions src/          -> אין תוצאות
```

הטבלה האמיתית היא **`voucher_redemptions`**, והעמודה היא
**`amount_collected_agorot`** (אגורות integer), לא `amount_collected` בשקלים.

המסמכים שמפנים לטבלה שאינה קיימת:

| מסמך | מה כתוב |
|---|---|
| `ARCHITECTURE-ANALYTICS-BI.md` | "‏In-store collection is recorded in `coupon_redemptions.amount_collected`" |
| `ARCHITECTURE-COMMERCE.md` | סעיף 2.5 מפנה ל-`coupon_redemptions` |
| `ARCHITECTURE-MASTER-CHECKOUT-REDEMPTION.md` | ‏R6 ו-D5 רושמים ש-048 (`coupon_redemptions`, `coupon_scan_events`) **בוצע** |

**גילוי נאות:** השורה ב-`ARCHITECTURE-ANALYTICS-BI.md` עברה דרך הידיים שלי
ב-QA של 06.08. תיקנתי שם את מודל ה-10/90 והשארתי את שם הטבלה עומד בלי לבדוק
אותו מול הסכימה. תיקון של חצי משפט אינו אימות של המשפט.

**‏07.08: תוקן בשלושת המסמכים** (`3666c85`, `66eec29`, `0e7de02`). בדרך התגלו
שני הפרשים שהם התנהגות ולא שם, ושניהם לטובת הפרודקשן:

**(א) הטבלה החיה מתעדת גם סריקות שנכשלו.** יש בה `outcome` מסוג
`voucher_scan_outcome`, ונכתבת שורה גם לקוד שכבר מומש, לקוד שפג, ולסורק בלי
הרשאה. לכן ההגדרה "שורה אחת לכל סריקה מוצלחת" שהופיעה בשני מסמכים **אינה
נכונה**, וכל שאילתה כספית או טריגר חייבים `WHERE outcome = 'success'`. בלי זה
הטריגר יורה על סריקה שנדחתה, והמשפך סופר ניסיונות כמימושים.

**(ב) מחסום ה-replay חזק ממה שהמסמכים תכננו:**

```sql
CREATE UNIQUE INDEX voucher_redemptions_one_success_per_voucher
  ON public.voucher_redemptions (voucher_id)
  WHERE outcome = 'success' AND voucher_id IS NOT NULL;
```

אינדקס **חלקי**. ה-`UNIQUE (coupon_code_id)` הלא-מותנה שתוכנן בשני המסמכים היה
דוחה את הסריקה הכושלת השנייה, כלומר מוחק בדיוק את השורה שסקירת הונאה צריכה.
זו גם הסיבה שאין `coupon_scan_events` נפרדת: תפקיד ה-audit נבלע באותה טבלה.

**מה שכן עובד:** מסלול המימוש עצמו חי ותקין. `supplier_members` קיימת בפרודקשן,
‏`/api/supplier/vouchers/redeem` קיים, וארבעת המסלולים של
`ARCHITECTURE-COUPON-REDEMPTION-UX.md` סעיף 1 קיימים כולם על הדיסק. הפער הוא
בשמות שהמסמכים נותנים לאחסון, לא במסלול.

### ~~G3. מיגרציה 108 לא הוחלה~~ — **בוטל 07.08. הממצא היה שלי, והוא היה שגוי.**

מה שנכתב כאן ב-07.08 בבוקר:

```
supabase/migrations/108_gift_vouchers.sql   קיים בעץ
to_regclass('public.gift_vouchers')         -> null   ⇒ "המיגרציה לא הוחלה"
```

**המסקנה לא נובעת מהמדידה.** ‏`108_gift_vouchers.sql` **אינו יוצר טבלה בשם
`gift_vouchers`.** הוא מוסיף שבע עמודות ל-`vouchers` ושלוש ל-`order_items`:

```sql
ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS gift_recipient_name  text,
  ADD COLUMN IF NOT EXISTS gift_recipient_email text,
  ADD COLUMN IF NOT EXISTS gift_message         text,
  ADD COLUMN IF NOT EXISTS gift_claim_token_hash text,
  ADD COLUMN IF NOT EXISTS gift_sent_at         timestamptz,
  ADD COLUMN IF NOT EXISTS gift_claimed_at      timestamptz,
  ADD COLUMN IF NOT EXISTS gifted_by_user_id    uuid ...;
```

**כל שבע העמודות קיימות בפרודקשן.** המיגרציה **כן הוחלה**, ו-`gift_vouchers`
לא היה אמור להתקיים מעולם.

**מה שכשל כאן הוא שיטת המדידה, לא הכלי.** ניחשתי את שם האובייקט משם הקובץ
במקום לקרוא מה הקובץ יוצר, ואז התייחסתי ל-`null` כראיה. ‏`to_regclass` החזיר
בדיוק את האמת: אין טבלה כזו. המסקנה "לכן לא הוחלה" הייתה שלי.

**הכלל שנגזר מזה, והוא חל על כל שאר הקובץ:** ‏**קרא את המיגרציה לפני שאתה
בודק אם היא רצה.** ‏106 ו-107 אומתו נכון, אבל דרך האובייקט שהן באמת יוצרות
(`settlement_events_kind_known` מכיל `supplier_debit`; ‏`invoices` קיימת), ולא
דרך שם הקובץ.

---

## דרגה 3

### G4. דמי הביטול מחושבים ב-float, וזה הכלל היחיד שהפרויקט מגדיר כאדום

```
src/server/domain/orders/refund.ts:8
const CANCELLATION_FEE_RATE = 0.05
const fivePercent = Math.round(chargedAgorot * CANCELLATION_FEE_RATE)
```

הכלל המחייב הוא שכל חישוב כסף עובר דרך `src/lib/money.ts` ואין float במסלול
הכסף. הכלי לזה קיים ובשימוש בכל שאר מסלול הכסף:

```
percentageOf(value, basisPoints)   // אריתמטיקה שלמה בלבד
```

‏`settlement.ts` קורא לו ארבע פעמים, `product-money.ts` פעם אחת. חישוב דמי
הביטול הוא המקום היחיד במסלול שמכפיל בשבר.

**מה שנמדד, ולא הונח:** הרצתי את שתי הנוסחאות זו מול זו על **כל** ערך שלם
מ-1 עד 2,000,000 אגורות (עד 20,000 ש"ח):

```
divergences: none
```

כלומר **אין כאן מספר שגוי היום**, וגם לא סביר שיהיה: תקרת ה-100 ש"ח חוסמת כל
חיוב מעל 2,000 ש"ח ממילא. זו הפרת כלל, לא באג. היא נרשמת בדרגה 3 ולא גבוה יותר
בדיוק בגלל זה, והתיקון הוא שורה אחת: `percentageOf(agorot(chargedAgorot), 500)`.

### G5. הארנק ממיר לשקלים float, כי חתימת ה-RPC דורשת זאת

```
src/server/payments/finalize.ts:324   walletApplied = (... ?? 0) / 100
src/server/payments/finalize.ts:343   walletApplied = Number(...) / 100
```

‏`spendWallet` מדבר שקלים כי `fn_wallet_transfer` מקבל `p_amount_ils`. ההערות
בקוד מתעדות את זה במפורש ואף מציינות שקריאה שגויה כאן כבר זיכתה פעם מאית ממה
שהלקוח באמת הוציא. **ה-float יושב בחתימת הפונקציה ב-DB, לא בבחירה של הקוד**,
ולכן הוא נסגר רק עם `PENDING-money-integer-fix.sql` (‏D3), שאסור להריץ בלי
אישור. נרשם כאן כדי שלא ייקרא כרשלנות בסקירה הבאה.

---

## דרגה 4

### G6. רצפת כיסוי על קובץ שנמחק

```
vitest.config.ts:52
'src/server/domain/orders/escrow.ts': MONEY_MODULE_FLOOR
```

‏`escrow.ts` ו-`escrow.test.ts` אינם קיימים ב-`src`. רצפת כיסוי של 95% על קובץ
שאינו קיים אינה מודדת דבר, **ונראית בדיוק כמו רצפה שעוברת**. זה מנגנון הבטחת
איכות שמדווח הצלחה על היעדר.

### G7. `signature_valid` היא עמודה על שם מנגנון שלא קיים

```
src/app/api/payments/cardcom/webhook/route.ts:43   "no HMAC or signature header to verify"
src/app/api/payments/cardcom/webhook/route.ts:78   signature_valid: secretOk
```

הקוד **נכון**, וההערה שלו מדויקת: ל-Cardcom אין חתימת webhook, והאותנטיות היא
‏`?s=<secret>` פלוס אימות חוזר ב-`GetLpResult`. הפער הוא בשם: העמודה
‏`payment_webhook_events.signature_valid` אומרת היום "הסוד ב-query string
התאים". מי שיבדוק בסקירת אבטחה "האם החתימה נבדקת" יקבל עמודה בוליאנית שנראית
כמו תשובה חיובית לשאלה שלא נשאלה. שם כמו `secret_matched` היה אומר את האמת.

### G8. מסמך Cardcom מתאר v11, הלקוח הוא legacy

```
docs/CARDCOM-ARCHITECTURE.md   /Documents/CreateDocument, /Transactions/RefundByTransactionId
src/lib/payments/cardcom.ts    /Interface/LowProfile.aspx, /Interface/ChargeToken.aspx,
                               /Interface/GetLpResult.aspx, /Interface/RefundDeal.aspx
```

הכרעה מ-23.07: הקוד נשאר legacy. המסמך לא עודכן. הקוד עצמו כבר נושא את
האזהרה - `cardcom.ts:149` מחזיק `TODO(cardcom)` שאומר שיש לאמת את שם ה-endpoint
ואת שמות השדות של הזיכוי מול טרמינל חי לפני go-live, וההערה על
`createDocument` רושמת ש-`InvoiceHead`/`InvoiceLines` לא מופיעים באף מקום
ב-`docs/`, ב-`refs/` או ב-`src/`. **זה ה-TODO היחיד בכל `src`.** הפער אינו
שהקוד לא יודע; הוא שהמסמך עדיין מתאר API אחר.

---

## מה שנבדק ונמצא **תואם**

רשימה זו קיימת כדי שהקובץ לא ייקרא כתמונת מצב גרועה משהיא.

| נושא | ממצא |
|---|---|
| `supplier_debit` | **נסגר.** ב-06.08 מדדתי שאילוץ `settlement_events_kind_known` דוחה את הערך. מיגרציה 106 הוחלה מאז, והאילוץ בפרודקשן כולל אותו היום. הקוד והסכימה מסכימים |
| אין ברירת מחדל ל-`platform_percent` | `issue.ts:141` זורק במפורש `'platform_percent must be a number between 0 and 100; no default exists'`. תואם C1/C2 |
| דמי ביטול 5% או 100 ש"ח | `CANCELLATION_FEE_CAP_AGOROT = 10_000` + `Math.min`. תואם `ARCHITECTURE-LEGAL-COMPLIANCE.md` (QA-PASS #3) |
| קופון שמומש | `refund.ts` מחזיר `code: 'MANUAL_RESOLUTION'` עם הודעה בעברית, ולא מנסה לזכות כרטיס. תואם |
| `CancelOnly` באותו יום | קיים, מוכרע ב-`isSameClearingDay` על `Asia/Jerusalem`, ומועבר ל-provider. ה-mock מהדהד אותו ב-`raw` כדי שטסט יוכל לתפוס היפוך |
| אין המצאת HMAC | הקוד לא ממציא חתימה. תואם את התיקון שנעשה ב-`ARCHITECTURE-TESTING-CICD.md` ב-06.08 |
| `escrow_holds` קיימת | מותר: C3 אוסר נאמן חיצוני ו-J5, ומתיר רשומת ledger פנימית |
| שני מסלולי redeem | `/api/supplier/redeem` הוא alias בן 13 שורות שמייצא מחדש את ה-POST, עם הערה שמסבירה למה `runtime` לא ניתן לייצוא מחדש. לא כפילות |
| כיסוי טסטים ל-refund | 25 מקרים ב-`domain/orders/refund.test.ts`, 18 ב-`actions/payments/refund.test.ts` |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-07 | ביקורת ראשונה: payments / coupons / refund. שמונה פערים, שלושה מהם חוסמים |
| 2026-08-07 | G2 נסגר בשלושת המסמכים; ‏G8 מתועד בגוף `CARDCOM-ARCHITECTURE.md` |
| 2026-08-07 | **G3 בוטל: ממצא שגוי שלי.** ‏108 מוסיפה עמודות ל-`vouchers`, לא יוצרת טבלה, והיא הוחלה |
