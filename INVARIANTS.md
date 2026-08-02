# INVARIANTS: בדיקות שלמות כספית ברות-הרצה

כל אינווריאנט מנוסח כשאילתת SQL שמחזירה את השורות המפרות: תוצאה ריקה = עובר.
השאילתות מיועדות לרוץ כמות שהן על מסד שהוחלו עליו מיגרציות 050 עד 056, והן בדיוק
מה שה-jobs של reconciliation (מיגרציה 055) מריצים: כל שורה מפרה הופכת לשורת
`reconciliation_discrepancies` עם ה-`run_type` המצוין. בהמשך השאילתות נכנסות ל-CI
(שלב בדיקה שמריץ כל שאילתה ונכשל אם חזרה שורה כלשהי).

## INV-1: כל journal מאוזן לאפס

סכום `amount_agorot` (debit חיובי, credit שלילי) על כל שורות ה-journal חייב להיות
אפס. נאכף בזמן ריצה על ידי ה-constraint trigger מ-050; הבדיקה כאן מוודאת שאין
עקיפה (למשל טעינת נתונים עם triggers כבויים). `run_type = 'ledger_balance'`.

```sql
SELECT j.id AS journal_id,
       j.event_type,
       j.event_key,
       COALESCE(sum(l.amount_agorot), 0) AS journal_sum_agorot
FROM public.ledger_journals j
LEFT JOIN public.ledger_journal_lines l ON l.journal_id = j.id
GROUP BY j.id, j.event_type, j.event_key
HAVING COALESCE(sum(l.amount_agorot), 0) <> 0;
```

## INV-2: יתרת ארנק שווה לסכום שורות ה-ledger של המשתמש

חשבון `customer_wallet` הוא התחייבות (credit-normal): היתרה החיובית של הלקוח היא
מינוס הסכום החתום של השורות. ה-cache התפעולי (`wallet_balances.balance_agorot`)
חייב להשתוות אליו בדיוק. `run_type = 'wallet_drift'`, חומרה critical (R9).

```sql
SELECT a.user_id,
       wb.balance_agorot            AS cached_balance_agorot,
       -COALESCE(sum(l.amount_agorot), 0) AS ledger_balance_agorot,
       wb.balance_agorot - (-COALESCE(sum(l.amount_agorot), 0)) AS drift_agorot
FROM public.ledger_accounts a
JOIN public.wallet_balances wb ON wb.user_id = a.user_id
LEFT JOIN public.ledger_journal_lines l ON l.account_id = a.id
WHERE a.kind = 'customer_wallet'::public.ledger_account_kind
GROUP BY a.user_id, wb.balance_agorot
HAVING wb.balance_agorot IS DISTINCT FROM -COALESCE(sum(l.amount_agorot), 0);
```

בדיקה משלימה: משתמש עם יתרת cache ובלי חשבון ledger בכלל.

```sql
SELECT wb.user_id, wb.balance_agorot
FROM public.wallet_balances wb
WHERE COALESCE(wb.balance_agorot, 0) <> 0
  AND NOT EXISTS (
    SELECT 1 FROM public.ledger_accounts a
    WHERE a.kind = 'customer_wallet'::public.ledger_account_kind
      AND a.user_id = wb.user_id
  );
```

## INV-3: צילומי האחוזים של order_items קפואים אחרי תשלום

שני חלקים. `run_type = 'snapshot_drift'`.

חלק א, בדיקת קיום הטריגר: הנעילה נאכפת על ידי `trg_order_items_snapshot_lock`
(מיגרציה 054). השאילתה מחזירה שורה אם הטריגר חסר או כבוי, וזו הפרה בפני עצמה.

```sql
SELECT 'trg_order_items_snapshot_lock' AS missing_or_disabled_trigger
WHERE NOT EXISTS (
  SELECT 1
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'order_items'
    AND t.tgname = 'trg_order_items_snapshot_lock'
    AND NOT t.tgisinternal
    AND t.tgenabled <> 'D'
);
```

חלק ב, שאילתת drift: הצילום שנחתם בפריטי settlement (שהועתק בזמן בניית ה-batch)
חייב להיות שווה לצילום הנוכחי ב-order_items; פער מוכיח ששדה שונה אחרי התשלום
או שה-builder לא קרא מ-order_items. אותה בדיקה גם מול קופונים שהונפקו.

```sql
SELECT si.id AS settlement_item_id,
       si.order_item_id,
       si.platform_bp AS settled_platform_bp,
       COALESCE(oi.platform_bp, oi.commission_bp) AS current_platform_bp
FROM public.settlement_items si
JOIN public.order_items oi ON oi.id = si.order_item_id
WHERE si.platform_bp IS DISTINCT FROM COALESCE(oi.platform_bp, oi.commission_bp);
```

```sql
SELECT cc.id AS coupon_code_id,
       cc.order_item_id,
       cc.platform_bp AS coupon_platform_bp,
       oi.platform_bp AS item_platform_bp
FROM public.coupon_codes cc
JOIN public.order_items oi ON oi.id = cc.order_item_id
WHERE cc.platform_bp IS NOT NULL
  AND oi.platform_bp IS NOT NULL
  AND cc.platform_bp IS DISTINCT FROM oi.platform_bp;
```

## INV-4: קופון ממומש לכל היותר פעם אחת

שלוש שאילתות. `run_type = 'coupon_single_use'`.

מימושים כפולים (אמור להיות בלתי אפשרי בגלל unique על `coupon_code_id`; הבדיקה
מגנה מפני טעינה עם constraints כבויים):

```sql
SELECT cr.coupon_code_id, count(*) AS redemption_rows
FROM public.coupon_redemptions cr
GROUP BY cr.coupon_code_id
HAVING count(*) > 1;
```

קופון במצב `used` בלי עדות מימוש עקבית:

```sql
SELECT cc.id AS coupon_code_id, cc.code, cc.status, cc.redeemed_at
FROM public.coupon_codes cc
WHERE cc.status = 'used'::public.coupon_status
  AND (cc.redeemed_at IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM public.coupon_redemptions cr
         WHERE cr.coupon_code_id = cc.id
       ));
```

שורת מימוש לקופון שאינו `used` (מימוש של קופון פקוע/מוחזר/מונפק):

```sql
SELECT cr.id AS redemption_id, cr.coupon_code_id, cc.status
FROM public.coupon_redemptions cr
JOIN public.coupon_codes cc ON cc.id = cr.coupon_code_id
WHERE cc.status <> 'used'::public.coupon_status;
```

## INV-5: סכומי settlement שווים לסכום חלקי ה-order_items

שני חלקים. `run_type = 'settlement_totals'`.

חלק א, סיכומי batch מול השורות שלו:

```sql
SELECT b.id AS batch_id,
       b.gross_agorot      AS batch_gross,
       s.sum_gross,
       b.commission_agorot AS batch_commission,
       s.sum_commission,
       b.net_due_agorot    AS batch_net_due,
       s.sum_net,
       b.item_count,
       s.cnt
FROM public.settlement_batches b
LEFT JOIN (
  SELECT batch_id,
         COALESCE(sum(gross_agorot), 0)      AS sum_gross,
         COALESCE(sum(commission_agorot), 0) AS sum_commission,
         COALESCE(sum(net_agorot), 0)        AS sum_net,
         count(*)                            AS cnt
  FROM public.settlement_items
  GROUP BY batch_id
) s ON s.batch_id = b.id
WHERE b.gross_agorot      IS DISTINCT FROM COALESCE(s.sum_gross, 0)
   OR b.commission_agorot IS DISTINCT FROM COALESCE(s.sum_commission, 0)
   OR b.net_due_agorot    IS DISTINCT FROM COALESCE(s.sum_net, 0)
   OR b.item_count        IS DISTINCT FROM COALESCE(s.cnt, 0);
```

חלק ב, כל שורת settlement מול חלקי ה-order_item שלה (המקור הבלעדי): הברוטו,
העמלה לפי ה-bp המצולם, ושימור gross = commission + net.

```sql
SELECT si.id AS settlement_item_id,
       si.order_item_id,
       si.gross_agorot,
       t.expected_gross,
       si.commission_agorot,
       t.expected_commission,
       si.net_agorot
FROM public.settlement_items si
JOIN public.order_items oi ON oi.id = si.order_item_id
CROSS JOIN LATERAL (
  SELECT
    COALESCE(oi.total_price_agorot, oi.face_value_agorot,
             oi.unit_price_agorot * oi.quantity)::integer AS expected_gross,
    COALESCE(
      oi.platform_fee_agorot,
      round(COALESCE(oi.total_price_agorot, oi.face_value_agorot,
                     oi.unit_price_agorot * oi.quantity)::numeric
            * COALESCE(oi.platform_bp, oi.commission_bp) / 10000)
    )::integer AS expected_commission
) t
WHERE si.gross_agorot      IS DISTINCT FROM t.expected_gross
   OR si.commission_agorot IS DISTINCT FROM t.expected_commission
   OR si.net_agorot        IS DISTINCT FROM (si.gross_agorot - si.commission_agorot);
```

## INV-6: webhook של Cardcom אידמפוטנטי, אין חיוב כפול

שלוש שאילתות. `run_type = 'webhook_idempotent'`. המטרה: לוודא שאירוע webhook יחיד
מסליק לכל היותר חיוב אחד, ושהזמנה ששולמה נשענת על עדות מאומתת.

אירוע webhook כפול (אמור להיות בלתי אפשרי בגלל unique על `(provider, external_event_id)`;
הבדיקה מגנה מפני טעינה עם constraints כבויים):

```sql
SELECT provider, external_event_id, count(*) AS event_rows
FROM public.payment_webhook_events
GROUP BY provider, external_event_id
HAVING count(*) > 1;
```

`cardcom_transaction_id` כפול בין תשלומים (עסקת Cardcom אחת מסליקה שורת payment אחת בלבד):

```sql
SELECT p.cardcom_transaction_id, count(*) AS payment_rows
FROM public.payments p
WHERE p.cardcom_transaction_id IS NOT NULL
GROUP BY p.cardcom_transaction_id
HAVING count(*) > 1;
```

הזמנה ששולמה עם יותר מחיוב charge מוצלח אחד (חיוב כפול על אותה הזמנה):

```sql
SELECT o.id AS order_id, count(*) AS succeeded_charges
FROM public.orders o
JOIN public.payments p ON p.order_id = o.id
WHERE o.paid_at IS NOT NULL
  AND p.kind = 'charge'::public.payment_kind
  AND p.status = 'succeeded'::public.payment_status
GROUP BY o.id
HAVING count(*) > 1;
```

## INV-7: אין order_items יתומים או חסרי צילום

שלוש שאילתות. `run_type = 'order_item_integrity'`. פריט הזמנה חייב הורה קיים, וכל
פריט של הזמנה ששולמה חייב את צילומי הכסף שהמערכת נשענת עליהם.

order_item בלי הזמנה הורה (FK עם CASCADE אמור למנוע; הבדיקה מגנה מפני מחיקה חלקית או
טעינה עם FK כבוי):

```sql
SELECT oi.id AS order_item_id, oi.order_id
FROM public.order_items oi
LEFT JOIN public.orders o ON o.id = oi.order_id
WHERE o.id IS NULL;
```

פריט של הזמנה ששולמה בלי צילום `platform_bp` (הצילום חייב להתקבע בזמן הרכישה,
לפני הקפאתו על ידי `trg_order_items_snapshot_lock`):

```sql
SELECT oi.id AS order_item_id, oi.order_id
FROM public.order_items oi
JOIN public.orders o ON o.id = oi.order_id
WHERE o.paid_at IS NOT NULL
  AND oi.item_status NOT IN ('cancelled'::public.order_item_status,
                             'refunded'::public.order_item_status)
  AND oi.platform_bp IS NULL;
```

פריט קופון שהונפק (`item_status = 'issued'`) בלי שורת `coupon_codes` תואמת
(finalize חייב להנפיק קוד לכל שורת קופון):

```sql
SELECT oi.id AS order_item_id, oi.order_id
FROM public.order_items oi
WHERE oi.item_status = 'issued'::public.order_item_status
  AND NOT EXISTS (
    SELECT 1 FROM public.coupon_codes cc
    WHERE cc.order_item_id = oi.id
  );
```

## INV-8: חוב הפלטפורמה לספק שווה לסכום פריטי ה-settlement

`run_type = 'supplier_payable'`, חומרה high (R8). היתרה על חשבון ה-ledger מסוג
`supplier_payable` פר ספק (התחייבות, credit-normal) חייבת להשתוות להפרש בין מה שנצבר
בזמן התשלום לבין מה שכבר שולם ב-batches שסטטוסם `paid`. המקור לצבירה הוא צילומי
`order_items` (פריטים פיזיים, `supplier_due_agorot > 0`, של הזמנות ששולמו ולא בוטלו/הוחזרו);
המקור לתשלום הוא `settlement_items` של batches ששולמו.

```sql
WITH accrued AS (
  SELECT oi.supplier_id,
         COALESCE(sum(oi.supplier_due_agorot), 0) AS accrued_agorot
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE o.paid_at IS NOT NULL
    AND oi.supplier_due_agorot > 0
    AND oi.item_status NOT IN ('cancelled'::public.order_item_status,
                               'refunded'::public.order_item_status)
  GROUP BY oi.supplier_id
),
settled AS (
  SELECT si.supplier_id,
         COALESCE(sum(si.net_agorot), 0) AS settled_agorot
  FROM public.settlement_items si
  JOIN public.settlement_batches b ON b.id = si.batch_id
  WHERE b.status = 'paid'::public.settlement_batch_status
  GROUP BY si.supplier_id
),
ledger AS (
  SELECT a.supplier_id,
         -COALESCE(sum(l.amount_agorot), 0) AS payable_balance_agorot
  FROM public.ledger_accounts a
  LEFT JOIN public.ledger_journal_lines l ON l.account_id = a.id
  WHERE a.kind = 'supplier_payable'::public.ledger_account_kind
  GROUP BY a.supplier_id
)
SELECT s.supplier_id,
       COALESCE(l.payable_balance_agorot, 0)                                   AS ledger_payable,
       COALESCE(ac.accrued_agorot, 0) - COALESCE(st.settled_agorot, 0)         AS expected_payable,
       COALESCE(l.payable_balance_agorot, 0)
         - (COALESCE(ac.accrued_agorot, 0) - COALESCE(st.settled_agorot, 0))   AS drift_agorot
FROM (
  SELECT supplier_id FROM accrued
  UNION SELECT supplier_id FROM settled
  UNION SELECT supplier_id FROM ledger
) s
LEFT JOIN accrued ac ON ac.supplier_id = s.supplier_id
LEFT JOIN settled st ON st.supplier_id = s.supplier_id
LEFT JOIN ledger  l  ON l.supplier_id  = s.supplier_id
WHERE COALESCE(l.payable_balance_agorot, 0)
      IS DISTINCT FROM (COALESCE(ac.accrued_agorot, 0) - COALESCE(st.settled_agorot, 0));
```

בדיקה משלימה כבר קיימת ב-INV-5 (סכומי batch = סכום פריטיו, ופריט = חלקי ה-order_item):
INV-8 סוגר את הלולאה מול ה-ledger, כך שהשרשרת order_items → settlement_items → ledger
נבדקת מקצה לקצה.

## הרצה ב-CI ושערי pre-deploy

### מיפוי אינווריאנט ל-run_type

| INV | run_type | חומרה | מקור אמת |
|---|---|---|---|
| INV-1 | `ledger_balance` | critical | טריגר sum-zero (050) |
| INV-2 | `wallet_drift` | critical | ledger מול `wallet_balances` |
| INV-3 | `snapshot_drift` | high | `trg_order_items_snapshot_lock` (054) |
| INV-4 | `coupon_single_use` | high | CAS + unique (053) |
| INV-5 | `settlement_totals` | high | `settlement_items` מול `order_items` |
| INV-6 | `webhook_idempotent` | high | unique webhook + `cardcom_transaction_id` |
| INV-7 | `order_item_integrity` | high | FK + צילומי order_items |
| INV-8 | `supplier_payable` | high | order_items → settlement_items → ledger |

### שלב CI (חובה לפני merge לענף שמגיע ל-production)

- job בשם `invariants` מריץ כל שאילתה מול מסד staging טרי שהוחלו עליו 050–056 + נתוני
  seed של מסלול תשלום מלא (הזמנה שולמה, קופון הונפק ומומש, batch נבנה ושולם).
- כל שאילתה שמחזירה שורה אחת או יותר = `exit 1` = כישלון build. הפלט מודפס עם ה-`run_type`
  ושורות ההפרה כדי לאתר את המקור.
- הבדיקות של ה-ledger (INV-1, INV-2, INV-6, INV-8) הן ההגנה מפני regression בטריגרים
  ובפונקציות הרישום; אסור להסיר אותן גם אחרי שהטריגרים מוכחים כיציבים.

### שער pre-deploy (חובה לפני apply של כל מיגרציה מהסדרה על production)

- להריץ את כל האינווריאנטים מול snapshot של production (או replica). תוצאה לא-ריקה
  חוסמת את ה-deploy עד לפתרון או להחלטת super_admin מתועדת.
- סדר הרצה תלוי-מיגרציה (ראה `MIGRATIONS-040-050.md §4`): INV-4 לפני 053, INV-3+INV-5
  אחרי 054, INV-1 אחרי 050. INV-2, INV-6, INV-8 רצים בכל שער.

### הרצה ב-runtime

- ה-jobs של 055 (nightly + on-demand) רושמים ריצה ב-`reconciliation_runs` וכל שורה מפרה
  ב-`reconciliation_discrepancies` עם `entity_table`, `entity_id`, `expected_agorot`,
  `actual_agorot` ו-`delta_agorot`. `wallet_drift` (INV-2) הוא SEV1 עם התראה מיידית.
- כל שאילתה עצמאית וקריאה בלבד; מותר להריץ בכל עת, כולל בשעות שיא.
