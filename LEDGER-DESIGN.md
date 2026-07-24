# LEDGER-DESIGN: ארכיטקטורת ספר חשבונות כפול ושלמות כספית

מסמך תכנון עבור branch בשם `arch/money-ledger`. קובע את מודל ה-ledger הכפול (double-entry),
כללי הרישום (posting rules) לכל אירוע כספי, טיפול במע"מ 17%, מעבר ליחידות שלמות (אגורות
ונקודות בסיס), והקשחות שלמות: idempotency, מימוש קופון חד-פעמי, settlement לפי ספק
ו-reconciliation. כל הפרוזה בעברית; כל המזהים, ה-SQL והקוד באנגלית.

הצהרת ציות להחלטות הנעולות (commit 4d929db, "product page locked decisions"):

- `platform_percent` הוא פר-מוצר ומצולם לתוך `order_items` בזמן הרכישה. ה-ledger קורא
  את האחוז אך ורק מצילומי `order_items`, לעולם לא מ-`products` בזמן settlement.
- אין escrow. הטבלאות `escrow_holds` ו-`split_executions` ממיגרציה 047 מטופלות כ-legacy
  in runoff (סעיף 11). כללי הרישום כאן בנויים למודל ללא escrow בלבד.
- התראות ספק פנימיות בלבד (מחוץ לתחום מסמך זה; לא משפיע על הכספים).

## 0. מיפוי מספרי מיגרציות

המפרט המקורי קרא לקבצים 033 עד 039, אבל בעץ הזה 033 עד 035 כבר תפוסים
(`033_analytics.sql`, `034_analytics_bi.sql`, `035_security_hardening.sql`) והמספר האחרון
בשימוש הוא 051. לכן הקבצים ממוספרים 054 עד 060 (אחרי מיזוג 2026-07-24), והמיפוי מתועד גם בכותרת של כל קובץ:

| מספר במפרט | קובץ בפועל | תוכן |
|---|---|---|
| 033 | `supabase/migrations/056_ledger_core.sql` | טבלאות ledger, אילוצים, אינדקסים, sum-zero, immutability |
| 034 | `supabase/migrations/057_money_integer_units.sql` | כסף numeric לאגורות integer, אחוזים לנקודות בסיס |
| 035 | `supabase/migrations/058_idempotency_keys.sql` | טבלת idempotency_keys |
| 036 | `supabase/migrations/059_coupon_single_use.sql` | הקשחת מימוש קופון חד-פעמי |
| 037 | `supabase/migrations/060_settlement_batches.sql` | settlement_batches + settlement_items פר ספק |
| 038 | `supabase/migrations/061_reconciliation.sql` | reconciliation_runs + reconciliation_discrepancies |
| 039 | `supabase/migrations/062_money_rls.sql` | RLS לכל הטבלאות החדשות |

כל מיגרציה אידמפוטנטית לפי כללי הסקיל `supabase-migrations`, עם הערת rollback בראש הקובץ.
המיגרציות הן קבצים בלבד: שום דבר לא הוחל על מסד נתונים.

## 1. יחידות: אגורות ונקודות בסיס

- כל סכום פנימי הוא `integer` באגורות. מטבע יחיד: ILS. אין `numeric` כספי חדש.
- בטבלאות ה-ledger עצמן הסכומים הם `bigint` (צבירה ארוכת טווח על חשבון אחד עלולה לחצות
  את תקרת int4; שורה בודדת תמיד קטנה, אבל טור הסכום אחיד).
- כל אחוז הוא `integer` בנקודות בסיס (basis points): 10% = 1000 bp, 100% = 10000 bp.
  ההמרה מאחוז עשרוני היא הכפלה ב-100 בדיוק כמו כסף, ולכן מיגרציה 057 משתמשת באותו helper.
- עיגול: `round()` של Postgres (half up על numeric חיובי) בכל הכפלה של סכום באחוז:
  `round(amount_agorot * bp / 10000.0)::integer`.

אסטרטגיית ההמרה במיגרציה 055 (add / backfill / verify / rename):

1. הוספת עמודה חדשה `*_agorot` או `*_bp` מסוג integer עם `ADD COLUMN IF NOT EXISTS`.
2. backfill: `new = round(old * 100)::integer` רק על שורות שבהן העמודה החדשה NULL.
3. אימות בבלוק DO שמרים `RAISE EXCEPTION` אם קיימת שורה עם סטייה בין הערך החדש לישן.
4. שינוי שם העמודה הישנה ל-`*_legacy` והסרת NOT NULL ממנה, כדי שכתיבות חדשות לא ייחסמו.

העמודות הישנות נשארות בשם `*_legacy` עד מיגרציית ניקוי עתידית (שגם תוסיף NOT NULL
ו-CHECK לעמודות החדשות אחרי cutover של הקוד). עמודות אגורות שכבר נוצרו במיגרציה 042
(`orders.subtotal_agorot`, `order_items.unit_price_agorot` ועוד) אינן מאומתות מחדש מול
העמודה הישנה, כי ה-backfill שלהן ב-042 השתמש בנוסחאות עשירות יותר; עבורן ה-helper רק
משלים NULL ומבצע rename. שתי העמודות המחושבות (GENERATED) ב-`coupon_deals`,
`platform_price` ו-`discount_percentage`, נמחקות ולא נוצרות מחדש: לפי המודל המחייב
(2026-07-24) מחיר הקופון הוא סכום מוחלט שהאדמין קובע, עמודת `coupon_price_agorot`
רגילה (לא GENERATED, לא אחוז), עם backfill חד-פעמי מהערך הישן.

## 2. תרשים חשבונות (chart of accounts)

טבלת `ledger_accounts`. סוגי חשבון (enum `ledger_account_kind`):

| kind | סוג חשבונאי | יתרה נורמלית | בעלות | משמעות |
|---|---|---|---|---|
| `cardcom_clearing` | נכס | debit | גלובלי (יחיד) | כסף שנסלק בכרטיס דרך Cardcom וטרם הותאם או שולם הלאה |
| `platform_revenue` | הכנסה | credit | גלובלי (יחיד) | עמלת הפלטפורמה נטו ממע"מ; משמש גם כ-contra לקאשבק ולזיכויים |
| `vat_output` | התחייבות | credit | גלובלי (יחיד) | מע"מ עסקאות 17% על עמלת הפלטפורמה, לתשלום לרשות המסים |
| `supplier_payable` | התחייבות | credit | פר ספק (`supplier_id`) | חוב הפלטפורמה לספק על פריטים פיזיים שנגבו באתר במלואם |
| `customer_wallet` | התחייבות | credit | פר משתמש (`user_id`) | קרדיט ארנק: התחייבות הפלטפורמה ללקוח; לעולם לא נמשך החוצה |

- חשבון גלובלי: שורה אחת בדיוק, נאכף באינדקס unique חלקי על `kind` כאשר אין בעלים.
- חשבון ספק: unique על `(kind, supplier_id)`. חשבון לקוח: unique על `(kind, user_id)`.
- CHECK מבטיח שבעלות תואמת kind (לחשבון ספק חייב `supplier_id` ואסור `user_id`, וכן הלאה).
- שלושת החשבונות הגלובליים נזרעים במיגרציה 056. חשבונות ספק ולקוח נוצרים בעצלנות דרך
  `fn_ensure_ledger_account` (service only).

## 3. מודל היומן: journals ו-lines

- `ledger_journals`: כותרת תנועה. `event_type` (enum `ledger_event`), `event_key` ייחודי
  (idempotency: רישום כפול של אותו אירוע הוא no-op ברמת ה-DB), הפניות הקשר אופציונליות
  (`order_id`, `order_item_id`, `payment_id`, `coupon_code_id`), `vat_rate_bp` (ברירת מחדל
  1700), `reverses_journal_id` לתנועות היפוך.
- `ledger_journal_lines`: שורות התנועה. `amount_agorot` הוא bigint חתום:
  חיובי = debit, שלילי = credit, ואסור אפס. `line_no` ייחודי בתוך journal.

### 3.1 אכיפת sum-zero בכל journal

הדרישה: סכום כל השורות של journal שווה אפס. אי אפשר לממש זאת כ-CHECK constraint כי
CHECK ב-Postgres מוערך על שורה בודדת ואינו יכול לבצע אגרגציה על פני שורות אחרות (לא
באותה טבלה ולא בטבלה אחרת); subquery בתוך CHECK אסור. לכן האכיפה היא CONSTRAINT TRIGGER
בשם `trg_ledger_lines_balanced` על `ledger_journal_lines`, מוגדר
`DEFERRABLE INITIALLY DEFERRED`: הבדיקה רצה בסוף הטרנזקציה, אחרי שכל שורות ה-journal
הוכנסו, ולכן הכנסה מרובת שורות בטרנזקציה אחת עוברת, בעוד טרנזקציה שמשאירה journal לא
מאוזן נכשלת כולה. זו הדרך הקנונית ב-Postgres לאילוץ אגרגטיבי טרנזקציוני.

### 3.2 אי-שינוי (immutability) ותיקונים בהיפוך בלבד

- טריגרים `BEFORE UPDATE OR DELETE` על `ledger_journals` ועל `ledger_journal_lines`
  (וטריגר `BEFORE TRUNCATE`) מרימים חריגה תמיד. הטריגרים חלים גם על service_role, ולכן
  זו שכבת האכיפה האמיתית: RLS לבדו לא מגן מפני service_role שעוקף RLS.
- RLS (מיגרציה 062) מוסיף שכבה שנייה: אין שום policy של INSERT/UPDATE/DELETE לאף רול
  לקוח, כך שדפדפן לא כותב ל-ledger בכלל.
- תיקון נעשה אך ורק בתנועת היפוך: journal חדש עם `event_type = 'reversal'`,
  `reverses_journal_id` מצביע על המקור (unique: היפוך אחד לכל journal), ושורות בסכומים
  הפוכים. ביטול של היפוך הוא היפוך של ההיפוך.

## 4. מע"מ ישראלי 17%

- הפלטפורמה מוציאה חשבונית מס רק על העמלה שלה. סכומים שהספק גובה (יתרת קופון בבית
  העסק, וחלק הספק במוצר פיזי) אינם הכנסת פלטפורמה ואינם חייבים במע"מ פלטפורמה; חובת
  המע"מ עליהם היא של הספק.
- העמלה נגבית ברוטו (כוללת מע"מ). החילוץ בשורת הרישום:
  `net = round(gross * 10000 / 11700)` ; `vat = gross - net`.
  דוגמה: עמלה ברוטו 1000 אגורות: net = 855, vat = 145.
- שיעור המע"מ נשמר ב-`ledger_journals.vat_rate_bp` (1700) כדי ששינוי חקיקה עתידי לא
  ידרוס היסטוריה; שורות המע"מ נרשמות לחשבון `vat_output`.
- נקודת החיוב: בעת התשלום (order_paid), בהתאם לכלל מס של שירותים על בסיס מזומן. לכן
  אין חשבון deferred revenue בתרשים: ההכנסה והמע"מ מוכרים במלואם בעת הסליקה, ומימוש,
  פקיעה או אי-מימוש של קופון אינם משנים אותם (breakage, החלטת D-EXPIRY). זהו גם הפישוט
  שהמפרט כופה בכך שרשימת החשבונות אינה כוללת חשבון דחוי. פריט פתוח לרואה חשבון: הוצאת
  תעודת זיכוי במקרי refund נעשית מחוץ ל-ledger (מערכת חשבוניות), ה-ledger רק רושם את
  היפוך הסכומים.

## 5. כללי רישום (posting rules) לכל אירוע

מוסכמות: כל הסכומים באגורות. D = debit (חיובי), C = credit (שלילי). `P` = הסכום שנגבה
באתר, `F` = ערך נקוב, `comm` = עמלה ברוטו, `net`/`vat` לפי נוסחת סעיף 4, `W` = ארנק
שהוחל בהזמנה. האחוזים תמיד מצילומי `order_items` (`platform_bp` וכו'), לעולם לא
מ-`products` בזמן הרישום. `event_key` הוא מפתח ה-idempotency של ה-journal.

| אירוע | event_type | שורות | event_key |
|---|---|---|---|
| הזמנה שולמה, פריט קופון (נגבה באתר רק `P = round(F * platform_bp / 10000)`) | `order_paid` | D `cardcom_clearing` (P - W); D `customer_wallet` W; C `platform_revenue` net(P); C `vat_output` vat(P) | `order:<order_id>:paid` |
| הזמנה שולמה, פריט פיזי (נגבה באתר `F` במלואו, `comm = round(F * platform_bp / 10000)`) | `order_paid` | D `cardcom_clearing` (F - W); D `customer_wallet` W; C `supplier_payable` (F - comm); C `platform_revenue` net(comm); C `vat_output` vat(comm) | `order:<order_id>:paid` |
| קופון הונפק | `coupon_issued` | אין שורות כספיות (journal תיעודי אופציונלי). הכסף כבר נרשם ב-order_paid; ההנפקה לא יוצרת נכס או התחייבות של הפלטפורמה | `coupon:<coupon_code_id>:issued` |
| קופון מומש בעסק | `coupon_redeemed` | אין שורות כספיות. אין תנועת כסף פלטפורמה במימוש (מודל ללא escrow); היתרה נגבית אצל הספק במזומן שלו | `coupon:<coupon_code_id>:redeemed` |
| קופון פקע | `coupon_expired` | אין שורות כספיות. ההכנסה כבר הוכרה בתשלום; פקיעה היא breakage | `coupon:<coupon_code_id>:expired` |
| settlement פיזי שולם לספק (batch מאושר, סכום `S = net_due_agorot`) | `physical_settled` | D `supplier_payable` S; C `cardcom_clearing` S | `settlement:<batch_id>:paid` |
| refund מלא של פריט קופון לא ממומש (החזר `P` לכרטיס) | `refund` | D `platform_revenue` net(P); D `vat_output` vat(P); C `cardcom_clearing` P | `refund:<payment_id>:<n>` |
| refund של פריט פיזי לפני תשלום לספק | `refund` | D `supplier_payable` (F - comm); D `platform_revenue` net(comm); D `vat_output` vat(comm); C `cardcom_clearing` F | `refund:<payment_id>:<n>` |
| refund אחרי שהספק כבר שולם | `refund` | כמו למעלה, אבל ה-debit על `supplier_payable` מוריד את החשבון מתחת לאפס; היתרה השלילית מתקזזת כשורת adjustment שלילית ב-settlement הבא | `refund:<payment_id>:<n>` |
| refund שהוחזר לארנק (בהסכמה) במקום לכרטיס | `refund` | במקום C `cardcom_clearing`: C `customer_wallet` בסכום המוחזר | `refund:<payment_id>:<n>` |
| chargeback (הבנק משך `F` או `P`) | `chargeback` | כמו refund מלא של אותו פריט, בתוספת רישום עמלת chargeback אם קיימת: D `platform_revenue` fee; C `cardcom_clearing` fee | `chargeback:<payment_id>:<dispute_id>` |
| קאשבק ארנק נצבר (סכום `B`, לפי `cashback_bp` מצילום order_items) | `wallet_cashback_earned` | D `platform_revenue` B (contra revenue: הטבת שיווק מקטינה הכנסה נטו; המפרט אינו כולל חשבון הוצאה נפרד); C `customer_wallet` B | `order:<order_id>:cashback` |
| ארנק הוצא בקנייה | `wallet_spent` | אין journal נפרד: שורת D `customer_wallet` W בתוך ה-order_paid של ההזמנה המשלמת (הארנק מחליף חלק מהמזומן; ההכנסה מוכרת במלואה והפלטפורמה סופגת את ההנחה). ה-event שמור ב-enum לרישומי spend עצמאיים אם יידרשו | `order:<order_id>:spend` |
| פקיעת יתרת ארנק (מדיניות עתידית) | `wallet_expired` | D `customer_wallet` B; C `platform_revenue` B | `wallet:<user_id>:expire:<period>` |
| תיקון ידני / היפוך | `reversal` | שורות הפוכות אחת לאחת ל-journal המקורי; `reverses_journal_id` חובה | `reversal:<journal_id>` |

בדיקת איזון על הדוגמאות: קופון F=10000, platform_bp=1000: P=1000; שורות
+1000, -855, -145 = 0. פיזי F=10000, comm=1000: +10000, -9000, -855, -145 = 0.

## 6. ארנק כהתחייבות

יתרת הארנק של לקוח היא התחייבות של הפלטפורמה כלפיו. היא נצברת דרך
`wallet_cashback_earned`, קטנה דרך שורות spend, ולעולם אינה נמשכת לבנק או לכרטיס
(אין posting rule כזה בכוונה). הטבלאות התפעוליות (`wallet_balances`,
`wallet_accounts` + `wallet_entries` מ-046) הן cache תפעולי; מקור האמת החשבונאי הוא
סכום השורות על חשבון `customer_wallet` של המשתמש ב-ledger, ובדיקת ה-drift ביניהם היא
INV-2 ב-INVARIANTS.md. איחוד שתי מערכות הארנק התפעוליות למערכת אחת הוא פריט ניקוי עתידי.

## 7. Idempotency (מיגרציה 052)

טבלת `idempotency_keys` גנרית לשכבת השרת: `(scope, key)` ייחודי, `response_hash`
להשוואת replay, `expires_at` לניקוי. משלימה, לא מחליפה, את מפתחות ה-idempotency
הייעודיים שכבר קיימים (`payments.idempotency_key`, `ledger_journals.event_key`,
unique על webhook events). ניקוי: מחיקת שורות שפגו מגובה באינדקס על `expires_at`;
ההנחיה המלאה בקובץ המיגרציה (pg_cron או scheduled function, אין מחיקה מקוד request).

## 8. מימוש קופון חד-פעמי (מיגרציה 053)

- ה-enum בעץ הזה הוא `coupon_status: issued / used / expired / refunded` (אין 'active').
- claim בטוח מפני מרוץ, שאילתת ה-CAS הקנונית:
  `UPDATE coupon_codes SET status = 'used', ... WHERE code = $1 AND supplier_id = $2 AND status = 'issued' AND expires_at > now() RETURNING *;`
  שני סורקים מקבילים: המפסיד רואה 0 שורות ומקבל `already_used`.
- `redeemed_by_merchant_user_id` נוסף ל-`coupon_codes` לתיעוד מי מימש.
- אינדקס unique חלקי `ON coupon_codes (code) WHERE status = 'used'` מבטיח שלכל code יש
  לכל היותר שורת מימוש אחת גם אם ייחודיות ה-code הגלובלית תוחלש בעתיד (הנפקה מחדש).
- הגנת עומק: unique על `coupon_redemptions.coupon_code_id` (מימוש אחד לכל קופון) וטריגר
  מעברי סטטוס שחוסם כל יציאה ממצב סופי (`used`, `expired`, `refunded`).

## 9. Settlement פר ספק (מיגרציה 054)

- `settlement_batches`: תקופה פר ספק, סטטוס `draft / pending_approval / approved / paid /
  cancelled`, סכומי סיכום באגורות, קישור ל-journal של התשלום.
- `settlement_items`: שורה לכל `order_item` פיזי זכאי, unique על `order_item_id` (פריט
  לא ייכנס לשני batches). העמודות `platform_bp`, `gross_agorot`, `commission_agorot`,
  `net_agorot` מצולמות אך ורק מ-`order_items`; פונקציית הבנייה
  `fn_build_settlement_batch` לא עושה join ל-`products` בכלל, כך שהכלל הנעול נאכף בקוד
  היחיד שמייצר שורות. CHECK של שימור: `gross = commission + net`.
- טריגר `trg_order_items_snapshot_lock` (מוגדר ב-054) נועל את עמודות הצילום של
  `order_items` אחרי שההזמנה שולמה, כך שצילום ה-settlement תמיד שווה לצילום הרכישה.

## 10. Reconciliation (מיגרציה 055)

- `reconciliation_runs`: ריצה של job בדיקה (`run_type` כגון `ledger_balance`,
  `wallet_drift`, `cardcom_deposits`, `coupon_single_use`, `settlement_totals`), סטטוס,
  מונים.
- `reconciliation_discrepancies`: פער שנמצא: ישות, צפוי מול בפועל באגורות, חומרה,
  שדות resolution. השאילתות של INVARIANTS.md הן בדיוק מה שה-jobs מריצים; שורה מפרה
  אחת = שורת discrepancy אחת.

## 11. Runoff של escrow הישן (047)

מיגרציה 047 יצרה `escrow_holds` ו-`split_executions` וסטטוסי settlement עם escrow.
ההחלטה הנעולה: אין escrow. הטיפול:

1. אין כתיבה חדשה: קוד ההמשך לא יוצר יותר escrow_holds; מסלול הקופון החדש רושם הכל
   ב-order_paid בלבד.
2. שורות `escrow_holds` חיות במצב `held` מנוקזות עסקית (מימוש, פקיעה או refund של
   הקופון שלהן) עד שהטבלה ריקה ממצבים פתוחים.
3. `split_executions` נשארת כרשומת claim היסטורית לקריאה בלבד; המידע שלה חופף לצילומי
   `order_items` ול-journal.
4. מיגרציית פרישה עתידית (אחרי אימות שאין שורות פתוחות, מחוץ לסדרה הזו) תעביר את
   הטבלאות ל-schema ארכיון או תמחק אותן, יחד עם ניקוי ערכי enum של escrow
   מ-`settlement_status` ועם מחיקת עמודות `*_legacy` של 051.

## 12. רשימת cutover (מחוץ לתחום הקבצים כאן, חובה לפני apply)

- קוד השרת (checkout, finalize, redeem) עובר לקרוא ולכתוב עמודות `*_agorot` ו-`*_bp`.
- פונקציות SQL קיימות שקוראות עמודות בשמן הישן (למשל `product_platform_percent`,
  פונקציות ה-settlement של 027) נשברות אחרי ה-rename; מיגרציה 057 מגדירה מחדש את
  `product_platform_percent` ומוסיפה `product_platform_bp`, אבל את פונקציות 027 הישנות
  יש להגדיר מחדש או להוציא משימוש במיגרציית הניקוי.
- Drizzle types וה-views האנליטיים (033, 034) מסונכרנים מחדש אחרי ההמרה.
- ה-jobs של reconciliation נרשמים כ-cron והשאילתות של INVARIANTS.md נכנסות ל-CI.
