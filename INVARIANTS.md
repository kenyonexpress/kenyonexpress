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

## הערות הפעלה

- כל שאילתה עצמאית וקריאה בלבד; מותר להריץ בכל עת, כולל בשעות שיא.
- ב-CI: שלב שמריץ כל שאילתה מול מסד staging; שורה אחת = כישלון build.
- ב-runtime: ה-jobs של 055 רושמים ריצה ב-`reconciliation_runs` וכל שורה מפרה
  ב-`reconciliation_discrepancies` עם `entity_table`, `entity_id` והפרשי אגורות.
- הבדיקות של ה-ledger (INV-1, INV-2) הן ההגנה מפני regression בטריגרים של 050;
  אסור להסיר אותן גם אחרי שהטריגרים מוכחים כיציבים.
